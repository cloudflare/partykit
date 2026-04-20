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
  // cron-parser (CJS) does `require("luxon")`. Vite's module runner loads
  // luxon's ESM entry through its CJS shim, and `DateTime` comes back
  // undefined. Forcing the resolution to luxon's CJS build gives us a
  // module shape that cron-parser can use.
  resolve: {
    alias: {
      luxon: path.join(
        import.meta.dirname,
        "../../../node_modules/luxon/build/node/luxon.js"
      )
    }
  },
  test: {
    setupFiles: [path.join(import.meta.dirname, "setup.ts")]
  }
});
