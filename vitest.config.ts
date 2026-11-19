import { defineConfig } from 'vitest/config';

// Parser + export tests on HTML fixtures (no browser, no WXT runtime).
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
