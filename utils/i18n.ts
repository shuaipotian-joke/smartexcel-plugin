import type { ActivationError } from './activation';

export type Lang = 'zh' | 'en';

export const SUPPORTED_LANGS: Lang[] = ['zh', 'en'];

export const LANG_LABELS: Record<Lang, string> = {
  zh: '中文',
  en: 'English',
};

// Source-of-truth dict (zh). All keys must appear in en too.
const zh = {
  // Popup header
  appSubtitle: '网页表格智能导出',
  settings: '设置',
  back: '返回',

  // Activation
  statusActivated: '已激活',
  statusNotActivated: '未激活',
  activatedSince: '本设备已激活，可无限导出',
  activationTitle: '激活 SmartExcel',
  activationIntro: '输入激活码，即可在本设备上无限导出表格。',
  activationRequired: '导出前请先激活插件',
  activationCodePlaceholder: '输入激活码',
  activateButton: '激活',
  activating: '正在激活…',
  activationSuccess: '激活成功，可以开始导出了',
  alreadyActivated: '本设备已激活，无需再次激活。该激活码未被使用，仍可用于其他设备。',
  buyActivation: '购买 ¥9.9',
  noCodeYet: '还没有激活码？',
  haveCode: '已有激活码？',
  enterCode: '输入激活码',
  payTitle: '扫码支付 ¥9.9',
  payOneTime: '一次付费，本设备永久使用',
  payWechat: '微信支付',
  payAlipay: '支付宝',
  payScanWechat: '请用微信扫一扫',
  payScanAlipay: '请用支付宝扫一扫',
  payLoading: '正在生成二维码…',
  payWaiting: '支付完成后自动激活本设备',
  payPaid: '支付成功，正在激活…',
  payRetry: '重试',
  payQrAlt: '付款二维码',
  payErrNetwork: '无法连接支付服务器，请检查网络后重试',
  payErrServer: '暂时无法创建订单，请稍后重试',
  payErrRateLimited: '操作太频繁，请稍后再试',
  codeEnding: '激活码尾号 {hint}',
  activatedByPurchase: '已通过付款激活',
  deviceIdLabel: '设备 ID',
  copy: '复制',
  copied: '已复制',
  close: '关闭',
  activationErrInvalidCode: '激活码无效，请检查后重试',
  activationErrCodeRevoked: '该激活码已被停用，请联系客服',
  activationErrCodeUsedByOtherDevice: '该激活码已在其他设备上激活',
  activationErrBadRequest: '请输入完整的激活码',
  activationErrRateLimited: '尝试次数过多，请稍后再试',
  activationErrNetwork: '无法连接激活服务器，请检查网络后重试',
  activationErrServer: '激活服务暂时不可用，请稍后再试',

  // No tables state
  noTablesFound: '当前页面未检测到表格',
  hoverHint: '鼠标悬停在表格上即可显示导出按钮',

  // Tables list
  tablesDetected: '检测到 {n} 个表格',
  selectedTables: '已选择 {n} 个',
  selectAll: '全选',
  deselectAll: '取消全选',
  exportAll: '全部导出',
  exportSelected: '导出选中',
  confirmExportAll: '当前识别到 {count} 个表格，本次将全部导出，确定继续吗？',
  exportBlockedHint: '插件尚未激活，请先在上方输入激活码。',

  // Table card
  selectTable: '选择表格：{title}',
  exportExcel: '导出 Excel',
  csvLabel: 'CSV',

  // Footer
  openWebsite: '打开 SmartExcel 网站 →',

  // Settings panel
  language: '语言',
  languageRegionHint: '默认根据浏览器地区自动显示语言，也可以在这里手动切换。',
  activationSection: '激活状态',
  pageDisplay: '页面显示',
  showTableIcon: '在网页上显示表格图标',
  showTableIconHint: '关闭后不再显示悬停导出按钮，右键菜单和弹窗导出仍可使用。',

  // TableOverlay — button / menu labels
  exportTableTitle: 'SmartExcel - 导出表格',
  rowsCols: '{r} 行 × {c} 列',
  hasRowNumbers: '🔢 检测到序号列',
  addRowNumbers: '🔢 添加序号列',
  exportAsExcel: '导出为 Excel',
  exportAsCsv: '导出为 CSV',
  copyToClipboard: '复制到剪贴板',
  sendToSmartExcel: '发送到 SmartExcel',
  aiProcess: 'AI 处理',

  // TableOverlay — toast messages
  exportedAs: '已导出为 {fmt}',
  exportingPleaseWait: '请稍等，正在导出…',
  exportFailed: '导出失败，请重试',
  copiedToClipboard: '已复制到剪贴板',
  copyFailed: '复制失败，请重试',
} as const;

export type TranslationKey = keyof typeof zh;

// en must satisfy the same keys
const en: Record<TranslationKey, string> = {
  appSubtitle: 'Smart Table Exporter',
  settings: 'Settings',
  back: 'Back',

  statusActivated: 'Activated',
  statusNotActivated: 'Not activated',
  activatedSince: 'This device is activated — unlimited exports',
  activationTitle: 'Activate SmartExcel',
  activationIntro: 'Enter your activation code to export tables on this device without limits.',
  activationRequired: 'Activate the extension to export',
  activationCodePlaceholder: 'Enter activation code',
  activateButton: 'Activate',
  activating: 'Activating…',
  activationSuccess: 'Activated. You can export now.',
  alreadyActivated: 'This device is already activated. The code was not used and can still activate another device.',
  buyActivation: 'Buy · ¥9.9',
  noCodeYet: "Don't have a code?",
  haveCode: 'Already have a code?',
  enterCode: 'Enter code',
  payTitle: 'Scan to pay ¥9.9',
  payOneTime: 'One-time payment, this device forever',
  payWechat: 'WeChat Pay',
  payAlipay: 'Alipay',
  payScanWechat: 'Scan with WeChat',
  payScanAlipay: 'Scan with Alipay',
  payLoading: 'Creating QR code…',
  payWaiting: 'This device unlocks as soon as you pay',
  payPaid: 'Paid. Activating…',
  payRetry: 'Try again',
  payQrAlt: 'Payment QR code',
  payErrNetwork: "Can't reach the payment server. Check your connection and try again.",
  payErrServer: "Couldn't create the order. Please try again in a moment.",
  payErrRateLimited: 'Too many attempts. Please wait a moment and try again.',
  codeEnding: 'Code ending {hint}',
  activatedByPurchase: 'Activated by purchase',
  deviceIdLabel: 'Device ID',
  copy: 'Copy',
  copied: 'Copied',
  close: 'Close',
  activationErrInvalidCode: 'This activation code is not valid. Check it and try again.',
  activationErrCodeRevoked: 'This activation code has been revoked. Please contact support.',
  activationErrCodeUsedByOtherDevice: 'This code is already activated on another device.',
  activationErrBadRequest: 'Please enter a complete activation code.',
  activationErrRateLimited: 'Too many attempts. Please wait a moment and try again.',
  activationErrNetwork: 'Could not reach the activation server. Check your connection and try again.',
  activationErrServer: 'The activation service is unavailable. Please try again later.',

  noTablesFound: 'No tables found on this page',
  hoverHint: 'Hover over a table to show the export button',

  tablesDetected: '{n} table(s) detected',
  selectedTables: '{n} selected',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  exportAll: 'Export All',
  exportSelected: 'Export selected',
  confirmExportAll: '{count} tables detected. Export all of them now?',
  exportBlockedHint: 'The extension is not activated yet. Enter your activation code above.',

  selectTable: 'Select table: {title}',
  exportExcel: 'Export Excel',
  csvLabel: 'CSV',

  openWebsite: 'Open SmartExcel website →',

  language: 'Language',
  languageRegionHint: 'The panel follows your browser region by default. You can override it here.',
  activationSection: 'Activation',
  pageDisplay: 'On pages',
  showTableIcon: 'Show table icon on pages',
  showTableIconHint: 'When off, the hover export button is hidden. The right-click menu and popup export still work.',

  exportTableTitle: 'SmartExcel - Export Table',
  rowsCols: '{r} rows × {c} cols',
  hasRowNumbers: '🔢 Row numbers detected',
  addRowNumbers: '🔢 Add row numbers',
  exportAsExcel: 'Export as Excel',
  exportAsCsv: 'Export as CSV',
  copyToClipboard: 'Copy to Clipboard',
  sendToSmartExcel: 'Send to SmartExcel',
  aiProcess: 'AI Processing',

  exportedAs: 'Exported as {fmt}',
  exportingPleaseWait: 'Please wait, exporting...',
  exportFailed: 'Export failed, please retry',
  copiedToClipboard: 'Copied to clipboard',
  copyFailed: 'Copy failed, please retry',
};

const dict: Record<Lang, Record<TranslationKey, string>> = { zh, en };

const ACTIVATION_ERROR_KEYS: Record<ActivationError, TranslationKey> = {
  invalid_code: 'activationErrInvalidCode',
  code_revoked: 'activationErrCodeRevoked',
  code_used_by_other_device: 'activationErrCodeUsedByOtherDevice',
  bad_request: 'activationErrBadRequest',
  rate_limited: 'activationErrRateLimited',
  network_error: 'activationErrNetwork',
  server_error: 'activationErrServer',
};

/** User-facing text for an activation API error. */
export function activationErrorText(error: ActivationError, lang: Lang): string {
  return t(ACTIVATION_ERROR_KEYS[error] ?? 'activationErrServer', lang);
}

/**
 * Translate a key to the target language with optional variable interpolation.
 * Variables in the template use {varName} syntax.
 */
export function t(
  key: TranslationKey,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  const str = dict[lang][key] ?? dict['en'][key] ?? key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

const CHINESE_REGION_CODES = new Set(['CN', 'HK', 'MO', 'SG', 'TW']);
const CHINESE_TIME_ZONES = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Harbin',
  'Asia/Hong_Kong',
  'Asia/Macau',
  'Asia/Taipei',
]);

function getLocaleCandidates(): string[] {
  const locales: string[] = [];

  try {
    if (typeof browser !== 'undefined') {
      locales.push(browser.i18n.getUILanguage());
    }
  } catch {
    // ignore
  }

  try {
    const nav = globalThis.navigator;
    if (nav.languages?.length) {
      locales.push(...nav.languages);
    }
    if (nav.language) {
      locales.push(nav.language);
    }
  } catch {
    // ignore
  }

  return locales.filter(Boolean);
}

function localeLooksChinese(locale: string): boolean {
  const normalized = locale.replace('_', '-');
  const parts = normalized.split('-');
  const language = parts[0]?.toLowerCase();
  const region = parts.find((part) => part.length === 2)?.toUpperCase();

  return language === 'zh' || Boolean(region && CHINESE_REGION_CODES.has(region));
}

function timeZoneLooksChinese(): boolean {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return CHINESE_TIME_ZONES.has(timeZone);
  } catch {
    return false;
  }
}

/**
 * Detect the preferred language from browser locale and regional hints.
 * Falls back to English for regions that are not primarily Chinese-speaking.
 */
export function detectBrowserLang(): Lang {
  const locales = getLocaleCandidates();

  if (locales.some(localeLooksChinese)) {
    return 'zh';
  }

  if (timeZoneLooksChinese()) {
    return 'zh';
  }

  return 'en';
}
