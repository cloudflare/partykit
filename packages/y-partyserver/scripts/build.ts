import { execSync } from "node:child_process";
import { build } from "tsdown";

await build({
  entry: [
    "src/server/index.ts",
    "src/provider/index.ts",
    "src/provider/react.tsx"
  ],
  external: ["cloudflare:workers"],
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
  dts: true,
  skipNodeModulesBundle: true,
  fixedExtension: false
});

// then run oxfmt on the generated files
execSync("oxfmt ./dist/**/*.d.cts");
execSync("oxfmt ./dist/**/*.d.ts");
execSync("oxfmt ./dist/**/*.cjs");
execSync("oxfmt ./dist/**/*.js");

process.exit(0);
