import * as XLSX from 'xlsx';
import type { ParsedTable } from './table-parser';
import type { PreparedExportFile } from './messaging';

export type ExportFormat = 'xlsx' | 'csv';

export interface ExportOptions {
  format?: ExportFormat;
  withIndex?: boolean;
}

export function exportToExcel(
  table: ParsedTable,
  options: ExportOptions = {},
): void {
  const { format = 'xlsx', withIndex = false } = options;

  const worksheet = buildWorksheet(table, withIndex, format);

  const workbook = XLSX.utils.book_new();
  const sheetName = sanitizeSheetName(table.title);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const fileName = `${sanitizeFileName(table.title || table.id)}.${format}`;
  XLSX.writeFile(workbook, fileName, { bookType: format });
}

export function exportMultipleTables(
  tables: ParsedTable[],
  fileName = 'tables-export',
  withIndex = false,
): void {
  const workbook = XLSX.utils.book_new();

  tables.forEach((table, i) => {
    const worksheet = buildWorksheet(table, withIndex);

    let sheetName = sanitizeSheetName(table.title);
    if (sheetName.length > 28) sheetName = sheetName.slice(0, 28);
    sheetName = `${sheetName}_${i + 1}`;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, `${sanitizeFileName(fileName)}.xlsx`, { bookType: 'xlsx' });
}

export function prepareExportFile(
  table: ParsedTable,
  options: ExportOptions = {},
): PreparedExportFile {
  const { format = 'xlsx', withIndex = false } = options;
  const worksheet = buildWorksheet(table, withIndex, format);
  const workbook = XLSX.utils.book_new();
  const sheetName = sanitizeSheetName(table.title);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const fileName = `${sanitizeFileName(table.title || table.id)}.${format}`;
  const mimeType =
    format === 'csv'
      ? 'text/csv;charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const base64 = XLSX.write(workbook, { bookType: format, type: 'base64' });

  return { fileName, mimeType, base64 };
}

export function copyTableToClipboard(
  table: ParsedTable,
  withIndex = false,
): Promise<void> {
  const data = buildSheetData(table, withIndex);
  const text = data.map((row) => row.join('\t')).join('\n');
  return navigator.clipboard.writeText(text);
}

/**
 * Flat cell values: all header rows, then the data rows. A rowspan value is
 * repeated on every row it covers and colspan continuation cells are empty.
 * This is what CSV and the clipboard get; xlsx clears the covered cells and
 * merges them instead (see `clearMergedCells`).
 */
function buildSheetData(table: ParsedTable, withIndex: boolean): string[][] {
  const headerRows = getHeaderRows(table);
  if (!withIndex) {
    return [...headerRows, ...table.rows];
  }

  const useCssNumbers =
    table.hasCssRowNumbers && table.cssRowNumbers.length === table.rows.length;

  const headers = headerRows.map((row, i) => [i === 0 ? '#' : '', ...row]);
  const rows = table.rows.map((row, i) => {
    const num = useCssNumbers ? table.cssRowNumbers[i] : String(i + 1);
    return [num, ...row];
  });

  return [...headers, ...rows];
}

function getHeaderRows(table: ParsedTable): string[][] {
  if (table.headerRows?.length) {
    return table.headerRows;
  }
  return table.headers.length > 0 ? [table.headers] : [];
}

function buildWorksheet(
  table: ParsedTable,
  withIndex: boolean,
  format: ExportFormat = 'xlsx',
): XLSX.WorkSheet {
  const shouldUseParsedData =
    withIndex ||
    table.headers.length > 0 ||
    table.rows.length > 0;

  if (!shouldUseParsedData) {
    const clonedTable = table.element.cloneNode(true) as HTMLTableElement;
    const worksheet = XLSX.utils.table_to_sheet(clonedTable, {
      raw: false,
    });
    autoFitColumns(worksheet, sheetToMatrix(worksheet));
    return worksheet;
  }

  const flatData = buildSheetData(table, withIndex);
  if (format === 'csv') {
    // CSV has no merges: keep the flat values.
    const worksheet = XLSX.utils.aoa_to_sheet(flatData);
    autoFitColumns(worksheet, flatData);
    return worksheet;
  }

  const merges = getSheetMerges(table, withIndex);
  const data = clearMergedCells(flatData, merges);
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  if (merges.length > 0) {
    worksheet['!merges'] = merges;
  }
  autoFitColumns(worksheet, data);
  return worksheet;
}

function autoFitColumns(worksheet: XLSX.WorkSheet, data: string[][]): void {
  const colWidths: number[] = [];

  data.forEach((row) => {
    row.forEach((cell, colIndex) => {
      const len = cell ? cell.toString().length : 10;
      if (!colWidths[colIndex] || len > colWidths[colIndex]) {
        colWidths[colIndex] = Math.min(len + 2, 50);
      }
    });
  });

  worksheet['!cols'] = colWidths.map((w) => ({ wch: w }));
}

/** `table.merges` (rowspan and colspan, header and body) as SheetJS ranges. */
function getSheetMerges(table: ParsedTable, withIndex: boolean): XLSX.Range[] {
  const colOffset = withIndex ? 1 : 0;
  const merges: XLSX.Range[] = table.merges.map((merge) => ({
    s: { r: merge.startRow, c: merge.startCol + colOffset },
    e: { r: merge.endRow, c: merge.endCol + colOffset },
  }));

  const headerRowCount = getHeaderRows(table).length;
  if (withIndex && headerRowCount > 1) {
    merges.push({ s: { r: 0, c: 0 }, e: { r: headerRowCount - 1, c: 0 } });
  }

  return merges;
}

/** Copy of `data` with only the top-left cell of each merge keeping a value. */
function clearMergedCells(data: string[][], merges: XLSX.Range[]): string[][] {
  const cleared = data.map((row) => [...row]);
  merges.forEach(({ s, e }) => {
    for (let r = s.r; r <= e.r; r += 1) {
      for (let c = s.c; c <= e.c; c += 1) {
        if ((r !== s.r || c !== s.c) && cleared[r] && c < cleared[r].length) {
          cleared[r][c] = '';
        }
      }
    }
  });
  return cleared;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}

function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'table_export';
}

function sheetToMatrix(worksheet: XLSX.WorkSheet): string[][] {
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  }) as string[][];
}
