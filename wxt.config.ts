import { defineConfig } from 'wxt';
import packageJson from './package.json';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SmartExcel - Table to Excel Exporter',
    description: '智能识别网页表格，一键导出为 Excel 文件',
    version: packageJson.version,
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
    permissions: ['activeTab', 'storage', 'scripting', 'contextMenus', 'downloads'],
    host_permissions: [
      'http://*/*',
      'https://*/*',
    ],
    action: {
      default_title: 'SmartExcel',
      default_icon: {
        16: '/icon-16.png',
        32: '/icon-32.png',
        48: '/icon-48.png',
        128: '/icon-128.png',
      },
    },
  },
});
