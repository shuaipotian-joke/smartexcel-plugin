/**
 * Warm, calm palette shared by the popup (via tailwind.config.ts) and the
 * in-page overlay (inline styles inside the shadow root): off-white paper,
 * clay accent, soft borders, serif headings over a plain sans body.
 */
export const theme = {
  paper: '#faf9f5',
  surface: '#ffffff',
  subtle: '#f2efe6',
  ink: '#1f1e1b',
  text: '#3d3a33',
  muted: '#6f6a5f',
  faint: '#9a9387',
  line: '#e7e2d6',
  lineStrong: '#d6cfbf',
  accent: '#c96442',
  accentHover: '#b0553a',
  accentSoft: '#f6e8e0',
  danger: '#a8402e',
  dangerSoft: '#f9e9e4',
  success: '#5d7a4c',
  fontSans:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  fontSerif:
    'ui-serif, Georgia, Cambria, "Times New Roman", "Songti SC", "Noto Serif SC", serif',
  shadow: '0 1px 2px rgba(31,30,27,0.04), 0 12px 32px -16px rgba(31,30,27,0.22)',
  shadowLift: '0 2px 4px rgba(31,30,27,0.05), 0 24px 56px -24px rgba(31,30,27,0.30)',
} as const;
