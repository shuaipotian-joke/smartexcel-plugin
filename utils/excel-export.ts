import * as XLSX from 'xlsx';
import type { ParsedTable } from './table-parser';

export type ExportFormat = 'xlsx' | 'csv';

export function exportToExcel(
  table: ParsedTable,
  format: ExportFormat = 'xlsx'
): void {
  const data = [table.headers, ...table.rows];
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  autoFitColumns(worksheet, data);

  const workbook = XLSX.utils.book_new();
  const sheetName = sanitizeSheetName(table.title);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const fileName = `${table.title.replace(/[^\w\u4e00-\u9fff]/g, '_')}.${format}`;

  if (format === 'csv') {
    XLSX.writeFile(workbook, fileName, { bookType: 'csv' });
  } else {
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsx' });
  }
}

export function exportMultipleTables(
  tables: ParsedTable[],
  fileName = 'tables-export'
): void {
  const workbook = XLSX.utils.book_new();

  tables.forEach((table, index) => {
    const data = [table.headers, ...table.rows];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    autoFitColumns(worksheet, data);

    let sheetName = sanitizeSheetName(table.title);
    if (sheetName.length > 28) {
      sheetName = sheetName.slice(0, 28);
    }
    sheetName = `${sheetName}_${index + 1}`;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, `${fileName}.xlsx`, { bookType: 'xlsx' });
}

export function copyTableToClipboard(table: ParsedTable): Promise<void> {
  const data = [table.headers, ...table.rows];
  const text = data.map((row) => row.join('\t')).join('\n');
  return navigator.clipboard.writeText(text);
}

function autoFitColumns(
  worksheet: XLSX.WorkSheet,
  data: string[][]
): void {
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
