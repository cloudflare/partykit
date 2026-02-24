import { execSync } from "node:child_process";
import { build } from "tsdown";

await build({
  entry: [
    "src/server/index.ts",
    "src/client/index.ts",
    "src/react/index.tsx",
    "src/agent/index.ts"
  ],
  external: ["cloudflare:workers", "partysocket", "partyfn"],
  sourcemap: true,
  clean: true,
  format: "esm",
  dts: true,
  skipNodeModulesBundle: true,
  fixedExtension: false
});

// then run oxfmt on the generated .d.ts files
execSync("oxfmt ./dist/**/*.d.ts");

process.exit(0);
