import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every suite imports describe/it/expect/vi explicitly from "vitest",
    // so the globals are off: a missing import is a compile error, not a
    // silently-resolved global.
    globals: false,
    environment: "node",
    // Pin the worker clock to UTC so date-sensitive suites give the same
    // result on a laptop, in CI and in CodeBuild, whatever the host offset.
    env: { TZ: "UTC" },
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
  },
});
