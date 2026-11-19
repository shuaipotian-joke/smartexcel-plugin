import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTable, type ParsedTable } from '../utils/table-parser';
import { prepareExportFile, type ExportOptions } from '../utils/excel-export';

const fixtureHtml = readFileSync(resolve(__dirname, 'fixtures/merged-cells.html'), 'utf8');

beforeAll(() => {
  // happy-dom has no layout: give every element a visible box so size and
  // visibility checks in the parser behave as in a browser.
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, toJSON() {} } as DOMRect;
  };
  document.title = 'Merged cells fixtures';
  document.body.innerHTML = fixtureHtml.match(/<body>([\s\S]*)<\/body>/)![1];
  document.querySelectorAll<HTMLElement>('table[id], [role="table"]').forEach((el) => {
    el.dataset.smartexcelTableId = el.id;
  });
});

function parse(id: string): ParsedTable {
  return parseTable(document.getElementById(id)!);
}

function exportSheet(id: string, options: ExportOptions = {}) {
  const file = prepareExportFile(parse(id), options);
  const workbook = XLSX.read(file.base64, { type: 'base64' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return {
    values: XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false, blankrows: true }),
    merges: (sheet['!merges'] ?? []).map((range) => XLSX.utils.encode_range(range)).sort(),
    csv: options.format === 'csv' ? Buffer.from(file.base64, 'base64').toString('utf8').replace(/^﻿/, '') : '',
  };
}

describe('two-level header with rowspan', () => {
  it('parses every header row and both span kinds', () => {
    const table = parse('two-level');
    expect(table.headerRows).toEqual([
      ['Region', 'H1', '', 'H2', ''],
      ['Region', 'Q1', 'Q2', 'Q3', 'Q4'],
    ]);
    expect(table.headers).toEqual(['Region', 'Q1', 'Q2', 'Q3', 'Q4']);
    expect(table.rows).toEqual([
      ['North', '1', '2', '3', '4'],
      ['North', '5', '6', '7', '8'],
      ['South', '9', '10', '11', '12'],
    ]);
  });

  it('xlsx keeps both header rows and merges rowspan + colspan', () => {
    const { values, merges } = exportSheet('two-level');
    expect(values).toEqual([
      ['Region', 'H1', '', 'H2', ''],
      ['', 'Q1', 'Q2', 'Q3', 'Q4'],
      ['North', '1', '2', '3', '4'],
      ['', '5', '6', '7', '8'],
      ['South', '9', '10', '11', '12'],
    ]);
    expect(merges).toEqual(['A1:A2', 'A3:A4', 'B1:C1', 'D1:E1']);
  });

  it('xlsx with index column shifts merges and merges the # header', () => {
    const { values, merges } = exportSheet('two-level', { withIndex: true });
    expect(values[0]).toEqual(['#', 'Region', 'H1', '', 'H2', '']);
    expect(values[2]).toEqual(['1', 'North', '1', '2', '3', '4']);
    expect(values[3]).toEqual(['2', '', '5', '6', '7', '8']);
    expect(merges).toEqual(['A1:A2', 'B1:B2', 'B3:B4', 'C1:D1', 'E1:F1']);
  });

  it('csv repeats rowspan values and leaves colspan cells empty', () => {
    const { csv } = exportSheet('two-level', { format: 'csv' });
    expect(csv.trim().split('\n')).toEqual([
      'Region,H1,,H2,',
      'Region,Q1,Q2,Q3,Q4',
      'North,1,2,3,4',
      'North,5,6,7,8',
      'South,9,10,11,12',
    ]);
  });
});

describe('regressions', () => {
  it('plain table: values, no merges', () => {
    const { values, merges } = exportSheet('plain');
    expect(values).toEqual([['Name', 'Age'], ['Ann', '31'], ['Bob', '42']]);
    expect(merges).toEqual([]);
  });

  it('<th> row headers in body rows stay data', () => {
    const table = parse('th-body');
    expect(table.headerRows).toEqual([['Item', 'Price']]);
    expect(table.rows).toEqual([['Apple', '3'], ['Pear', '4']]);
  });

  it('first row mixing <th> and data <td> is not a header', () => {
    const table = parse('th-first-data');
    expect(table.headerRows).toEqual([]);
    expect(table.rows).toEqual([['Apple', '3'], ['Pear', '4']]);
    expect(exportSheet('th-first-data').values).toEqual([['Apple', '3'], ['Pear', '4']]);
  });

  it('<th> row with an empty <td> corner is a header', () => {
    const table = parse('pivot-corner');
    expect(table.headers).toEqual(['', 'A', 'B']);
    expect(table.rows).toEqual([['x', '1', '2']]);
  });

  it('nested table rows are not rows of the outer table', () => {
    const table = parse('nested');
    expect(table.headers).toEqual(['Key', 'Detail']);
    expect(table.rows.map((row) => row[0])).toEqual(['k1', 'k2']);
    expect(table.colCount).toBe(2);
    expect(table.merges).toEqual([]);
    expect(parse('inner').rows).toEqual([['in-a', 'in-b'], ['in-c', 'in-d']]);
  });

  it('tfoot row is kept and a rowspan stops at the end of its tbody', () => {
    const { values, merges } = exportSheet('tfoot');
    expect(values).toEqual([['Item', 'Qty'], ['Fruit', '1'], ['', '2'], ['Total', '3']]);
    expect(merges).toEqual(['A2:A3']);
  });

  it('rowspan + colspan on the same cell is one merged block', () => {
    const { values, merges } = exportSheet('both-spans');
    expect(values).toEqual([
      ['A', 'B', 'C'],
      ['Big', '', 'c1'],
      ['', '', 'c2'],
      ['a3', 'b3', 'c3'],
    ]);
    expect(merges).toEqual(['A2:B3']);
  });

  it('rowspan running past the end of a tbody is clamped', () => {
    const table = parse('rowspan-overflow');
    expect(table.rows).toEqual([['G1', '1'], ['G1', '2'], ['G2', '3']]);
    const { values, merges } = exportSheet('rowspan-overflow');
    expect(values).toEqual([['Group', 'Value'], ['G1', '1'], ['', '2'], ['G2', '3']]);
    expect(merges).toEqual(['A2:A3']);
  });

  it('div grid parses headers and rows without merges', () => {
    const table = parse('div-grid');
    expect(table.source).toBe('div');
    expect(table.headers).toEqual(['City', 'Pop']);
    expect(table.rows).toEqual([['Oslo', '700'], ['Bergen', '290']]);
    const { values, merges } = exportSheet('div-grid');
    expect(values).toEqual([['City', 'Pop'], ['Oslo', '700'], ['Bergen', '290']]);
    expect(merges).toEqual([]);
  });
});
