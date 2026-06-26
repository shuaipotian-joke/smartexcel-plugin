export interface TableInfo {
  id: string;
  title: string;
  rowCount: number;
  colCount: number;
  headers: string[];
  preview: string[][];
}

export interface PreparedExportFile {
  fileName: string;
  mimeType: string;
  base64: string;
}

export type MessageType =
  | { type: 'GET_TABLES'; payload?: never }
  | { type: 'TABLES_RESULT'; payload: TableInfo[] }
  | { type: 'EXPORT_TABLE'; payload: { tableId: string; format: 'xlsx' | 'csv' } }
  | { type: 'EXPORT_CONTEXT_TABLE'; payload: { tableId?: string | null; format: 'xlsx' | 'csv'; skipAccessCheck?: boolean } }
  | { type: 'PREPARE_CONTEXT_EXPORT'; payload: { tableId?: string | null; format: 'xlsx' | 'csv' } }
  | { type: 'SHOW_EXPORT_FEEDBACK'; payload: { format: 'xlsx' | 'csv'; remaining?: number; used?: number } }
  | { type: 'SHOW_EXPORT_PROGRESS'; payload?: { message?: string } }
  | { type: 'COPY_TABLE'; payload: { tableId: string } }
  | { type: 'EXPORT_ALL'; payload?: { tableIds?: string[] } }
  | { type: 'SET_CONTEXT_TABLE'; payload: { tableId: string | null; isHeaderContext: boolean } }
  | { type: 'OPEN_WEBSITE'; payload: { tableId?: string } }
  | { type: 'OPEN_LOGIN'; payload?: never }
  | { type: 'OPEN_REGISTER'; payload?: never }
  | { type: 'OPEN_PAYMENT_PAGE'; payload?: { planId?: string; lang?: 'zh' | 'en' } }
  | { type: 'GET_STATE'; payload?: never }
  | { type: 'LOGOUT_PLUGIN'; payload?: never }
  | { type: 'CLEAR_PLUGIN_SESSION'; payload?: never };

export const WEBSITE_URL = 'https://smarterexcel.com';

export function sendMessage(message: MessageType): Promise<any> {
  return browser.runtime.sendMessage(message);
}

export function sendTabMessage(
  tabId: number,
  message: MessageType
): Promise<any> {
  return browser.tabs.sendMessage(tabId, message);
}
