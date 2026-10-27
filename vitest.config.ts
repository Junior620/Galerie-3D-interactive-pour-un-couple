import { defineConfig } from 'vitest/config';

// Tests unitaires de la logique pure (sans navigateur ni WebGL).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
