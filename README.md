# SmartExcel Plugin

智能识别网页表格，一键导出为 Excel 文件的浏览器扩展。

## 功能

- **自动识别** — 自动检测页面中所有 `<table>` 元素
- **悬停提示** — 鼠标移到表格上显示导出浮动按钮
- **多格式导出** — 支持 `.xlsx` / `.csv` 格式
- **一键复制** — 复制表格数据到剪贴板
- **批量导出** — 一次导出页面所有表格
- **AI 联动** — 发送表格到 SmartExcel 网站进行 AI 处理

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| WXT | 0.19+ | 跨浏览器扩展框架 |
| React | 19 | UI 组件 |
| TypeScript | 5.6+ | 类型安全 |
| Tailwind CSS | 3.4 | 样式 |
| Zustand | 5 | 状态管理 |
| SheetJS | 0.20+ | Excel 导出引擎 |
| Vite | 6 (WXT 内置) | 构建工具 |

## 支持浏览器

| 浏览器 | Manifest | 状态 |
|--------|----------|------|
| Chrome | V3 | ✅ |
| Edge | V3 | ✅ |
| Firefox | V2/V3 | ✅ |
| Safari | V2/V3 | ✅ |
| Opera | V3 | ✅ |
| Brave / Arc | V3 | ✅ |

## 开发

```bash
# 安装依赖
npm install

# 开发模式 (Chrome)
npm run dev

# 开发模式 (Firefox)
npm run dev:firefox

# 开发模式 (Edge)
npm run dev:edge
```

## 构建

```bash
# 构建 Chrome 版本
npm run build

# 构建 Firefox 版本
npm run build:firefox

# 构建所有浏览器版本
npm run build:all

# 打包所有浏览器版本为 zip
npm run zip:all
```

## 项目结构

```
smartexcel-plugin/
├── entrypoints/          # WXT 入口文件
│   ├── background.ts     # Service Worker
│   ├── content.tsx        # 内容脚本 (表格检测)
│   └── popup/             # 弹窗 UI
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx
├── components/            # React 组件
│   └── TableOverlay.tsx   # 表格悬浮覆盖层
├── utils/                 # 工具函数
│   ├── excel-export.ts    # Excel 导出逻辑
│   ├── table-parser.ts    # 表格解析器
│   ├── messaging.ts       # 消息通信
│   └── store.ts           # Zustand 状态管理
├── assets/styles/         # 样式文件
├── public/                # 静态资源
├── wxt.config.ts          # WXT 配置
├── tailwind.config.ts     # Tailwind 配置
└── tsconfig.json          # TypeScript 配置
```

## License

MIT
