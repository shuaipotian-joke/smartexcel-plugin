export interface ParsedTable {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  element: HTMLTableElement;
  rowCount: number;
  colCount: number;
}

let tableCounter = 0;

export function detectTables(): HTMLTableElement[] {
  return Array.from(document.querySelectorAll('table')).filter((table) => {
    const rows = table.querySelectorAll('tr');
    return rows.length > 0;
  });
}

export function parseTable(table: HTMLTableElement): ParsedTable {
  const headers: string[] = [];
  const rows: string[][] = [];

  const thead = table.querySelector('thead');
  if (thead) {
    const headerCells = thead.querySelectorAll('th, td');
    headerCells.forEach((cell) => {
      headers.push(getCellText(cell as HTMLElement));
    });
  }

  const bodyRows = table.querySelectorAll('tbody tr, tr');
  const startIndex = thead ? 0 : 1;

  bodyRows.forEach((row, index) => {
    if (!thead && index === 0) {
      const cells = row.querySelectorAll('th, td');
      cells.forEach((cell) => {
        headers.push(getCellText(cell as HTMLElement));
      });
      return;
    }

    const cells = row.querySelectorAll('td, th');
    const rowData: string[] = [];
    cells.forEach((cell) => {
      rowData.push(getCellText(cell as HTMLElement));
    });

    if (rowData.length > 0 && rowData.some((cell) => cell.trim() !== '')) {
      rows.push(rowData);
    }
  });

  const caption = table.querySelector('caption');
  const ariaLabel = table.getAttribute('aria-label');
  const title =
    caption?.textContent?.trim() ||
    ariaLabel ||
    `Table ${++tableCounter}`;

  return {
    id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    headers,
    rows,
    element: table,
    rowCount: rows.length,
    colCount: Math.max(headers.length, rows[0]?.length ?? 0),
  };
}

function getCellText(cell: HTMLElement): string {
  const cloned = cell.cloneNode(true) as HTMLElement;

  cloned.querySelectorAll('script, style').forEach((el) => el.remove());

  return cloned.textContent?.trim() ?? '';
}
