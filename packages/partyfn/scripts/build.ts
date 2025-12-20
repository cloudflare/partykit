import { execSync } from "node:child_process";
import { build } from "tsdown";

await build({
  entry: ["src/index.ts"],
  sourcemap: true,
  clean: true,
  format: "esm",
  dts: true,
  skipNodeModulesBundle: true,
  fixedExtension: false
});

// then run prettier on the generated .d.ts files
execSync("prettier --write ./dist/**/*.d.ts");

process.exit(0);
