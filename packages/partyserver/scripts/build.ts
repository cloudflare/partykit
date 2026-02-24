import { execSync } from "node:child_process";
import { build } from "tsdown";

await build({
  entry: ["src/index.ts"],
  external: ["cloudflare:workers"],
  sourcemap: true,
  clean: true,
  format: "esm",
  dts: true,
  skipNodeModulesBundle: true,
  fixedExtension: false
});

// then run oxfmt on the generated .d.ts files
execSync("oxfmt ./dist/*.d.ts");

process.exit(0);
