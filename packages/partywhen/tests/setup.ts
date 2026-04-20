import { beforeAll, beforeEach } from "vitest";
import { env, exports } from "cloudflare:workers";

// Warm up the worker module graph so the first test in each file doesn't
// time out waiting for Vite to lazy-resolve modules on cold start.
beforeAll(async () => {
  await exports.default.fetch(new Request("http://warmup/"));
}, 30_000);

// The new pool shares a single DO instance across tests (no more
// `isolatedStorage`), so reset the scheduler table between tests to keep
// assertions independent of execution order.
beforeEach(async () => {
  const id = env.SCHEDULER.idFromName("example");
  const stub = env.SCHEDULER.get(id);
  const { result } = await stub.getAllTasks();
  if (result) {
    for (const task of result) {
      await stub.cancelTask(task.id);
    }
  }
});
