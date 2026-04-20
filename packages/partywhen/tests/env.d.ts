/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { Scheduler } from "../src/index";

type _Env = {
  SCHEDULER: DurableObjectNamespace<Scheduler<_Env>>;
};

export type Env = _Env;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends _Env {}
    interface GlobalProps {
      mainModule: typeof import("./index");
    }
  }
}
