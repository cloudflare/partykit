import { build } from "tsdown";

await build({
  entry: ["src/client/index.ts", "src/react/index.ts", "src/server/index.ts"],
  external: ["cloudflare:workers"],
  sourcemap: true,
  clean: true,
  format: "esm",
  dts: true,
  skipNodeModulesBundle: true,
  fixedExtension: false
});

process.exit(0);
