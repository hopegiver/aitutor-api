import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.js'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'test/**',
        'dist/**',
        '**/*.config.js',
        '**/*.config.ts'
      ]
    },
    setupFiles: ['./test/setup.js']
  },
  resolve: {
    alias: {
      // Web APIs polyfills for Node.js environment
      'crypto': 'node:crypto'
    }
  }
});