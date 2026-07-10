import { defineConfig } from 'vitest/config';

// The engine and rules modules are pure, so they run in a plain node environment.
// No jsdom needed: nothing under test touches the DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
