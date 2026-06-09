import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        'src/main.jsx', // entry - tested via E2E
      ],
      // Coverage gate. The UI suite is currently a smoke test (Dashboard +
      // UnauthorizedHelp); honest reading is ~2.5% lines/statements. Set
      // the threshold just below current reality so a regression to an
      // empty suite still surfaces. Raise as new test files land.
      thresholds: {
        lines: 2,
        functions: 0,
        branches: 0,
        statements: 2,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
