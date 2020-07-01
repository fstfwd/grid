import React, {
  useCallback,
  useRef,
  useMemo,
  useEffect,
  memo,
  useImperativeHandle,
  forwardRef,
  useState
} from "react";
import Grid, {
  RendererProps,
  useSelection,
  GridRef,
  useEditable,
  useCopyPaste,
  CellInterface,
  SelectionArea,
  ScrollCoords,
  AreaProps,
  StylingProps,
  useSizer as useAutoSizer
} from "@rowsncolumns/grid";
import { debounce } from "@rowsncolumns/grid/dist/helpers";
import {
  ThemeProvider,
  ColorModeProvider,
  useColorMode
} from "@chakra-ui/core";
import {
  COLUMN_HEADER_WIDTH,
  DEFAULT_COLUMN_WIDTH,
  ROW_HEADER_HEIGHT,
  DEFAULT_ROW_HEIGHT,
  DARK_MODE_COLOR_LIGHT,
  DARK_MODE_COLOR,
  HEADER_BORDER_COLOR,
  CELL_BORDER_COLOR
} from "./../constants";
import HeaderCell from "./../HeaderCell";
import Cell from "./../Cell";
import { GridWrapper, ThemeType } from "./../styled";
import { Cells, CellConfig, SizeType } from "../Spreadsheet";
import { Direction } from "@rowsncolumns/grid/dist/types";
import {
  DATATYPE,
  CellDataFormatting,
  AXIS,
  STROKE_FORMATTING
} from "../types";
import Editor from "./../Editor";
import ContextMenu from "./../ContextMenu";

export interface SheetGridProps {
  theme?: ThemeType;
  minColumnWidth?: number;
  minRowHeight?: number;
  rowCount?: number;
  columnCount?: number;
  CellRenderer?: React.FC<RendererProps>;
  HeaderCellRenderer?: React.FC<RendererProps>;
  width?: number;
  height?: number;
  cells: Cells;
  onChange: (changes: Cells) => void;
  onFill?: (
    activeCell: CellInterface,
    currentSelection: SelectionArea | null,
    selections: SelectionArea[]
  ) => void;
  activeCell: CellInterface | null;
  selections: SelectionArea[];
  onSheetChange: (props: any) => void;
  selectedSheet: string;
  onScroll: (state: ScrollCoords) => void;
  scrollState: ScrollCoords;
  onActiveCellChange: (cell: CellInterface | null, value?: string) => void;
  onActiveCellValueChange: (value: string) => void;
  onDelete?: (activeCell: CellInterface, selections: SelectionArea[]) => void;
  format?: (
    value: string,
    datatype?: DATATYPE,
    formatting?: CellDataFormatting
  ) => string;
  onResize?: (axis: AXIS, index: number, dimension: number) => void;
  columnSizes?: SizeType;
  rowSizes?: SizeType;
  mergedCells?: AreaProps[];
  borderStyles?: StylingProps;
  frozenRows?: number;
  frozenColumns?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  hiddenRows?: number[];
  hiddenColumns?: number[];
  onPaste?: (
    rows: (string | null)[][],
    activeCell: CellInterface | null
  ) => void;
  onCut?: (selection: SelectionArea) => void;
  onInsertRow?: (
    cell: CellInterface | null,
    selections: SelectionArea[]
  ) => void;
  onDeleteRow?: (
    cell: CellInterface | null,
    selections: SelectionArea[]
  ) => void;
  onInsertColumn?: (
    cell: CellInterface | null,
    selections: SelectionArea[]
  ) => void;
  onDeleteColumn?: (
    cell: CellInterface | null,
    selections: SelectionArea[]
  ) => void;
}

export interface RowColSelection {
  rows: number[];
  cols: number[];
}

export type RefAttributeGrid = {
  ref?: React.MutableRefObject<WorkbookGridRef | null>;
};

export type WorkbookGridRef = {
  getNextFocusableCell: (
    cell: CellInterface,
    direction: Direction
  ) => CellInterface | null;
  setActiveCell: (cell: CellInterface | null) => void;
  setSelections: (selection: SelectionArea[]) => void;
  focus: () => void;
  makeEditable: (cell: CellInterface, value?: string, focus?: boolean) => void;
  setEditorValue: (value: string, activeCell: CellInterface) => void;
  hideEditor: () => void;
  submitEditor: (
    value: string,
    activeCell: CellInterface,
    nextActiveCell?: CellInterface | null
  ) => void;
  cancelEditor: () => void;
  resizeColumns?: (indices: number[]) => void;
  resizeRows?: (indices: number[]) => void;
  getCellBounds?: (coords: CellInterface) => AreaProps;
  getScrollPosition?: () => ScrollCoords;
};

export interface ContextMenuProps {
  left: number;
  top: number;
}

const strokeValues = Object.values(STROKE_FORMATTING);
/**
 * Grid component
 * @param props
 */
const SheetGrid: React.FC<SheetGridProps & RefAttributeGrid> = memo(
  forwardRef((props, forwardedRef) => {
    const {
      theme,
      minColumnWidth = DEFAULT_COLUMN_WIDTH,
      minRowHeight = DEFAULT_ROW_HEIGHT,
      rowCount = 1000,
      columnCount = 1000,
      width,
      height,
      CellRenderer = Cell,
      HeaderCellRenderer = HeaderCell,
      cells,
      onChange,
      onFill,
      onSheetChange,
      activeCell: initialActiveCell,
      selections: initialSelections = [],
      selectedSheet,
      onScroll,
      scrollState,
      onActiveCellChange,
      onActiveCellValueChange,
      onDelete,
      format,
      onResize,
      columnSizes = {},
      rowSizes = {},
      mergedCells,
      borderStyles,
      frozenRows = 0,
      frozenColumns = 0,
      onKeyDown,
      hiddenColumns,
      hiddenRows,
      onPaste,
      onCut,
      onInsertRow,
      onInsertColumn,
      onDeleteColumn,
      onDeleteRow
    } = props;
    const gridRef = useRef<GridRef | null>(null);
    const { colorMode } = useColorMode();
    const isLightMode = colorMode === "light";
    const onSheetChangeRef = useRef(debounce(onSheetChange, 100));
    const actualFrozenRows = Math.max(1, frozenRows + 1);
    const actualFrozenColumns = Math.max(1, frozenColumns + 1);
    const debounceScroll = useRef(debounce(onScroll, 1000));
    const [
      contextMenuProps,
      setContextMenuProps
    ] = useState<ContextMenuProps | null>(null);

    useImperativeHandle(forwardedRef, () => {
      return {
        getNextFocusableCell,
        setActiveCell,
        setSelections,
        focus: () => gridRef.current?.focus(),
        resetAfterIndices: gridRef.current?.resetAfterIndices,
        makeEditable,
        setEditorValue: setValue,
        hideEditor,
        submitEditor,
        cancelEditor,
        resizeColumns: gridRef.current?.resizeColumns,
        resizeRows: gridRef.current?.resizeRows,
        getCellBounds: gridRef.current?.getCellBounds,
        getScrollPosition: gridRef.current?.getScrollPosition
      };
    });

    /**
     * Get cell value or text
     */
    const getValue = useCallback(
      (cell: CellInterface | null, obj = false) => {
        if (!cell) return void 0;
        const { rowIndex, columnIndex } = cell;
        return rowIndex in cells
          ? obj
            ? cells[rowIndex]?.[columnIndex]
            : cells[rowIndex]?.[columnIndex]?.text
          : void 0;
      },
      [cells]
    );

    /**
     * Column resizer
     */
    const { getColumnWidth } = useAutoSizer({
      gridRef,
      minColumnWidth,
      getValue: (cell: CellInterface) => getValue(cell, true),
      columnSizes,
      autoResize: false,
      resizeOnScroll: false
    });

    /**
     * Selection
     */
    const {
      selections,
      activeCell,
      setActiveCell,
      setSelections,
      modifySelection,
      newSelection,
      clearLastSelection,
      ...selectionProps
    } = useSelection({
      initialActiveCell,
      initialSelections,
      gridRef,
      rowCount,
      columnCount,
      onFill
    });

    /**
     * Copy paste
     */
    const { copy, paste, cut } = useCopyPaste({
      gridRef,
      selections,
      activeCell,
      getValue,
      onPaste,
      onCut
    });

    /**
     * Adjusts a column
     */
    const handleAdjustColumn = useCallback(
      (columnIndex: number) => {
        const width = getColumnWidth(columnIndex);
        onResize?.(AXIS.X, columnIndex, width);
      },
      [cells]
    );

    /**
     * Check if selections are in
     */
    useEffect(() => {
      onActiveCellChange?.(
        activeCell,
        getValue(activeCell) as string | undefined
      );
    }, [activeCell]);

    /**
     * Save it back to sheet
     */
    useEffect(() => {
      /* Batch this cos of debounce */
      onSheetChangeRef.current?.({ selections, activeCell });
    }, [activeCell, selections]);

    /**
     * If grid changes, lets restore the state
     */
    useEffect(() => {
      if (scrollState) gridRef.current?.scrollTo(scrollState);
      setActiveCell(initialActiveCell, false);
      setSelections(initialSelections);
      const rowIndices = Object.keys(rowSizes).map(Number);
      const colIndices = Object.keys(columnSizes).map(Number);
      gridRef.current?.resetAfterIndices?.({
        rowIndex: rowIndices.length ? Math.min(...rowIndices) : 0,
        columnIndex: colIndices.length ? Math.min(...colIndices) : 0
      });
    }, [selectedSheet]);

    const handleSubmit = useCallback(
      (
        value: string,
        cell: CellInterface,
        nextActiveCell?: CellInterface | null
      ) => {
        const { rowIndex, columnIndex } = cell;
        const changes = {
          [rowIndex]: {
            [columnIndex]: {
              text: value
            }
          }
        };

        onChange?.(changes);

        /* Focus on next active cell */
        if (nextActiveCell) setActiveCell(nextActiveCell, true);
      },
      [cells]
    );

    /**
     * Editable
     */
    const {
      editorComponent,
      isEditInProgress,
      nextFocusableCell,
      makeEditable,
      setValue,
      hideEditor,
      submitEditor,
      cancelEditor,
      editingCell,
      showEditor,
      ...editableProps
    } = useEditable({
      getEditor: (cell: CellInterface | null) => {
        const config = getValue(cell, true) as CellConfig;
        return props => (
          <Editor {...props} background={config?.fill} color={config?.color} />
        );
      },
      frozenRows: actualFrozenRows,
      frozenColumns: actualFrozenColumns,
      gridRef,
      selections,
      activeCell,
      onSubmit: handleSubmit,
      getValue,
      onChange: onActiveCellValueChange,
      canEdit: (cell: CellInterface) => {
        if (cell.rowIndex === 0 || cell.columnIndex === 0) return false;
        return true;
      },
      onDelete: onDelete
    });

    const getNextFocusableCell = useCallback(
      (cell: CellInterface, direction: Direction): CellInterface | null => {
        return nextFocusableCell(cell, direction);
      },
      []
    );

    /* Width calculator */
    const columnWidth = useCallback(
      (columnIndex: number) => {
        if (columnIndex === 0) return COLUMN_HEADER_WIDTH;
        if (hiddenRows?.indexOf(columnIndex) !== -1) return 0;
        return columnSizes[columnIndex] || minColumnWidth;
      },
      [minColumnWidth, columnSizes, selectedSheet]
    );
    const rowHeight = useCallback(
      (rowIndex: number) => {
        if (rowIndex === 0) return ROW_HEADER_HEIGHT;
        if (hiddenRows?.indexOf(rowIndex) !== -1) return 0;
        return rowSizes[rowIndex] || minRowHeight;
      },
      [minColumnWidth, hiddenRows, rowSizes, selectedSheet]
    );
    const contextWrapper = useCallback(
      children => {
        return (
          <ThemeProvider theme={theme}>
            <ColorModeProvider>{children}</ColorModeProvider>
          </ThemeProvider>
        );
      },
      [theme]
    );
    const selectedRowsAndCols: RowColSelection = useMemo(
      () =>
        selections.reduce(
          (acc, { bounds }) => {
            for (let i = bounds.left; i <= bounds.right; i++) {
              acc.cols.push(i);
            }
            for (let i = bounds.top; i <= bounds.bottom; i++) {
              acc.rows.push(i);
            }
            return acc;
          },
          { rows: [], cols: [] } as RowColSelection
        ),
      [selections]
    );

    const itemRenderer = useCallback(
      (props: RendererProps) => {
        const { rowIndex, columnIndex } = props;
        const isRowHeader = rowIndex === 0;
        const isColumnHeader = columnIndex === 0;
        const isHidden =
          hiddenRows?.indexOf(rowIndex) !== -1 ||
          hiddenColumns?.indexOf(columnIndex) !== -1;
        const isHeaderActive =
          isRowHeader || isColumnHeader
            ? isRowHeader
              ? activeCell?.columnIndex === columnIndex ||
                selectedRowsAndCols.cols.includes(columnIndex)
              : activeCell?.rowIndex === rowIndex ||
                selectedRowsAndCols.rows.includes(rowIndex)
            : false;
        const cell = { rowIndex, columnIndex };
        if (rowIndex === 0 || columnIndex === 0)
          return (
            <HeaderCellRenderer
              {...props}
              isHidden={isHidden}
              isActive={isHeaderActive}
              onResize={onResize}
              onAdjustColumn={handleAdjustColumn}
            />
          );
        return (
          <CellRenderer
            {...props}
            {...(getValue(cell, true) as CellConfig)}
            format={format}
            isHidden={isHidden}
          />
        );
      },
      [cells, selectedRowsAndCols, activeCell, hiddenRows, hiddenColumns]
    );

    const handleScroll = useCallback(
      (scrollState: ScrollCoords) => {
        editableProps.onScroll?.(scrollState);
        // Save scroll state in sheet
        debounceScroll.current?.(scrollState);
      },
      [selectedSheet]
    );

    /**
     * Show context menu
     */
    const showContextMenu = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        const padding = 10;
        const left = e.clientX;
        const top = e.clientY;
        const pos = gridRef.current?.getRelativePositionFromOffset(left, top);
        if (!pos) return;
        const { x, y } = pos;
        setContextMenuProps({
          left: x,
          top: y
        });
      },
      []
    );
    // const hasStroke = (value = {}) => {
    //   return Object.keys(value).some(key => key.startsWith("stroke"));
    // };

    /**
     * Hides context menu
     */
    const hideContextMenu = useCallback(() => {
      setContextMenuProps(null);
      gridRef.current?.focus();
    }, []);
    const fillhandleBorderColor = isLightMode ? "white" : DARK_MODE_COLOR_LIGHT;
    const gridLineColor = isLightMode
      ? CELL_BORDER_COLOR
      : theme?.colors.gray[600];
    const shadowStroke = isLightMode
      ? HEADER_BORDER_COLOR
      : theme?.colors.gray[600];
    return (
      <GridWrapper>
        <Grid
          shadowSettings={{
            stroke: shadowStroke
          }}
          showFrozenShadow
          gridLineColor={gridLineColor}
          showGridLines={true}
          ref={gridRef}
          rowCount={rowCount}
          columnCount={columnCount}
          columnWidth={columnWidth}
          rowHeight={rowHeight}
          width={width}
          height={height}
          itemRenderer={itemRenderer}
          wrapper={contextWrapper}
          selections={selections}
          activeCell={activeCell}
          fillhandleBorderColor={fillhandleBorderColor}
          showFillHandle={!isEditInProgress}
          mergedCells={mergedCells}
          borderStyles={borderStyles}
          frozenRows={actualFrozenRows}
          frozenColumns={actualFrozenColumns}
          {...selectionProps}
          {...editableProps}
          onScroll={handleScroll}
          onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
            selectionProps.onMouseDown(e);
            editableProps.onMouseDown(e);
            hideContextMenu();
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            selectionProps.onKeyDown(e);
            editableProps.onKeyDown(e);
            onKeyDown?.(e);
          }}
          onContextMenu={showContextMenu}
          // cellComparator={(a , b) => {
          //   const { rowIndex: ar, columnIndex: ac } = a.props
          //   const { rowIndex: br, columnIndex: bc } = a.props
          //   const aValue = getValue({rowIndex: ar, columnIndex: ac}, true)
          //   const bValue = getValue({rowIndex: br, columnIndex: bc}, true)
          //   if (aValue || bValue) {
          //     const aHasStroke = hasStroke(aValue)
          //     const bHasStroke = hasStroke(bValue)
          //     if (aHasStroke && bHasStroke) {
          //       return ar > br && ac > br
          //         ? -1
          //         : 1
          //     }
          //     if (aHasStroke || bHasStroke) return 1
          //   }
          //   return -1
          // }}
        />
        {editorComponent}
        {contextMenuProps && (
          <ContextMenu
            onRequestClose={hideContextMenu}
            activeCell={activeCell}
            selections={selections}
            onCopy={copy}
            onPaste={paste}
            onCut={cut}
            onInsertRow={onInsertRow}
            onInsertColumn={onInsertColumn}
            onDeleteColumn={onDeleteColumn}
            onDeleteRow={onDeleteRow}
            {...contextMenuProps}
          />
        )}
      </GridWrapper>
    );
  })
);

export default SheetGrid;
