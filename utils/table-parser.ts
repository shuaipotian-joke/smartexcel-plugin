export interface ParsedTable {
  id: string;
  title: string;
  /** Last header row, one label per column (popup preview, column names). */
  headers: string[];
  /** Every header row, top to bottom; `headers` is the last one. */
  headerRows: string[][];
  rows: string[][];
  /**
   * Merged ranges in sheet coordinates: row 0 is the first header row, data
   * rows follow the header rows. Cells covered by a rowspan repeat the value
   * in `headerRows`/`rows`; colspan continuation cells are empty.
   */
  merges: Array<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  }>;
  element: HTMLElement;
  rowCount: number;
  colCount: number;
  hasCssRowNumbers: boolean;
  cssRowNumbers: string[];
  source: 'table' | 'div';
}

export interface LogicalTableBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type TableElement = HTMLElement;

export function detectTables(): TableElement[] {
  const meaningfulTables = Array.from(document.querySelectorAll('table'))
    .filter(isMeaningfulTable)
    .filter((table) => !isFixedReplicaTable(table))
    .filter((table) => !isSplitHeaderTable(table));

  const divTables = detectDivTables();
  const candidates = dedupeNestedCandidates([...meaningfulTables, ...divTables]);

  return candidates.map((table, index) => {
    if (!table.dataset.smartexcelTableId) {
      table.dataset.smartexcelTableId = `table-${index + 1}`;
    }
    return table;
  });
}

export function parseTable(table: TableElement): ParsedTable {
  ensureStableTableId(table);

  if (table.tagName.toLowerCase() !== 'table') {
    return parseDivTable(table);
  }

  const htmlTable = table as HTMLTableElement;
  const rows: string[][] = [];
  const dataRowElements: Element[] = [];
  const parsedGrid = buildParsedGrid(htmlTable);
  const { headers, headerRows, headerMerges } = resolveHeaders(htmlTable, parsedGrid);
  const colCount = Math.max(parsedGrid.colCount, headers.length);

  // Grid row -> sheet row. Header rows of this table keep their place; empty
  // data rows are dropped, so later data rows move up.
  const sheetRowOf: Array<number | undefined> = [];
  const headerOffset = headerRows.length - parsedGrid.headerRowCount;
  parsedGrid.normalizedGrid.forEach((rowData, index) => {
    if (index < parsedGrid.headerRowCount) {
      sheetRowOf[index] = index + headerOffset;
      return;
    }

    if (rowData.length > 0 && rowData.some((cell) => cell.trim() !== '')) {
      sheetRowOf[index] = headerRows.length + rows.length;
      rows.push(rowData);
      if (parsedGrid.tableRows[index]) {
        dataRowElements.push(parsedGrid.tableRows[index]);
      }
    }
  });

  const merges = [...headerMerges, ...remapMerges(parsedGrid.merges, sheetRowOf)];

  const caption = htmlTable.querySelector('caption');
  const ariaLabel = htmlTable.getAttribute('aria-label');
  const title =
    caption?.textContent?.trim() ||
    ariaLabel ||
    findNearbyHeading(htmlTable) ||
    sanitizeDocumentTitle(document.title) ||
    `Table ${htmlTable.dataset.smartexcelTableId ?? 'unknown'}`;

  const hasCssRowNumbers = detectCssRowNumbers(htmlTable);
  const cssRowNumbers = hasCssRowNumbers
    ? extractCssRowNumbers(dataRowElements)
    : [];

  return {
    id: htmlTable.dataset.smartexcelTableId ?? 'table-unknown',
    title,
    headers,
    headerRows,
    rows,
    merges,
    element: htmlTable,
    rowCount: rows.length,
    colCount,
    hasCssRowNumbers,
    cssRowNumbers,
    source: 'table',
  };
}

export function getLogicalTable(table: TableElement): TableElement {
  if (table.tagName.toLowerCase() !== 'table') {
    return table;
  }
  const htmlTable = table as HTMLTableElement;
  return findPrimaryTable(htmlTable) ?? findLinkedBodyTable(htmlTable) ?? htmlTable;
}

export function getLogicalTableBounds(table: TableElement): LogicalTableBounds {
  const logicalTable = getLogicalTable(table);
  const headerTable = logicalTable.tagName.toLowerCase() === 'table'
    ? findLinkedHeaderTable(logicalTable as HTMLTableElement, buildParsedGrid(logicalTable as HTMLTableElement).colCount)
    : null;

  const rects = [logicalTable.getBoundingClientRect()];
  if (headerTable) {
    rects.push(headerTable.getBoundingClientRect());
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function findClosestTableElement(target: HTMLElement | null): TableElement | null {
  if (!target) {
    return null;
  }

  const htmlTable = target.closest('table') as HTMLTableElement | null;
  if (htmlTable) {
    return htmlTable;
  }

  const selector = [
    '[role="table"]',
    '[role="grid"]',
    '[role="treegrid"]',
    '.ag-root',
    '.ag-root-wrapper',
    '.MuiDataGrid-root',
    '.ReactVirtualized__Table',
    '.ReactVirtualized__Grid',
    '.rdg',
    '.data-grid',
    '.datatable',
  ].join(',');

  const candidate = target.closest(selector) as HTMLElement | null;
  return candidate && isMeaningfulDivTable(candidate) ? candidate : null;
}

function buildParsedGrid(table: HTMLTableElement) {
  const merges: ParsedTable['merges'] = [];
  // Only this table's own rows: rows of nested tables belong to their cell.
  const tableRows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table
  );
  const grid: string[][] = [];
  const occupancy: boolean[][] = [];
  const groupEnds = getRowGroupEnds(tableRows);

  tableRows.forEach((row, rowIndex) => {
    if (!grid[rowIndex]) {
      grid[rowIndex] = [];
    }

    const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td'));
    let colIndex = 0;
    cells.forEach((cell) => {
      while (occupancy[rowIndex]?.[colIndex]) {
        colIndex += 1;
      }

      const cellText = getCellText(cell as HTMLElement);
      const colspan = Math.max(1, Number.parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      // A rowspan never leaves its row group (thead/tbody/tfoot); 0 means
      // "to the end of the group", as in HTML.
      const rowsLeftInGroup = groupEnds[rowIndex] - rowIndex + 1;
      const requestedRowspan = Number.parseInt(cell.getAttribute('rowspan') || '1', 10);
      const rowspan = requestedRowspan === 0
        ? rowsLeftInGroup
        : Math.min(Math.max(1, requestedRowspan || 1), rowsLeftInGroup);

      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        if (!grid[targetRow]) {
          grid[targetRow] = [];
        }
        if (!occupancy[targetRow]) {
          occupancy[targetRow] = [];
        }

        for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
          const targetCol = colIndex + colOffset;
          occupancy[targetRow][targetCol] = true;
          grid[targetRow][targetCol] = colOffset === 0 ? cellText : '';
        }
      }

      if (rowspan > 1 || colspan > 1) {
        merges.push({
          startRow: rowIndex,
          endRow: rowIndex + rowspan - 1,
          startCol: colIndex,
          endCol: colIndex + colspan - 1,
        });
      }

      colIndex += colspan;
    });
  });

  const colCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizedGrid = grid.map((row) =>
    Array.from({ length: colCount }, (_, index) => row[index] ?? '')
  );

  // Header rows: the leading <thead> rows; without a <thead>, a first row made
  // of <th> cells, allowing an empty <td> corner (a <th> row header next to
  // data cells in a body row is data).
  let headerRowCount = 0;
  while (tableRows[headerRowCount]?.parentElement?.tagName === 'THEAD') {
    headerRowCount += 1;
  }
  if (headerRowCount === 0 && tableRows[0]) {
    const firstCells = Array.from(tableRows[0].querySelectorAll(':scope > th, :scope > td'));
    const isHeaderLike = firstCells.some((cell) => cell.tagName === 'TH') &&
      firstCells.every((cell) => cell.tagName === 'TH' || getCellText(cell as HTMLElement) === '');
    if (isHeaderLike) {
      headerRowCount = 1;
    }
  }

  return {
    merges,
    tableRows,
    normalizedGrid,
    headerRowCount,
    colCount,
  };
}

/** For each row, the index of the last row in the same row group. */
function getRowGroupEnds(rows: Element[]): number[] {
  const ends: number[] = [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const next = rows[index + 1];
    ends[index] = next && next.parentElement === rows[index].parentElement
      ? ends[index + 1]
      : index;
  }
  return ends;
}

/** Moves merges to new row indices; rows mapped to `undefined` were dropped. */
function remapMerges(
  merges: ParsedTable['merges'],
  rowMap: Array<number | undefined>
): ParsedTable['merges'] {
  return merges
    .map((merge) => {
      const kept: number[] = [];
      for (let row = merge.startRow; row <= merge.endRow; row += 1) {
        const mapped = rowMap[row];
        if (mapped !== undefined) {
          kept.push(mapped);
        }
      }
      if (kept.length === 0) {
        return null;
      }
      return {
        startRow: kept[0],
        endRow: kept[kept.length - 1],
        startCol: merge.startCol,
        endCol: merge.endCol,
      };
    })
    .filter((merge): merge is NonNullable<typeof merge> =>
      merge !== null && (merge.endRow > merge.startRow || merge.endCol > merge.startCol)
    );
}

function resolveHeaders(
  table: HTMLTableElement,
  parsedGrid: ReturnType<typeof buildParsedGrid>
): { headers: string[]; headerRows: string[][]; headerMerges: ParsedTable['merges'] } {
  if (parsedGrid.headerRowCount > 0) {
    const headerRows = parsedGrid.normalizedGrid
      .slice(0, parsedGrid.headerRowCount)
      .map((row) => [...(row ?? [])]);
    return {
      headers: [...headerRows[headerRows.length - 1]],
      headerRows,
      // The table's own header merges are remapped with its data rows.
      headerMerges: [],
    };
  }

  const headerTable = findLinkedHeaderTable(table, parsedGrid.colCount);
  if (!headerTable) {
    return { headers: [], headerRows: [], headerMerges: [] };
  }

  // Split header (e.g. Element UI): the header lives in its own <table>.
  const headerGrid = buildParsedGrid(headerTable);
  const rowMap: Array<number | undefined> = [];
  let headerRows: string[][];
  if (headerGrid.headerRowCount > 0) {
    headerRows = headerGrid.normalizedGrid.slice(0, headerGrid.headerRowCount);
    headerRows.forEach((_, index) => {
      rowMap[index] = index;
    });
  } else {
    const lastIndex = headerGrid.normalizedGrid.length - 1;
    headerRows = lastIndex >= 0 ? [headerGrid.normalizedGrid[lastIndex]] : [];
    rowMap[lastIndex] = 0;
  }
  headerRows = headerRows.map((row) => [...(row ?? [])]);

  return {
    headers: [...(headerRows[headerRows.length - 1] ?? [])],
    headerRows,
    headerMerges: remapMerges(headerGrid.merges, rowMap),
  };
}

function findLinkedHeaderTable(
  table: HTMLTableElement,
  targetColCount: number
): HTMLTableElement | null {
  const primaryTable = findPrimaryTable(table);
  const tableRoot = getElTableRoot(primaryTable ?? table);
  const primaryHeader = tableRoot?.querySelector(
    ':scope > .el-table__header-wrapper table.el-table__header'
  ) as HTMLTableElement | null;
  if (primaryHeader && primaryHeader !== table) {
    return primaryHeader;
  }

  const allTables = Array.from(document.querySelectorAll('table'));
  const currentIndex = allTables.indexOf(table);
  const currentRect = table.getBoundingClientRect();

  for (let index = currentIndex - 1; index >= 0 && index >= currentIndex - 4; index -= 1) {
    const candidate = allTables[index];
    if (!candidate) {
      continue;
    }

    const candidateGrid = buildParsedGrid(candidate);
    const candidateHasHeaders =
      candidate.querySelector('thead') != null ||
      candidate.querySelector('th') != null;
    const candidateDataRows =
      candidateGrid.normalizedGrid.length - candidateGrid.headerRowCount;

    if (!candidateHasHeaders || candidateDataRows > 1 || candidateGrid.colCount === 0) {
      continue;
    }

    if (targetColCount > 0 && Math.abs(candidateGrid.colCount - targetColCount) > 2) {
      continue;
    }

    const candidateRect = candidate.getBoundingClientRect();
    const isNearby =
      Math.abs(candidateRect.left - currentRect.left) < 40 &&
      Math.abs(candidateRect.width - currentRect.width) < 80;

    if (isNearby) {
      return candidate;
    }
  }

  return null;
}

function findLinkedBodyTable(table: HTMLTableElement): HTMLTableElement | null {
  const primaryTable = findPrimaryTable(table);
  if (primaryTable && primaryTable !== table) {
    return primaryTable;
  }

  const parsedGrid = buildParsedGrid(table);
  const hasHeaders = table.querySelector('thead, th') != null;
  const dataRowCount = parsedGrid.normalizedGrid.length - parsedGrid.headerRowCount;

  if (!hasHeaders || dataRowCount > 1) {
    return null;
  }

  const allTables = Array.from(document.querySelectorAll('table'));
  const currentIndex = allTables.indexOf(table);
  const currentRect = table.getBoundingClientRect();

  for (let index = currentIndex + 1; index < allTables.length && index <= currentIndex + 4; index += 1) {
    const candidate = allTables[index];
    if (!candidate || !isMeaningfulTable(candidate)) {
      continue;
    }

    const candidateGrid = buildParsedGrid(candidate);
    const candidateHasOwnHeaders = candidate.querySelector('thead') != null;
    const candidateRect = candidate.getBoundingClientRect();
    const isNearby =
      Math.abs(candidateRect.left - currentRect.left) < 40 &&
      Math.abs(candidateRect.width - currentRect.width) < 80;

    if (candidateHasOwnHeaders || !isNearby) {
      continue;
    }

    if (candidateGrid.colCount > 0 && Math.abs(candidateGrid.colCount - parsedGrid.colCount) <= 2) {
      return candidate;
    }
  }

  return null;
}

function findPrimaryTable(table: HTMLTableElement): HTMLTableElement | null {
  const tableRoot = getElTableRoot(table);
  if (!tableRoot) {
    return null;
  }

  const mainBody = tableRoot.querySelector(
    ':scope > .el-table__body-wrapper table.el-table__body'
  ) as HTMLTableElement | null;

  if (mainBody) {
    return mainBody;
  }

  const mainHeader = tableRoot.querySelector(
    ':scope > .el-table__header-wrapper table.el-table__header'
  ) as HTMLTableElement | null;

  return mainHeader;
}

function getElTableRoot(table: HTMLTableElement): HTMLElement | null {
  return table.closest('.el-table');
}

function isFixedReplicaTable(table: HTMLTableElement): boolean {
  return Boolean(table.closest('.el-table__fixed, .el-table__fixed-right'));
}

function isSplitHeaderTable(table: HTMLTableElement): boolean {
  return findLinkedBodyTable(table) != null;
}

function isMeaningfulTable(table: HTMLTableElement): boolean {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) {
    return false;
  }

  const rect = table.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 40) {
    return false;
  }

  const parsedGrid = buildParsedGrid(table);
  const nonEmptyRows = parsedGrid.normalizedGrid.filter((row) =>
    row.some((cell) => cell.trim() !== '')
  );
  const hasHeaders = table.querySelector('thead, th') != null;
  const hasEnoughData = nonEmptyRows.length >= 2 && parsedGrid.colCount >= 2;

  if (!hasHeaders && !hasEnoughData) {
    return false;
  }

  const joinedText = nonEmptyRows
    .flat()
    .join(' ')
    .trim();

  if (!joinedText) {
    return false;
  }

  const interactiveCount = table.querySelectorAll(
    'button, input, select, textarea, a'
  ).length;

  return interactiveCount < Math.max(8, rows.length * 2);
}

function detectDivTables(): HTMLElement[] {
  const roleTables = Array.from(
    document.querySelectorAll<HTMLElement>('[role="table"], [role="grid"], [role="treegrid"]')
  ).filter(isMeaningfulDivTable);

  const classTables = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.ag-root, .ag-root-wrapper, .MuiDataGrid-root, .ReactVirtualized__Table, .ReactVirtualized__Grid, .rdg, .data-grid, .datatable'
    )
  ).filter(isMeaningfulDivTable);

  return dedupeNestedCandidates([...roleTables, ...classTables]);
}

function dedupeNestedCandidates<T extends HTMLElement>(candidates: T[]): T[] {
  const unique = Array.from(new Set(candidates));
  return unique.filter((candidate) => {
    return !unique.some((other) => {
      if (other === candidate) {
        return false;
      }
      if (!other.contains(candidate)) {
        return false;
      }

      const candidateArea = getElementArea(candidate);
      const otherArea = getElementArea(other);
      return otherArea >= candidateArea * 0.85;
    });
  });
}

function parseDivTable(root: HTMLElement): ParsedTable {
  const grid = buildDivGrid(root);
  const headers = grid.headers;
  const rows = grid.rows;
  const ariaLabel = root.getAttribute('aria-label');
  const title =
    ariaLabel ||
    findNearbyHeading(root) ||
    sanitizeDocumentTitle(document.title) ||
    `Table ${root.dataset.smartexcelTableId ?? 'unknown'}`;
  const colCount = Math.max(headers.length, ...rows.map((row) => row.length), 0);

  return {
    id: root.dataset.smartexcelTableId ?? 'table-unknown',
    title,
    headers,
    headerRows: headers.length > 0 ? [normalizeRow(headers, colCount)] : [],
    rows: rows.map((row) => normalizeRow(row, colCount)),
    merges: [],
    element: root,
    rowCount: rows.length,
    colCount,
    hasCssRowNumbers: false,
    cssRowNumbers: [],
    source: 'div',
  };
}

function buildDivGrid(root: HTMLElement): { headers: string[]; rows: string[][] } {
  const roleRows = getRoleRows(root);
  if (roleRows.length > 0) {
    return parseRoleRows(roleRows);
  }

  if (root.matches('.ag-root, .ag-root-wrapper') || root.querySelector('.ag-row')) {
    return parseClassRows(
      root,
      '.ag-header-row, .ag-row',
      '.ag-header-cell, .ag-cell',
      '.ag-header-cell-text'
    );
  }

  if (root.matches('.MuiDataGrid-root') || root.querySelector('.MuiDataGrid-row')) {
    return parseClassRows(
      root,
      '.MuiDataGrid-columnHeaders [role="row"], .MuiDataGrid-row',
      '.MuiDataGrid-columnHeader, .MuiDataGrid-cell',
      '.MuiDataGrid-columnHeaderTitle'
    );
  }

  if (root.matches('.ReactVirtualized__Table, .ReactVirtualized__Grid') || root.querySelector('.ReactVirtualized__Table__row')) {
    return parseClassRows(
      root,
      '.ReactVirtualized__Table__headerRow, .ReactVirtualized__Table__row',
      '.ReactVirtualized__Table__headerColumn, .ReactVirtualized__Table__rowColumn'
    );
  }

  if (root.matches('.rdg') || root.querySelector('.rdg-row')) {
    return parseClassRows(root, '.rdg-header-row, .rdg-row', '.rdg-cell');
  }

  return parseVisualRows(root);
}

function getRoleRows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="row"]'))
    .filter((row) => isVisibleElement(row) && row.closest('[role="table"], [role="grid"], [role="treegrid"]') === root);
}

function parseRoleRows(rows: HTMLElement[]): { headers: string[]; rows: string[][] } {
  const parsedRows = rows
    .map((row) => {
      const headerCells = Array.from(row.querySelectorAll<HTMLElement>('[role="columnheader"], [role="rowheader"]'));
      const dataCells = Array.from(row.querySelectorAll<HTMLElement>('[role="gridcell"], [role="cell"]'));
      const cells = headerCells.length > 0 ? headerCells : dataCells;
      return {
        isHeader: headerCells.length > 0,
        cells: cells.map(getCellText).filter((cell) => cell !== ''),
      };
    })
    .filter((row) => row.cells.length > 0);

  const header = parsedRows.find((row) => row.isHeader)?.cells ?? [];
  const bodyRows = parsedRows
    .filter((row) => !row.isHeader)
    .map((row) => row.cells);

  return { headers: header, rows: bodyRows };
}

function parseClassRows(
  root: HTMLElement,
  rowSelector: string,
  cellSelector: string,
  headerTextSelector?: string
): { headers: string[]; rows: string[][] } {
  const rows = Array.from(root.querySelectorAll<HTMLElement>(rowSelector))
    .filter(isVisibleElement)
    .map((row) => {
      const cells = Array.from(row.querySelectorAll<HTMLElement>(cellSelector))
        .filter(isVisibleElement)
        .map((cell) => headerTextSelector
          ? getCellText(cell.querySelector(headerTextSelector) as HTMLElement | null ?? cell)
          : getCellText(cell)
        )
        .filter((cell) => cell !== '');
      const className = row.className.toString().toLowerCase();
      const isHeader = className.includes('header') || row.getAttribute('role') === 'rowgroup';
      return { isHeader, cells };
    })
    .filter((row) => row.cells.length > 0);

  const headers = rows.find((row) => row.isHeader)?.cells ?? [];
  const bodyRows = rows.filter((row) => !row.isHeader).map((row) => row.cells);
  return { headers, rows: bodyRows };
}

function parseVisualRows(root: HTMLElement): { headers: string[]; rows: string[][] } {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(':scope > *, :scope [class*="row"]'))
    .filter((el) => isVisibleElement(el) && !el.querySelector('table'));
  const rows = candidates
    .map((row) => Array.from(row.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && isVisibleElement(child))
      .map(getCellText)
      .filter((cell) => cell !== '')
    )
    .filter((cells) => cells.length >= 2);

  if (rows.length < 2) {
    return { headers: [], rows: [] };
  }

  const firstLooksHeader = rows[0].every((cell) => Number.isNaN(Number(cell.replace(/,/g, ''))));
  return firstLooksHeader
    ? { headers: rows[0], rows: rows.slice(1) }
    : { headers: [], rows };
}

function isMeaningfulDivTable(root: HTMLElement): boolean {
  if (root.querySelector('table')) {
    return false;
  }

  const rect = root.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 40) {
    return false;
  }

  const grid = buildDivGrid(root);
  const colCount = Math.max(grid.headers.length, ...grid.rows.map((row) => row.length), 0);
  const nonEmptyRows = grid.rows.filter((row) => row.some((cell) => cell.trim() !== ''));

  if (colCount < 2 || nonEmptyRows.length < 1) {
    return false;
  }

  const joinedText = [...grid.headers, ...nonEmptyRows.flat()].join(' ').trim();
  return joinedText.length > 0;
}

function normalizeRow(row: string[], colCount: number): string[] {
  return Array.from({ length: colCount }, (_, index) => row[index] ?? '');
}

function getElementArea(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function isVisibleElement(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function ensureStableTableId(table: HTMLElement): void {
  if (table.dataset.smartexcelTableId) {
    return;
  }

  const allTables = detectTables();
  const index = allTables.indexOf(table);
  table.dataset.smartexcelTableId = `table-${index >= 0 ? index + 1 : 'unknown'}`;
}

function findNearbyHeading(table: HTMLElement): string {
  const candidates = [
    table.closest('section')?.querySelector('h1, h2, h3, h4, h5, h6'),
    document.querySelector('.mw-page-title-main'),
    document.querySelector('h1'),
  ];

  for (const candidate of candidates) {
    const text = candidate?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  let node: Element | null = table;
  while (node) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (/^H[1-6]$/.test(sibling.tagName)) {
        const text = sibling.textContent?.trim();
        if (text) {
          return text;
        }
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }

  return '';
}

function sanitizeDocumentTitle(title: string): string {
  return title
    .replace(/\s*[-|·•]\s*.+$/, '')
    .trim();
}

function detectCssRowNumbers(table: HTMLTableElement): boolean {
  if (table.className.includes('row-number')) return true;

  const testRow =
    table.querySelector('tbody tr') ??
    table.querySelector('tr:nth-child(2)');
  if (!testRow) return false;

  try {
    const style = window.getComputedStyle(testRow, '::before');
    const content = style.getPropertyValue('content');
    if (content && content !== 'none' && content !== 'normal' && content !== '""' && content !== "''") {
      const display = style.getPropertyValue('display');
      return display !== 'none';
    }
  } catch {}

  return false;
}

function extractCssRowNumbers(rowElements: Element[]): string[] {
  const results: string[] = [];
  let rank = 0;

  for (const row of rowElements) {
    const el = row as HTMLElement;
    const hasRank = rowHasVisibleBefore(el) && !isNoRankRow(el);

    if (hasRank) {
      rank++;
      results.push(String(rank));
    } else {
      results.push('');
    }
  }

  return results;
}

function rowHasVisibleBefore(el: HTMLElement): boolean {
  try {
    const style = window.getComputedStyle(el, '::before');
    const content = style.getPropertyValue('content');
    const display = style.getPropertyValue('display');

    if (display === 'none') return false;
    if (!content || content === 'none' || content === 'normal') return false;
    if (content === '""' || content === "''") return false;

    return true;
  } catch {
    return false;
  }
}

function isNoRankRow(el: HTMLElement): boolean {
  const cl = el.className.toLowerCase();
  return cl.includes('norank') || cl.includes('no-rank') || cl.includes('header');
}

function getCellText(cell: HTMLElement): string {
  const cloned = cell.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll('script, style, .mw-collapsible-content').forEach((el) => el.remove());
  return cloned.textContent?.trim().replace(/\s+/g, ' ') ?? '';
}
