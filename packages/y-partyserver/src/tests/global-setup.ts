import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";

const PORT = 8799;
let wranglerProcess: ChildProcess | null = null;

async function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

export async function setup() {
  const testDir = path.dirname(new URL(import.meta.url).pathname);

  // Start wrangler dev
  wranglerProcess = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--config",
      path.join(testDir, "integration-wrangler.jsonc"),
      "--port",
      String(PORT),
      "--no-show-interactive-dev-session"
    ],
    {
      cwd: testDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Suppress interactive prompts
        BROWSER: "none"
      }
    }
  );

  // Log wrangler output for debugging
  wranglerProcess.stdout?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (process.env.DEBUG) {
      process.stderr.write(`[wrangler] ${msg}`);
    }
  });
  wranglerProcess.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (process.env.DEBUG) {
      process.stderr.write(`[wrangler:err] ${msg}`);
    }
  });

  // Wait for the server to be ready
  await waitForServer(`http://localhost:${PORT}/`);
}

export async function teardown() {
  if (wranglerProcess) {
    wranglerProcess.kill("SIGTERM");
    // Give it a moment to shut down gracefully
    await new Promise((r) => setTimeout(r, 500));
    if (wranglerProcess.exitCode === null) {
      wranglerProcess.kill("SIGKILL");
    }
    wranglerProcess = null;
  }
}
