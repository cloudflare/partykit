import { execSync } from "node:child_process";
import { build } from "tsdown";

async function run() {
  await build({
    entry: [
      "src/index.ts",
      "src/react.ts",
      "src/ws.ts",
      "src/use-ws.ts",
      "src/event-target-polyfill.ts"
    ],
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
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
