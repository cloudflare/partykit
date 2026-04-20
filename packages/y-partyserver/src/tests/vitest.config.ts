import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: path.join(import.meta.dirname, "wrangler.jsonc")
      }
    })
  ],
  test: {
    include: [path.join(import.meta.dirname, "index.test.ts")],
    setupFiles: [path.join(import.meta.dirname, "setup.ts")]
  }
});
