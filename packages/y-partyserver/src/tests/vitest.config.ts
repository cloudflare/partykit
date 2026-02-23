import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["index.test.ts"],
    poolOptions: {
      workers: {
        isolatedStorage: false,
        wrangler: {
          configPath: "./wrangler.jsonc"
        }
      }
    }
  }
});
