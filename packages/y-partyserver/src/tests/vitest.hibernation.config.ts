import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["hibernation.test.ts"],
    testTimeout: 120000,
    hookTimeout: 60000
  }
});
