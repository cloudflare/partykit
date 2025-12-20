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

  // then run prettier on the generated files
  execSync("prettier --write ./dist/**/*.d.cts");
  execSync("prettier --write ./dist/**/*.d.ts");
  execSync("prettier --write ./dist/**/*.cjs");
  execSync("prettier --write ./dist/**/*.js");

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
