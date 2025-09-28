import {
  createExecutionContext,
  env,
  waitOnExecutionContext
} from "cloudflare:test";
import cronParser from "cron-parser";
import { describe, expect, it } from "vitest";

import worker from ".";

function getStub(environment: typeof env) {
  const id = environment.SCHEDULER.idFromName("example");
  return environment.SCHEDULER.get(id);
}

describe("Hello World worker", () => {
  it("responds with Hello World!", async () => {
    const request = new Request("http://example.com");
    // Create an empty context to pass to `worker.fetch()`
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
    await waitOnExecutionContext(ctx);
    expect(await response.text()).toBe("Hello World!");
  });

  it("has an empty table when it starts", async () => {
    const stub = getStub(env);
    const { result } = await stub.getAllTasks();
    expect(result).toEqual([]);
  });

  it("can schedule a scheduled task", async () => {
    const stub = getStub(env);
    const id = "scheduled-task-001";
    const time = new Date(Date.now() + 10000);
    const task = await stub.scheduleTask({
      id,
      description: "test",
      payload: { test: "test" },
      callback: {
        type: "webhook",
        url: "https://example.com"
      },
      type: "scheduled",
      time
    });

    expect(task).toMatchInlineSnapshot(`
      {
        "callback": {
          "type": "webhook",
          "url": "https://example.com",
        },
        "description": "test",
        "id": "scheduled-task-001",
        "payload": {
          "test": "test",
        },
        "time": ${time.toISOString()},
        "type": "scheduled",
      }
    `);
    const timestamp = Math.floor(time.getTime() / 1000);

    const debug = await stub.getAllTasks();
    expect(debug.result).toHaveLength(1);

    const {
      // biome-ignore lint/correctness/noUnusedVariables: it's fine
      created_at,
      ...rest
    } = (debug.result || [])[0];

    expect(rest).toMatchInlineSnapshot(`
      {
        "callback": "{"type":"webhook","url":"https://example.com"}",
        "cron": null,
        "delayInSeconds": null,
        "description": "test",
        "id": "scheduled-task-001",
        "payload": "{"test":"test"}",
        "time": ${timestamp},
        "type": "scheduled",
      }
    `);
  });

  it("can schedule a delayed task", async () => {
    const stub = getStub(env);
    const id = "delayed-task-001";
    const delayInSeconds = 10000;

    const task = await stub.scheduleTask({
      id,
      description: "test",
      payload: { test: "test" },
      callback: {
        type: "webhook",
        url: "https://example.com"
      },
      type: "delayed",
      delayInSeconds
    });

    const timestamp = Math.floor((Date.now() + delayInSeconds * 1000) / 1000);

    // pull out the time from the task
    const { time: taskTime } = task;

    expect(task).toMatchInlineSnapshot(`
      {
        "callback": {
          "type": "webhook",
          "url": "https://example.com",
        },
        "delayInSeconds": 10000,
        "description": "test",
        "id": "delayed-task-001",
        "payload": {
          "test": "test",
        },
        "time": ${
          // @ts-expect-error I'm bad at typescript
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          taskTime.toISOString()
        },
        "type": "delayed",
      }
    `);

    const debug = await stub.getAllTasks();
    expect(debug.result).toHaveLength(1);

    const {
      // biome-ignore lint/correctness/noUnusedVariables: it's fine
      created_at,
      ...rest
    } = (debug.result || [])[0];

    expect(rest).toMatchInlineSnapshot(`
      {
        "callback": "{"type":"webhook","url":"https://example.com"}",
        "cron": null,
        "delayInSeconds": 10000,
        "description": "test",
        "id": "delayed-task-001",
        "payload": "{"test":"test"}",
        "time": ${timestamp},
        "type": "delayed",
      }
    `);
  });

  it("can schedule a cron task", async () => {
    const stub = getStub(env);
    const id = "cron-task-001";
    const cron = "0 0 * * 2";
    const next = cronParser.parseExpression(cron).next();
    const timestamp = Math.floor(next.toDate().getTime() / 1000);

    const task = await stub.scheduleTask({
      id,
      description: "test",
      payload: { test: "test" },
      callback: {
        type: "webhook",
        url: "https://example.com"
      },
      type: "cron",
      cron
    });

    expect(task).toMatchInlineSnapshot(`
      {
        "callback": {
          "type": "webhook",
          "url": "https://example.com",
        },
        "cron": "0 0 * * 2",
        "description": "test",
        "id": "cron-task-001",
        "payload": {
          "test": "test",
        },
        "time": ${next.toDate().toISOString()},
        "type": "cron",
      }
    `);

    const debug = await stub.getAllTasks();
    expect(debug.result).toHaveLength(1);

    const {
      // biome-ignore lint/correctness/noUnusedVariables: it's fine
      created_at,
      ...rest
    } = (debug.result || [])[0];

    expect(rest).toMatchInlineSnapshot(`
      {
        "callback": "{"type":"webhook","url":"https://example.com"}",
        "cron": "0 0 * * 2",
        "delayInSeconds": null,
        "description": "test",
        "id": "cron-task-001",
        "payload": "{"test":"test"}",
        "time": ${timestamp},
        "type": "cron",
      }
    `);
  });

  it("can schedule a no-schedule task", async () => {
    const stub = getStub(env);
    const id = "no-schedule-task-001";
    // const time = new Date(Date.now());
    const task = await stub.scheduleTask({
      id,
      description: "test",
      payload: { test: "test" },
      callback: {
        type: "webhook",
        url: "https://example.com"
      },
      type: "no-schedule"
    });

    // let's pull out the time from the task
    const { time } = task;

    expect(task).toMatchInlineSnapshot(`
      {
        "callback": {
          "type": "webhook",
          "url": "https://example.com",
        },
        "description": "test",
        "id": "no-schedule-task-001",
        "payload": {
          "test": "test",
        },
        "time": ${
          // @ts-expect-error I'm bad at typescript
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          time.toISOString()
        },
        "type": "no-schedule",
      }
    `);

    const debug = await stub.getAllTasks();
    expect(debug.result).toHaveLength(1);

    const {
      // biome-ignore lint/correctness/noUnusedVariables: it's fine
      created_at,
      ...rest
    } = (debug.result || [])[0];

    expect(rest).toMatchInlineSnapshot(`
      {
        "callback": "{"type":"webhook","url":"https://example.com"}",
        "cron": null,
        "delayInSeconds": null,
        "description": "test",
        "id": "no-schedule-task-001",
        "payload": "{"test":"test"}",
        "time": ${Math.floor(
          // @ts-expect-error I'm bad at typescript
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          time.getTime() / 1000
        )},
        "type": "no-schedule",
      }
    `);
  });
});
