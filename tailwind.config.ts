import type { Config } from 'tailwindcss';
import { theme as palette } from './utils/theme';

export default {
  content: ['entrypoints/**/*.{ts,tsx,html}', 'components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: palette.paper,
        subtle: palette.subtle,
        ink: palette.ink,
        body: palette.text,
        muted: palette.muted,
        faint: palette.faint,
        line: palette.line,
        'line-strong': palette.lineStrong,
        clay: {
          DEFAULT: palette.accent,
          hover: palette.accentHover,
          soft: palette.accentSoft,
        },
        danger: {
          DEFAULT: palette.danger,
          soft: palette.dangerSoft,
        },
        success: palette.success,
      },
      fontFamily: {
        sans: palette.fontSans.split(', '),
        serif: palette.fontSerif.split(', '),
      },
      boxShadow: {
        soft: palette.shadow,
        lift: palette.shadowLift,
      },
    },
  },
  plugins: [],
} satisfies Config;
