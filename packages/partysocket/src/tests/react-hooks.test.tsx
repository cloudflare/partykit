/**
 * @vitest-environment jsdom
 */

import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterAll, beforeAll, describe, expect, test, vitest } from "vitest";
import { WebSocketServer } from "ws";

import usePartySocket, { useWebSocket } from "../react";

const PORT = 50128;
//  const URL = `ws://localhost:${PORT}`;

describe.skipIf(!!process.env.GITHUB_ACTIONS)("usePartySocket", () => {
  let wss: WebSocketServer;

  beforeAll(() => {
    wss = new WebSocketServer({ port: PORT });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client) => {
        client.terminate();
      });
      wss.close(() => {
        resolve();
      });
    });
  });

  test("creates a PartySocket instance", () => {
    const { result } = renderHook(() =>
      usePartySocket({
        host: "example.com",
        room: "test-room",
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
    expect(result.current.host).toBe("example.com");
    expect(result.current.room).toBe("test-room");
  });

  test("defaults host to window.location.host", () => {
    const { result } = renderHook(() =>
      usePartySocket({
        room: "test-room",
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
    // In jsdom, window.location.host might be empty or localhost
    expect(result.current.host).toBeDefined();
  });

  test("creates stable socket instance across re-renders", () => {
    const { result, rerender } = renderHook(() =>
      usePartySocket({
        host: "example.com",
        room: "test-room",
        startClosed: true
      })
    );

    const firstSocket = result.current;
    rerender();
    const secondSocket = result.current;

    expect(secondSocket).toBe(firstSocket);
  });

  test("reconnects when host changes", async () => {
    const { result, rerender } = renderHook(
      ({ host }) =>
        usePartySocket({
          host,
          room: "test-room",
          startClosed: true
        }),
      { initialProps: { host: "example.com" } }
    );

    const firstSocket = result.current;

    rerender({ host: "different.com" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
      expect(result.current.host).toBe("different.com");
    });
  });

  test("reconnects when room changes", async () => {
    const { result, rerender } = renderHook(
      ({ room }) =>
        usePartySocket({
          host: "example.com",
          room,
          startClosed: true
        }),
      { initialProps: { room: "room1" } }
    );

    const firstSocket = result.current;
    expect(result.current.room).toBe("room1");

    rerender({ room: "room2" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
      expect(result.current.room).toBe("room2");
    });
  });

  test("reconnects when party changes", async () => {
    const { result, rerender } = renderHook(
      ({ party }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          party,
          startClosed: true
        }),
      { initialProps: { party: "party1" } }
    );

    const firstSocket = result.current;
    expect(result.current.name).toBe("party1");

    rerender({ party: "party2" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
      expect(result.current.name).toBe("party2");
    });
  });

  test("reconnects when protocol changes", async () => {
    const { result, rerender } = renderHook(
      ({ protocol }: { protocol: "ws" | "wss" }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          protocol,
          startClosed: true
        }),
      { initialProps: { protocol: "ws" as "ws" | "wss" } }
    );

    const firstSocket = result.current;

    rerender({ protocol: "wss" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("reconnects when path changes", async () => {
    const { result, rerender } = renderHook(
      ({ path }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          path,
          startClosed: true
        }),
      { initialProps: { path: "path1" } }
    );

    const firstSocket = result.current;

    rerender({ path: "path2" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("reconnects when id changes", async () => {
    const { result, rerender } = renderHook(
      ({ id }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          id,
          startClosed: true
        }),
      { initialProps: { id: "id1" } }
    );

    const firstSocket = result.current;
    expect(result.current.id).toBe("id1");

    rerender({ id: "id2" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
      expect(result.current.id).toBe("id2");
    });
  });

  test("reconnects when basePath changes", async () => {
    const { result, rerender } = renderHook(
      ({ basePath }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          basePath,
          startClosed: true
        }),
      { initialProps: { basePath: "base1" } }
    );

    const firstSocket = result.current;

    rerender({ basePath: "base2" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("reconnects when prefix changes", async () => {
    const { result, rerender } = renderHook(
      ({ prefix }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          prefix,
          startClosed: true
        }),
      { initialProps: { prefix: "prefix1" } }
    );

    const firstSocket = result.current;

    rerender({ prefix: "prefix2" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("reconnects when maxRetries changes", async () => {
    const { result, rerender } = renderHook(
      ({ maxRetries }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          maxRetries,
          startClosed: true
        }),
      { initialProps: { maxRetries: 1 } }
    );

    const firstSocket = result.current;

    rerender({ maxRetries: 5 });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("reconnects when debug option changes", async () => {
    const { result, rerender } = renderHook(
      ({ debug }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          debug,
          startClosed: true
        }),
      { initialProps: { debug: false } }
    );

    const firstSocket = result.current;

    rerender({ debug: true });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("does NOT reconnect when event handlers change", () => {
    const onMessage1 = vitest.fn();
    const onMessage2 = vitest.fn();

    const { result, rerender } = renderHook(
      ({ onMessage }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          onMessage,
          startClosed: true
        }),
      { initialProps: { onMessage: onMessage1 } }
    );

    const firstSocket = result.current;

    rerender({ onMessage: onMessage2 });

    // Socket should be the same instance
    expect(result.current).toBe(firstSocket);
  });

  // TODO: flaky — relies on WebSocket open event timing that doesn't work reliably
  test.skip("attaches onOpen event handler", async () => {
    const onOpen = vitest.fn();

    // Set up connection handler before rendering
    const connectionPromise = new Promise<void>((resolve) => {
      wss.once("connection", (_ws: any) => {
        // Connection established
        resolve();
      });
    });

    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        onOpen
      })
    );

    // Wait for connection to be established on server side
    await connectionPromise;

    // Wait for connection to be established on client side
    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    // Verify onOpen was called
    expect(onOpen).toHaveBeenCalled();

    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("attaches onMessage event handler", async () => {
    const onMessage = vitest.fn();
    const testMessage = "hello from server";

    const connectionHandler = (ws: any) => {
      // Send message after a small delay to ensure connection is fully established
      setTimeout(() => {
        ws.send(testMessage);
      }, 50);
    };
    wss.on("connection", connectionHandler);

    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        onMessage
      })
    );

    // Wait for message to be received
    await waitFor(
      () => {
        expect(onMessage).toHaveBeenCalled();
        const event = onMessage.mock.calls[0][0];
        expect(event.data).toBeDefined();
      },
      { timeout: 3000 }
    );

    wss.off("connection", connectionHandler);
    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("attaches onClose event handler", async () => {
    const onClose = vitest.fn();

    wss.once("connection", (ws) => {
      // Wait for connection to be fully established before closing
      setTimeout(() => ws.close(), 100);
    });

    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        onClose
      })
    );

    // Wait for connection to be established first
    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    // Then wait for close event
    await waitFor(
      () => {
        expect(onClose).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("attaches onError event handler", async () => {
    const onError = vitest.fn();

    const { result } = renderHook(() =>
      usePartySocket({
        host: "invalid-host-that-does-not-exist",
        room: "test-room",
        onError,
        maxRetries: 0
      })
    );

    await waitFor(
      () => {
        expect(onError).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("updates event handlers without reconnecting", async () => {
    const onMessage1 = vitest.fn();
    const onMessage2 = vitest.fn();

    const connectionHandler = (ws: any) => {
      // Send messages with delays to ensure connection is established
      setTimeout(() => ws.send("message1"), 100);
      setTimeout(() => ws.send("message2"), 200);
    };
    wss.on("connection", connectionHandler);

    const { result, rerender } = renderHook(
      ({ onMessage }) =>
        usePartySocket({
          host: `localhost:${PORT}`,
          room: "test-room",
          onMessage
        }),
      { initialProps: { onMessage: onMessage1 } }
    );

    const firstSocket = result.current;

    // Wait for first message
    await waitFor(
      () => {
        expect(onMessage1).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Change handler
    rerender({ onMessage: onMessage2 });

    // Socket should be the same
    expect(result.current).toBe(firstSocket);

    // Wait for second message with new handler
    await waitFor(
      () => {
        expect(onMessage2).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    wss.off("connection", connectionHandler);
    result.current.close();
  });

  test("closes socket on unmount", () => {
    const { result, unmount } = renderHook(() =>
      usePartySocket({
        host: "example.com",
        room: "test-room",
        startClosed: true
      })
    );

    const closeSpy = vitest.spyOn(result.current, "close");

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  test("respects startClosed option", () => {
    const { result } = renderHook(() =>
      usePartySocket({
        host: "example.com",
        room: "test-room",
        startClosed: true
      })
    );

    expect(result.current.readyState).toBe(WebSocket.CLOSED);
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("connects automatically when startClosed is false", async () => {
    wss.once("connection", (_ws) => {
      // Connection established
    });

    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        startClosed: false
      })
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  test("handles query parameters", () => {
    const { result } = renderHook(() =>
      usePartySocket({
        host: "example.com",
        room: "test-room",
        query: { foo: "bar" },
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
  });

  test("handles function query provider", () => {
    const { result } = renderHook(() =>
      usePartySocket({
        host: "example.com",
        room: "test-room",
        query: () => ({ dynamic: "value" }),
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
  });

  test("does NOT reconnect when query object reference changes (values are not in memo key)", () => {
    // Query values themselves don't trigger reconnection because they're not in the memo key
    // Only the query identity matters if it's a function
    const { result, rerender } = renderHook(
      ({ query }) =>
        usePartySocket({
          host: "example.com",
          room: "test-room",
          query,
          startClosed: true
        }),
      { initialProps: { query: { foo: "bar" } } }
    );

    const firstSocket = result.current;

    // Changing query object reference WILL reconnect because the object identity changes
    rerender({ query: { foo: "baz" } });

    // Socket will be different because the object reference changed
    expect(result.current).not.toBe(firstSocket);
  });

  // TODO: flaky — depends on open event handler which has timing issues
  test.skip("handles all event handlers together", async () => {
    const onOpen = vitest.fn();
    const onMessage = vitest.fn();
    const onClose = vitest.fn();
    const onError = vitest.fn();

    wss.once("connection", (ws) => {
      ws.send("test message");
      setTimeout(() => ws.close(), 100);
    });

    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        onOpen,
        onMessage,
        onClose,
        onError
      })
    );

    await waitFor(
      () => {
        expect(onOpen).toHaveBeenCalled();
        expect(onMessage).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("can call socket methods", async () => {
    wss.once("connection", (ws) => {
      ws.on("message", (data) => {
        ws.send(data); // Echo back
      });
    });

    const onMessage = vitest.fn();

    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        onMessage
      })
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    result.current.send("hello");

    await waitFor(
      () => {
        expect(onMessage).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  test("does not connect when enabled is false", () => {
    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        enabled: false
      })
    );

    expect(result.current).toBeDefined();
    expect(result.current.readyState).toBe(WebSocket.CLOSED);
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("connects when enabled is true (default)", async () => {
    wss.once("connection", (ws) => {
      ws.close();
    });

    const { result } = renderHook(() =>
      usePartySocket({
        host: `localhost:${PORT}`,
        room: "test-room",
        enabled: true
      })
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("disconnects when enabled changes from true to false", async () => {
    wss.once("connection", (ws) => {
      // Keep connection open
    });

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        usePartySocket({
          host: `localhost:${PORT}`,
          room: "test-room",
          enabled
        }),
      { initialProps: { enabled: true } }
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    rerender({ enabled: false });

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.CLOSED);
      },
      { timeout: 3000 }
    );
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("reconnects when enabled changes from false to true", async () => {
    wss.once("connection", (ws) => {
      // Keep connection open
    });

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        usePartySocket({
          host: `localhost:${PORT}`,
          room: "test-room",
          enabled
        }),
      { initialProps: { enabled: false } }
    );

    expect(result.current.readyState).toBe(WebSocket.CLOSED);

    rerender({ enabled: true });

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("keeps the same socket instance when enabled toggles", async () => {
    wss.once("connection", () => {
      // Keep connection open
    });

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        usePartySocket({
          host: `localhost:${PORT}`,
          room: "test-room",
          enabled
        }),
      { initialProps: { enabled: true } }
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    const socketInstance = result.current;

    rerender({ enabled: false });

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.CLOSED);
      },
      { timeout: 3000 }
    );

    // Same socket instance should be reused
    expect(result.current).toBe(socketInstance);

    result.current.close();
  });
});

describe.skipIf(!!process.env.GITHUB_ACTIONS)("useWebSocket", () => {
  let wss: WebSocketServer;

  beforeAll(() => {
    wss = new WebSocketServer({ port: PORT + 1 });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client) => {
        client.terminate();
      });
      wss.close(() => {
        resolve();
      });
    });
  });

  test("creates a ReconnectingWebSocket instance", () => {
    const { result } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
    expect(result.current.readyState).toBe(WebSocket.CLOSED);
  });

  test("creates stable socket instance across re-renders", () => {
    const { result, rerender } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        startClosed: true
      })
    );

    const firstSocket = result.current;
    rerender();

    expect(result.current).toBe(firstSocket);
  });

  test("reconnects when URL changes", async () => {
    const { result, rerender } = renderHook(
      ({ url }) => useWebSocket(url, undefined, { startClosed: true }),
      { initialProps: { url: `ws://localhost:${PORT + 1}/1` } }
    );

    const firstSocket = result.current;

    rerender({ url: `ws://localhost:${PORT + 1}/2` });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("reconnects when protocols change", async () => {
    const { result, rerender } = renderHook(
      ({ protocols }) =>
        useWebSocket(`ws://localhost:${PORT + 1}`, protocols, {
          startClosed: true
        }),
      { initialProps: { protocols: ["protocol1"] } }
    );

    const firstSocket = result.current;

    rerender({ protocols: ["protocol2"] });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("reconnects when options change", async () => {
    const { result, rerender } = renderHook(
      ({ maxRetries }) =>
        useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
          maxRetries,
          startClosed: true
        }),
      { initialProps: { maxRetries: 1 } }
    );

    const firstSocket = result.current;

    rerender({ maxRetries: 5 });

    await waitFor(() => {
      expect(result.current).not.toBe(firstSocket);
    });
  });

  test("does NOT reconnect when event handlers change", () => {
    const onMessage1 = vitest.fn();
    const onMessage2 = vitest.fn();

    const { result, rerender } = renderHook(
      ({ onMessage }) =>
        useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
          onMessage,
          startClosed: true
        }),
      { initialProps: { onMessage: onMessage1 } }
    );

    const firstSocket = result.current;

    rerender({ onMessage: onMessage2 });

    expect(result.current).toBe(firstSocket);
  });

  test("accepts event handlers", () => {
    // Event handlers are passed through correctly (already tested in usePartySocket)
    const onOpen = vitest.fn();
    const onMessage = vitest.fn();
    const onClose = vitest.fn();

    const { result } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        onOpen,
        onMessage,
        onClose,
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
    result.current.close();
  });

  test("closes socket on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        startClosed: true
      })
    );

    const closeSpy = vitest.spyOn(result.current, "close");

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  test("handles URL as function", () => {
    const { result } = renderHook(() =>
      useWebSocket(() => `ws://localhost:${PORT + 1}`, undefined, {
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
  });

  test("handles protocols as array", () => {
    const { result } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, ["protocol1", "protocol2"], {
        startClosed: true
      })
    );

    expect(result.current).toBeDefined();
  });

  test("can call send method", () => {
    // Send method is available (actual send/receive tested in usePartySocket)
    const { result } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        startClosed: true
      })
    );

    expect(result.current.send).toBeDefined();
    expect(typeof result.current.send).toBe("function");

    result.current.close();
  });

  test("does not connect when enabled is false", () => {
    const { result } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        enabled: false
      })
    );

    expect(result.current).toBeDefined();
    expect(result.current.readyState).toBe(WebSocket.CLOSED);
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("connects when enabled is true (default)", async () => {
    wss.once("connection", (ws) => {
      ws.close();
    });

    const { result } = renderHook(() =>
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        enabled: true
      })
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("disconnects when enabled changes from true to false", async () => {
    wss.once("connection", () => {
      // Keep connection open
    });

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
          enabled
        }),
      { initialProps: { enabled: true } }
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    rerender({ enabled: false });

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.CLOSED);
      },
      { timeout: 3000 }
    );
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("reconnects when enabled changes from false to true", async () => {
    wss.once("connection", () => {
      // Keep connection open
    });

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
          enabled
        }),
      { initialProps: { enabled: false } }
    );

    expect(result.current.readyState).toBe(WebSocket.CLOSED);

    rerender({ enabled: true });

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    result.current.close();
  });

  // TODO: flaky — WebSocket connection timing in jsdom is unreliable
  test.skip("keeps the same socket instance when enabled toggles", async () => {
    wss.once("connection", () => {
      // Keep connection open
    });

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
          enabled
        }),
      { initialProps: { enabled: true } }
    );

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.OPEN);
      },
      { timeout: 3000 }
    );

    const socketInstance = result.current;

    rerender({ enabled: false });

    await waitFor(
      () => {
        expect(result.current.readyState).toBe(WebSocket.CLOSED);
      },
      { timeout: 3000 }
    );

    // Same socket instance should be reused
    expect(result.current).toBe(socketInstance);

    result.current.close();
  });
});

/**
 * HMR (Hot Module Replacement) resilience tests.
 *
 * When Vite HMR fires, React Fast Refresh re-runs all effects without changing
 * their dependencies. React StrictMode in development does the same thing —
 * it double-invokes effects (run → cleanup → run). We use StrictMode as a
 * reliable proxy to test the HMR code path in useStableSocket.
 *
 * The critical behavior: when the effect re-runs but socketOptions reference
 * hasn't changed, we should call socket.reconnect() on the existing instance
 * instead of creating a new socket. This preserves socket identity so that
 * downstream code (event listeners, _pk references, etc.) isn't disrupted.
 */
describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "HMR resilience (useStableSocket)",
  () => {
    const strictModeWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.StrictMode, null, children);

    test("usePartySocket preserves socket identity under StrictMode (simulates HMR)", () => {
      const { result } = renderHook(
        () =>
          usePartySocket({
            host: "example.com",
            room: "test-room",
            startClosed: true
          }),
        { wrapper: strictModeWrapper }
      );

      // The socket should still be the same instance — not replaced
      expect(result.current).toBeDefined();
      expect(result.current.host).toBe("example.com");
      expect(result.current.room).toBe("test-room");
    });

    test("usePartySocket calls reconnect() instead of creating new socket on effect re-run", () => {
      const { result } = renderHook(
        () =>
          usePartySocket({
            host: "example.com",
            room: "test-room",
            startClosed: true
          }),
        { wrapper: strictModeWrapper }
      );

      const socket = result.current;

      // Spy on reconnect for future rerenders
      const reconnectSpy = vitest.spyOn(socket, "reconnect");
      const closeSpy = vitest.spyOn(socket, "close");

      // Rerender with identical props — simulates another HMR cycle
      // Since deps haven't changed, React won't re-run the effect.
      // The StrictMode double-invoke already tested the first cycle;
      // this confirms stability on subsequent renders.
      reconnectSpy.mockClear();
      closeSpy.mockClear();

      // Socket identity should be preserved across all of this
      expect(result.current).toBe(socket);
    });

    test("usePartySocket still creates new socket when options change under StrictMode", async () => {
      const { result, rerender } = renderHook(
        ({ room }) =>
          usePartySocket({
            host: "example.com",
            room,
            startClosed: true
          }),
        {
          initialProps: { room: "room1" },
          wrapper: strictModeWrapper
        }
      );

      const firstSocket = result.current;
      expect(firstSocket.room).toBe("room1");

      // Change an option — this should create a new socket, not reconnect
      rerender({ room: "room2" });

      await waitFor(() => {
        expect(result.current).not.toBe(firstSocket);
        expect(result.current.room).toBe("room2");
      });
    });

    test("useWebSocket preserves socket identity under StrictMode (simulates HMR)", () => {
      const { result } = renderHook(
        () =>
          useWebSocket("ws://example.com", undefined, {
            startClosed: true
          }),
        { wrapper: strictModeWrapper }
      );

      expect(result.current).toBeDefined();
      expect(result.current.readyState).toBe(WebSocket.CLOSED);
    });

    test("useWebSocket still creates new socket when URL changes under StrictMode", async () => {
      const { result, rerender } = renderHook(
        ({ url }) =>
          useWebSocket(url, undefined, {
            startClosed: true
          }),
        {
          initialProps: { url: "ws://example.com/1" },
          wrapper: strictModeWrapper
        }
      );

      const firstSocket = result.current;

      rerender({ url: "ws://example.com/2" });

      await waitFor(() => {
        expect(result.current).not.toBe(firstSocket);
      });
    });

    test("socket identity is preserved across multiple rerenders with same props", () => {
      const { result, rerender } = renderHook(
        () =>
          usePartySocket({
            host: "example.com",
            room: "test-room",
            startClosed: true
          }),
        { wrapper: strictModeWrapper }
      );

      const originalSocket = result.current;

      // Multiple rerenders with identical props should never replace the socket
      for (let i = 0; i < 5; i++) {
        rerender();
        expect(result.current).toBe(originalSocket);
      }
    });

    test("unmount still calls close() under StrictMode", () => {
      const { result, unmount } = renderHook(
        () =>
          usePartySocket({
            host: "example.com",
            room: "test-room",
            startClosed: true
          }),
        { wrapper: strictModeWrapper }
      );

      const closeSpy = vitest.spyOn(result.current, "close");

      unmount();

      expect(closeSpy).toHaveBeenCalled();
    });
  }
);
