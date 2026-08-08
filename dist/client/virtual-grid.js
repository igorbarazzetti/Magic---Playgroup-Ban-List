export function calculateVirtualRange({
  totalItems,
  columns,
  rowHeight,
  scrollOffset,
  viewportHeight,
  overscanRows = 3,
}) {
  const safeColumns = Math.max(1, Math.trunc(columns) || 1);
  const safeRowHeight = Math.max(1, Number(rowHeight) || 1);
  const totalRows = Math.ceil(Math.max(0, totalItems) / safeColumns);
  const currentRow = Math.max(0, Math.min(Math.max(0, totalRows - 1), Math.floor(Math.max(0, scrollOffset) / safeRowHeight)));
  const visibleRows = Math.max(1, Math.ceil(Math.max(1, viewportHeight) / safeRowHeight));
  const startRow = Math.max(0, Math.min(totalRows, currentRow - overscanRows));
  const endRow = Math.max(startRow, Math.min(totalRows, currentRow + visibleRows + overscanRows));
  return {
    startIndex: startRow * safeColumns,
    endIndex: Math.min(totalItems, endRow * safeColumns),
    before: startRow * safeRowHeight,
    after: Math.max(0, totalRows - endRow) * safeRowHeight,
    startRow,
    endRow,
    totalRows,
  };
}
