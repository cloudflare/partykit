import cronParser from "cron-parser";
import { Server } from "partyserver";

export type RawTask = {
  id: string;
  description?: string | undefined;
  payload?: Record<string, unknown> | undefined;
  callback?: Callback | undefined;
} & (
  | {
      time: Date;
      type: "scheduled";
    }
  | {
      delayInSeconds: number;
      type: "delayed";
    }
  | {
      cron: string;
      type: "cron";
    }
  | {
      type: "no-schedule";
    }
);

export type Task = RawTask & {
  time: Date;
};

export type SqlTask = {
  id: string;
  description: string | null;
  payload: string | null;
  callback: string | null;
  created_at: number;
} & (
  | {
      type: "scheduled";
      time: number;
    }
  | {
      type: "delayed";
      time: number;
      delayInSeconds: number;
    }
  | {
      type: "cron";
      time: number;
      cron: string;
    }
  | {
      type: "no-schedule";
      time: number;
    }
);

type Callback =
  | {
      type: "self";
      function: string;
    }
  | {
      type: "webhook";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "durable-object";
      namespace: string;
      name: string;
      function: string;
    }
  | {
      type: "service";
      service: string;
      function: string;
    };

export class Scheduler<
  Env extends Cloudflare.Env = Cloudflare.Env
> extends Server<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    void this.ctx.blockConcurrencyWhile(async () => {
      // Create tasks table if it doesn't exist
      this.ctx.storage.sql.exec(
        `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        description TEXT,
        payload TEXT,
        callback TEXT,
        type TEXT NOT NULL CHECK(type IN ('scheduled', 'delayed', 'cron', 'no-schedule')),
        time INTEGER,
        delayInSeconds INTEGER,
        cron TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `
      );

      // execute any pending tasks and schedule the next alarm
      await this.alarm();
    });
  }

  status() {
    return {
      status: "reachable" as const,
      timestamp: Date.now(),
      diskUsage: this.ctx.storage.sql.databaseSize
    };
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response("Hello World!");
  }

  getAllTasks() {
    // return entire database
    return this.querySql<SqlTask>([{ sql: "SELECT * FROM tasks" }]);
  }

  private async scheduleNextAlarm() {
    // Find the next task that needs to be executed
    const query = `
      SELECT time FROM tasks 
      WHERE time > ? 
      AND type != 'no-schedule'
      ORDER BY time ASC 
      LIMIT 1
    `;
    const { result } = this.querySql<SqlTask>([
      { sql: query, params: [Math.floor(Date.now() / 1000)] }
    ]);
    if (!result) return;

    if (result.length > 0 && "time" in result[0]) {
      const nextTime = result[0].time * 1000;
      await this.ctx.storage.setAlarm(nextTime);
    }
  }

  async scheduleTask(task: RawTask): Promise<Task> {
    const { id } = task;

    console.log("scheduling task", task);

    if ("time" in task && task.time) {
      const timestamp = Math.floor(task.time.getTime() / 1000);
      const query = `
        INSERT OR REPLACE INTO tasks (id, description, payload, callback, type, time)
        VALUES (?, ?, ?, ?, 'scheduled', ?)
      `;
      this.querySql([
        {
          sql: query,
          params: [
            id,
            task.description || null,
            JSON.stringify(task.payload || null),
            JSON.stringify(task.callback || null),
            timestamp
          ]
        }
      ]);

      await this.scheduleNextAlarm();

      return {
        id,
        description: task.description,
        payload: task.payload,
        callback: task.callback,
        time: task.time,
        type: "scheduled"
      };
    } else if ("delayInSeconds" in task && task.delayInSeconds) {
      const time = new Date(Date.now() + task.delayInSeconds * 1000);
      const timestamp = Math.floor(time.getTime() / 1000);
      const query = `
        INSERT OR REPLACE INTO tasks (id, description, payload, callback, type, delayInSeconds, time)
        VALUES (?, ?, ?, ?, 'delayed', ?, ?)
      `;

      this.querySql([
        {
          sql: query,
          params: [
            id,
            task.description || null,
            JSON.stringify(task.payload || null),
            JSON.stringify(task.callback || null),
            task.delayInSeconds,
            timestamp
          ]
        }
      ]);

      await this.scheduleNextAlarm();

      return {
        id,
        description: task.description,
        payload: task.payload,
        callback: task.callback,
        delayInSeconds: task.delayInSeconds,
        time,
        type: "delayed"
      };
    } else if ("cron" in task && task.cron) {
      const nextExecutionTime = this.getNextCronTime(task.cron);
      const timestamp = Math.floor(nextExecutionTime.getTime() / 1000);
      const query = `
        INSERT OR REPLACE INTO tasks (id, description, payload, callback, type, cron, time)
        VALUES (?, ?, ?, ?, 'cron', ?, ?)
      `;
      this.querySql([
        {
          sql: query,
          params: [
            id,
            task.description || null,
            JSON.stringify(task.payload || null),
            JSON.stringify(task.callback || null),
            task.cron,
            timestamp
          ]
        }
      ]);

      await this.scheduleNextAlarm();

      return {
        id,
        description: task.description,
        payload: task.payload,
        callback: task.callback,
        cron: task.cron,
        time: nextExecutionTime,
        type: "cron"
      };
    } else {
      const time = new Date(8640000000000000);
      const timestamp = Math.floor(time.getTime() / 1000);
      const query = `
        INSERT OR REPLACE INTO tasks (id, description, payload, callback, type, time)
        VALUES (?, ?, ?, ?, 'no-schedule', ?)
      `;
      this.querySql([
        {
          sql: query,
          params: [
            id,
            task.description || null,
            JSON.stringify(task.payload || null),
            JSON.stringify(task.callback || null),
            timestamp
          ]
        }
      ]);

      return {
        id,
        description: task.description,
        payload: task.payload,
        callback: task.callback,
        time,
        type: "no-schedule"
      };
    }
  }

  async alarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Get all tasks that should be executed now
    const { result: tasks } = this.querySql<SqlTask>([
      { sql: "SELECT * FROM tasks WHERE time <= ?", params: [now] }
    ]);

    for (const row of tasks || []) {
      const task = this.rowToTask(row);
      await this.executeTask(task);

      if (task.type === "cron") {
        // Update next execution time for cron tasks
        const nextExecutionTime = this.getNextCronTime(task.cron);
        const nextTimestamp = Math.floor(nextExecutionTime.getTime() / 1000);

        this.querySql([
          {
            sql: "UPDATE tasks SET time = ? WHERE id = ?",
            params: [nextTimestamp, task.id]
          }
        ]);
      } else {
        // Delete one-time tasks after execution
        this.querySql([
          { sql: "DELETE FROM tasks WHERE id = ?", params: [task.id] }
        ]);
      }
    }

    // Schedule the next alarm
    await this.scheduleNextAlarm();
  }

  private rowToTask(row: SqlTask): Task {
    const base = {
      id: row.id,
      description: row.description,
      payload: row.payload
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : undefined,
      callback: row.callback
        ? (JSON.parse(row.callback) as Callback)
        : undefined
    } as RawTask;

    switch (row.type) {
      case "scheduled":
        return {
          ...base,
          time: new Date(row.time * 1000),
          type: "scheduled"
        };
      case "delayed":
        return {
          ...base,
          delayInSeconds: row.delayInSeconds,
          time: new Date(row.time * 1000),
          type: "delayed"
        };
      case "cron":
        return {
          ...base,
          cron: row.cron,
          time: new Date(row.time * 1000),
          type: "cron"
        };
      case "no-schedule":
        return {
          ...base,
          time: new Date(row.time * 1000),
          type: "no-schedule"
        };
      default:
        // @ts-expect-error expected wrong type
        throw new Error(`Unknown task type: ${row.type as string}`);
    }
  }

  private async executeTask(task: Task): Promise<void> {
    // This is where you would implement the actual task execution
    console.log(`Executing task ${task.id}:`, task);
    if ("callback" in task && task.callback) {
      const { type } = task.callback;
      if (type === "webhook") {
        const response = await fetch(task.callback.url, {
          method: "POST",
          body: JSON.stringify(task),
          headers: {
            ...(task.callback.headers || {}),
            "Content-Type": "application/json"
          }
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Webhook failed with status ${response.status} and body ${text}`
          );
        }
        // drain body
        const responseBody = await response.text();
        console.log(`Webhook response body: ${responseBody}`);
      } else if (type === "durable-object") {
        //@ts-expect-error yeah whatever
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const id = this.env[task.callback.namespace as keyof Env].idFromName(
          task.callback.name
        );
        //@ts-expect-error yeah whatever
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const stub = this.env[task.callback.namespace as keyof Env].get(id);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        stub[task.callback.function](task).catch((e: unknown) => {
          console.error("Error executing durable object function:", e);
        });
      } else if (type === "service") {
        //@ts-expect-error  yeah whatever
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.env[task.callback.service as keyof Env][task.callback.function](
          task
        );
      } else if (type === "self") {
        //@ts-expect-error  yeah whatever
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        this[task.callback.function](task);
      } else {
        console.error("unknown callback type", task);
      }
    } else {
      console.error("missing callback", task);
    }
  }

  private getNextCronTime(cronExpression: string): Date {
    const interval = cronParser.parse(cronExpression);
    return interval.next().toDate();
  }

  async query(
    criteria: {
      description?: string;
      id?: string;
      type?: "scheduled" | "delayed" | "cron" | "no-schedule";
      timeRange?: { start?: Date; end?: Date };
    } = {}
  ): Promise<Task[]> {
    let query = "SELECT * FROM tasks WHERE 1=1";
    const params: SqliteParams[] = [];

    if (criteria.id) {
      query += " AND id = ?";
      params.push(criteria.id);
    }

    if (criteria.description) {
      query += " AND description = ?";
      params.push(criteria.description);
    }

    if (criteria.type) {
      query += " AND type = ?";
      params.push(criteria.type);
    }

    if (criteria.timeRange) {
      query += " AND time >= ? AND time <= ?";
      const start = criteria.timeRange.start || new Date(0);
      const end = criteria.timeRange.end || new Date(999999999999999);
      params.push(
        Math.floor(start.getTime() / 1000),
        Math.floor(end.getTime() / 1000)
      );
    }

    const { result } = this.querySql<SqlTask>([{ sql: query, params }]);
    return result?.map((row) => this.rowToTask(row)) || [];
  }

  async cancelTask(id: string): Promise<boolean> {
    const query = "DELETE FROM tasks WHERE id = ?";
    this.querySql([{ sql: query, params: [id] }]);

    await this.scheduleNextAlarm();
    return true;
  }

  querySql<T>(qs: SqliteQuery[], isRaw = false): SqlResult<T> {
    try {
      if (!qs.length) {
        throw new Error("No query found to run");
      }

      const queries =
        qs?.map((item) => {
          const { sql, params } = item;
          if (!sql?.trim()) {
            throw new Error("Empty 'sql' field in transaction");
          }
          return { sql, params };
        }) || [];

      let result: QueryResponse<T> | QueryResponse<T>[];

      if (queries.length > 1) {
        result = this.executeTransaction<T>(queries, isRaw);
      } else {
        const [query] = queries;
        result = this.executeQuery<T>(query.sql, query.params, isRaw);
      }

      return {
        error: null,
        status: 200,
        result: result as T[]
      };
    } catch (error) {
      return {
        result: null,
        error: (error as Error).message ?? "Operation failed.",
        status: 500
      };
    }
  }

  private executeTransaction<T>(
    queries: { sql: string; params?: SqliteParams[] }[],
    isRaw: boolean
  ): QueryResponse<T>[] {
    return this.ctx.storage.transactionSync(() => {
      const results: QueryResponse<T>[] = [];

      for (const queryObj of queries) {
        const { sql, params } = queryObj;
        const result = this.executeQuery<T>(sql, params, isRaw);
        results.push(result);
      }

      return results;
    });
  }

  executeQuery<T>(
    sql: string,
    params: SqliteParams[] | undefined,
    isRaw: boolean
  ): QueryResponse<T> {
    const cursor = params?.length
      ? this.ctx.storage.sql.exec(sql, ...params)
      : this.ctx.storage.sql.exec(sql);

    let result: QueryResponse<T>;

    if (isRaw) {
      result = {
        columns: cursor.columnNames,
        // @ts-expect-error TODO fix this!!!
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        rows: (cursor.raw() as unknown as T[]).toArray() as T[],
        meta: {
          rows_read: cursor.rowsRead,
          rows_written: cursor.rowsWritten
        }
      };
    } else {
      result = cursor.toArray() as T[];
    }

    return result;
  }
}

export type SqlResult<T> =
  | {
      result: T[];
      error: null;
      status: 200;
    }
  | {
      result: null;
      error: string;
      status: 500 | 408;
    };

export type RawSqliteResponse<T> = {
  columns: string[];
  rows: T[];
  meta: {
    rows_read: number;
    rows_written: number;
  };
};

type QueryResponse<T> = T[] | RawSqliteResponse<T>;

export type SqliteParams = number | string | boolean | null;
export type SqliteQuery = {
  sql?: string;
  params?: SqliteParams[];
};
