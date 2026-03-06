import * as XLSX from 'xlsx';
import type { ParsedTable } from './table-parser';

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

  const data = buildSheetData(table, withIndex);
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  autoFitColumns(worksheet, data);

  const workbook = XLSX.utils.book_new();
  const sheetName = sanitizeSheetName(table.title);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const fileName = `${table.title.replace(/[^\w\u4e00-\u9fff]/g, '_')}.${format}`;
  XLSX.writeFile(workbook, fileName, { bookType: format });
}

export function exportMultipleTables(
  tables: ParsedTable[],
  fileName = 'tables-export',
  withIndex = false,
): void {
  const workbook = XLSX.utils.book_new();

  tables.forEach((table, i) => {
    const data = buildSheetData(table, withIndex);
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    autoFitColumns(worksheet, data);

    let sheetName = sanitizeSheetName(table.title);
    if (sheetName.length > 28) sheetName = sheetName.slice(0, 28);
    sheetName = `${sheetName}_${i + 1}`;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, `${fileName}.xlsx`, { bookType: 'xlsx' });
}

export function copyTableToClipboard(
  table: ParsedTable,
  withIndex = false,
): Promise<void> {
  const data = buildSheetData(table, withIndex);
  const text = data.map((row) => row.join('\t')).join('\n');
  return navigator.clipboard.writeText(text);
}

function buildSheetData(table: ParsedTable, withIndex: boolean): string[][] {
  const headers = withIndex ? ['#', ...table.headers] : [...table.headers];
  const rows = table.rows.map((row, i) =>
    withIndex ? [String(i + 1), ...row] : [...row],
  );
  return [headers, ...rows];
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

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}
