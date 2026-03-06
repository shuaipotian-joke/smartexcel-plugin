import type { Config } from 'tailwindcss';

export default {
  content: ['entrypoints/**/*.{ts,tsx,html}', 'components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          200: '#bcdfff',
          300: '#8eccff',
          400: '#58b0ff',
          500: '#3291ff',
          600: '#1a73f5',
          700: '#145de1',
          800: '#174bb6',
          900: '#19428f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
