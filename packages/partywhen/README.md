# partywhen

Sophisticated scheduler for durable tasks, built on Durable Object Alarms.

- schedule tasks by time, delay, or cron expression
- schedule multiple tasks on the same object
- query tasks by description or id (or by time range?)
- cancel tasks

The killer app: This will be particularly useful when wired up with an LLM agent, so you'll be able to schedule tasks by describing them in natural language. Like "remind me to call my friend every monday at 10:00"

```ts
import { Scheduler } from "partywhen";

export { Scheduler };
// also setup wrangler.jsonc to create a durable object binding
// let's say you've done it this way:
/**
  {
    // ...
    "durable_objects": {
      "bindings": [
        {
          "name": "SCHEDULER",
          "class_name": "Scheduler"
        }
      ]
    },
    "migrations": [
      {
        "tag": "v1",
        "new_classes": ["Scheduler"]
      }
    ]
  }
*/

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // access a scheduler instance
    const id = env.SCHEDULER.idFromName("my-scheduler");
    const scheduler = env.SCHEDULER.get(id);
    // now you can use the scheduler
  }
};
```

A task has a few parts:

- **id**: a unique identifier for the task
- **description**: which is a string that you can use to identify the task
- **payload**: which is a JSON object that is passed to the task
- **type**: which is one of "delayed", "cron", or "scheduled"
  - **`type: delayed`**: the task will be run after a delay **`delayInSeconds`**
  - **`type: cron`**: the task will be run on a cron schedule **`cron`**
  - **`type: scheduled`**: the task will be run at a specific date **`time`**
  - **`type: no-schedule`**: the task will never be run (useful for tasks that have to be manually removed)
- **callback**: which is a function that is called when the task is run. It can be of type `webhook`, ` durable-object` or `service`
  - **`type: webhook`**: the task will be run by POSTing to a **`url`**
  - **`type: durable-object`**: the task will be run by calling a function on a durable object **`namespace`** named **`name`** with the function **`function`**
  - **`type: service`**: the task will be run by calling a function on a service **`service`** with the function **`function`**

Here are some examples:

- This will schedule a task to be run after a delay of 60 seconds, and call a webhook at `https://example.com/webhook` with the payload `{ message: "Hello, world!" }`

  ```ts
  scheduler.scheduleTask({
    id: "my-task",
    description: "my-task",
    type: "delayed",
    delayInSeconds: 60,
    payload: {
      message: "Hello, world!"
    },
    callback: {
      type: "webhook",
      url: "https://example.com/webhook"
    }
  });
  ```

- This will schedule a task to be run every Friday at 6pm, and call a durable object binding `MYDURABLE` of name "some-id" with the function `myFunction` with the payload `{ message: "Hello, world!" }`

  ```ts
  scheduler.scheduleTask({
    id: "my-task",
    description: "my-task",
    type: "cron",
    cron: "0 18 * * 5",
    payload: {
      message: "Hello, world!"
    },
    callback: {
      type: "durable-object",
      namespace: "MYDURABLE",
      name: "some-id",
      function: "myFunction"
    }
  });
  ```

- This will schedule a task to be run at a specific date and time, and call a service binding `MYSERVICE` with the function `myFunction` with the payload `{ message: "Hello, world!" }`

  ```ts
  scheduler.scheduleTask({
    id: "my-task",
    description: "my-task",
    type: "scheduled",
    time: new Date("2024-01-01T12:00:00Z"),
    payload: {
      message: "Hello, world!"
    },
    callback: {
      type: "service",
      service: "MYSERVICE",
      function: "myFunction"
    }
  });
  ```

## todo:

- add a dashboard for visualizing tasks and their status?
- how to handle errors?
- how to handle retries?
- testing story?
