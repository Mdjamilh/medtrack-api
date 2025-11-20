import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    env: { NODE_ENV: "test", AUTH_RATE_LIMIT: "1000" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/**/*.test.ts"],
      reporter: ["text-summary", "html"],
    },
  },
});
