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

export type ExportAccessResult = {
  allowed: boolean;
  reason?: 'not_activated';
};

/** Messages handled by the content script. */
export type TabMessage =
  | { type: 'GET_TABLES'; payload?: never }
  | { type: 'EXPORT_TABLE'; payload: { tableId: string; format: 'xlsx' | 'csv' } }
  | { type: 'EXPORT_ALL'; payload?: { tableIds?: string[] } }
  | { type: 'COPY_TABLE'; payload: { tableId: string } }
  | { type: 'PREPARE_CONTEXT_EXPORT'; payload: { tableId?: string | null; format: 'xlsx' | 'csv' } }
  | { type: 'SHOW_EXPORT_FEEDBACK'; payload: { format: 'xlsx' | 'csv' } }
  | { type: 'SHOW_EXPORT_PROGRESS'; payload?: { message?: string } }
  | { type: 'SHOW_ACTIVATION_PROMPT'; payload?: never };

/** Messages handled by the background worker, with their responses. */
export type RuntimeMessage =
  | { type: 'SET_CONTEXT_TABLE'; payload: { tableId: string | null; isHeaderContext: boolean } }
  | { type: 'CREATE_PAYMENT_QR'; payload: { payType: 'native' | 'alipay' } } // → PaymentQrResult
  | { type: 'CHECK_PAYMENT_STATUS'; payload?: never } // → { activated: boolean }
  | { type: 'CHECK_EXPORT_ACCESS'; payload?: never } // → ExportAccessResult
  | { type: 'ACTIVATE'; payload: { code: string } } // → ActivateResult
  | { type: 'GET_STATE'; payload?: never }; // → ActivationState | null

/** Content-script results of EXPORT_TABLE / EXPORT_ALL / COPY_TABLE. */
export type ExportResult = { ok: boolean; reason?: string };
