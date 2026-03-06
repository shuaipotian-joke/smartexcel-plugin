import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SmartExcel - Table to Excel Exporter',
    description: '智能识别网页表格，一键导出为 Excel 文件',
    version: '0.1.0',
    permissions: ['activeTab', 'storage'],
    action: {
      default_title: 'SmartExcel',
    },
  },
});
