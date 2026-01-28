/**
 * @vitest-environment node
 */

/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vitest
} from "vitest";
import NodeWebSocket, { WebSocketServer } from "ws";

// import type { ErrorEvent } from "../ws";
import ReconnectingWebSocket from "../ws";

const PORT = 50122;
const URL = `ws://localhost:${PORT}/`;
// const ERROR_URL = "ws://255.255.255.255";

// @ts-expect-error ws types are weird
let wss: NodeWebSocket.Server<typeof NodeWebSocket.WebSocket>;
const originalWebSocket = global.WebSocket;

function testDone(
  name: string,
  fn: (resolve: () => void, reject: (e: unknown) => void) => void
) {
  test(name, toPromise(fn));
}

function toPromise(
  fn: (resolve: () => void, reject: (e: unknown) => void) => void
) {
  return () =>
    new Promise<void>((resolve, reject) => {
      fn(resolve, reject);
    });
}

beforeAll(() => {
  wss = new WebSocketServer({ port: PORT });
});

beforeEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  (global as any).WebSocket = originalWebSocket;
});

afterEach(() => {
  vitest.restoreAllMocks();
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    wss.clients.forEach((client: NodeWebSocket) => {
      client.terminate();
    });
    wss.close(() => {
      resolve();
    });
  });
});

// test("throws with invalid constructor", () => {
//   delete (global as any).WebSocket;
//   expect(() => {
//     new ReconnectingWebSocket(URL, undefined, {
//       // @ts-expect-error we're purposefully passing an invalid constructor
//       WebSocket: 123,
//       maxRetries: 0,
//     });
//   }).toThrow();
// });

// test("throws with missing constructor", () => {
//   delete (global as any).WebSocket;
//   expect(() => {
//     new ReconnectingWebSocket(URL, undefined, { maxRetries: 0 });
//   }).toThrow();
// });

// test("throws with non-constructor object", () => {
//   (global as any).WebSocket = {};
//   expect(() => {
//     new ReconnectingWebSocket(URL, undefined, { maxRetries: 0 });
//   }).toThrow();
// });

testDone("pass WebSocket via options", (done) => {
  // biome-ignore lint/suspicious/noExplicitAny: legacy
  delete (global as any).WebSocket;
  const ws = new ReconnectingWebSocket(URL, undefined, {
    WebSocket: NodeWebSocket,
    maxRetries: 0
  });
  ws.reconnect();
  ws.addEventListener("open", () => {
    // @ts-expect-error - accessing private property
    expect(ws._ws instanceof NodeWebSocket).toBe(true);
    ws.close();
    done();
  });
});
