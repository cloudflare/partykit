import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["integration.test.ts"],
    testTimeout: 30000,
    globalSetup: ["./global-setup.ts"]
  }
});
