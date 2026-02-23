import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);

export class WranglerServer {
  private process: ChildProcess | null = null;
  private port: number;
  private persistDir: string;

  constructor(port: number) {
    this.port = port;
    this.persistDir = path.join(TEST_DIR, `.wrangler-persist-${port}`);
  }

  async start(): Promise<void> {
    this.process = spawn(
      "npx",
      [
        "wrangler",
        "dev",
        "--config",
        path.join(TEST_DIR, "integration-wrangler.jsonc"),
        "--port",
        String(this.port),
        "--persist-to",
        this.persistDir,
        "--no-show-interactive-dev-session"
      ],
      {
        cwd: TEST_DIR,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          BROWSER: "none"
        }
      }
    );

    this.process.stdout?.on("data", (data: Buffer) => {
      if (process.env.DEBUG) {
        process.stderr.write(`[wrangler:${this.port}] ${data.toString()}`);
      }
    });
    this.process.stderr?.on("data", (data: Buffer) => {
      if (process.env.DEBUG) {
        process.stderr.write(`[wrangler:${this.port}:err] ${data.toString()}`);
      }
    });

    await this.waitForReady();
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    this.process = null;

    proc.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 3000);
      proc.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // Brief pause to let the OS release the port
    await new Promise((r) => setTimeout(r, 500));
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  cleanup(): void {
    if (fs.existsSync(this.persistDir)) {
      fs.rmSync(this.persistDir, { recursive: true, force: true });
    }
  }

  private async waitForReady(timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${this.port}/`);
        if (res.ok || res.status === 404) return;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(
      `Server on port ${this.port} did not start within ${timeoutMs}ms`
    );
  }
}
