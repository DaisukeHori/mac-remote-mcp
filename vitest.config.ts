import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Map src .js imports to .ts for vitest
      "../../src": resolve(__dirname, "src"),
      "../src": resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
    testTimeout: 15000,
    hookTimeout: 10000,
    globals: true,
  },
});
