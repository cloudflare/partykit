/**
 * Edge Cases and Corner Scenarios
 * Tests for rarely-hit code paths and boundary conditions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import PartySocket from "../index";
import ReconnectingWebSocket from "../ws";

const PORT = 50136;

describe("Edge Cases - UUID Generation", () => {
  it("should use crypto.randomUUID when available", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    // UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(ps.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    );
  });

  it("should generate valid UUID when crypto.randomUUID is not available", () => {
    // Save original
    const originalRandomUUID = global.crypto?.randomUUID;

    // Remove randomUUID temporarily
    if (global.crypto) {
      // @ts-expect-error - testing fallback
      delete global.crypto.randomUUID;
    }

    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    // Should still generate a valid UUID
    expect(ps.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
    );

    // Restore
    if (global.crypto && originalRandomUUID) {
      global.crypto.randomUUID = originalRandomUUID;
    }
  });

  it("should generate different UUIDs for different sockets", () => {
    const ps1 = new PartySocket({
      host: `localhost:${PORT}`,
      room: "room1",
      startClosed: true
    });

    const ps2 = new PartySocket({
      host: `localhost:${PORT}`,
      room: "room2",
      startClosed: true
    });

    expect(ps1.id).not.toBe(ps2.id);
  });

  it("should use provided id when specified", () => {
    const customId = "my-custom-client-id";
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      id: customId,
      startClosed: true
    });

    expect(ps.id).toBe(customId);
  });
});

describe("Edge Cases - BinaryType", () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: PORT });
  });

  afterEach(() => {
    wss.close();
  });

  it("should default binaryType to 'blob'", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    expect(ps.binaryType).toBe("blob");
  });

  it("should set binaryType before connection", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    ps.binaryType = "arraybuffer";
    expect(ps.binaryType).toBe("arraybuffer");
  });

  it("should apply binaryType to WebSocket after connection", async () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    ps.binaryType = "arraybuffer";

    const openPromise = new Promise<void>((resolve) => {
      ps.addEventListener("open", () => resolve());
    });

    ps.reconnect();
    await openPromise;

    expect(ps.binaryType).toBe("arraybuffer");
    ps.close();
  });

  it("should preserve binaryType across reconnections", async () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    ps.binaryType = "arraybuffer";

    const openPromise = new Promise<void>((resolve) => {
      ps.addEventListener("open", () => resolve());
    });

    ps.reconnect();
    await openPromise;

    expect(ps.binaryType).toBe("arraybuffer");

    // Trigger reconnection
    const secondOpenPromise = new Promise<void>((resolve) => {
      ps.addEventListener(
        "open",
        () => {
          resolve();
        },
        { once: true }
      );
    });

    ps.reconnect();
    await secondOpenPromise;

    expect(ps.binaryType).toBe("arraybuffer");
    ps.close();
  });
});

describe("Edge Cases - IP Address Detection", () => {
  it("should detect localhost with 127.0.0.1", () => {
    const ps = new PartySocket({
      host: "127.0.0.1:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should detect localhost with localhost", () => {
    const ps = new PartySocket({
      host: "localhost:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should detect private IP 192.168.x.x", () => {
    const ps = new PartySocket({
      host: "192.168.1.100:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should detect private IP 10.x.x.x", () => {
    const ps = new PartySocket({
      host: "10.0.0.1:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should detect private IP 172.16.x.x (lower bound)", () => {
    const ps = new PartySocket({
      host: "172.16.0.1:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should detect private IP 172.31.x.x (upper bound)", () => {
    const ps = new PartySocket({
      host: "172.31.255.255:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should detect private IP 172.20.x.x (middle of range)", () => {
    const ps = new PartySocket({
      host: "172.20.10.5:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should NOT detect 172.15.x.x as private (below range)", () => {
    const ps = new PartySocket({
      host: "172.15.0.1:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("wss://");
  });

  it("should NOT detect 172.32.x.x as private (above range)", () => {
    const ps = new PartySocket({
      host: "172.32.0.1:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("wss://");
  });

  it("should detect IPv6 localhost [::ffff:7f00:1]", () => {
    const ps = new PartySocket({
      host: "[::ffff:7f00:1]:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("ws://");
  });

  it("should use wss for public domain", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("wss://");
  });

  it("should use wss for public IP", () => {
    const ps = new PartySocket({
      host: "8.8.8.8:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.roomUrl).toContain("wss://");
  });
});

describe("Edge Cases - Message Queue", () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: PORT });
  });

  afterEach(() => {
    wss.close();
  });

  it("should queue messages up to maxEnqueuedMessages", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      maxEnqueuedMessages: 3,
      startClosed: true
    });

    ps.send("message1");
    ps.send("message2");
    ps.send("message3");

    expect(ps.bufferedAmount).toBeGreaterThan(0);
  });

  it("should not queue messages beyond maxEnqueuedMessages", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      maxEnqueuedMessages: 2,
      startClosed: true
    });

    ps.send("message1");
    ps.send("message2");
    const bufferedBefore = ps.bufferedAmount;

    ps.send("message3"); // This should be dropped

    expect(ps.bufferedAmount).toBe(bufferedBefore);
  });

  it("should handle exactly maxEnqueuedMessages", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      maxEnqueuedMessages: 5,
      startClosed: true
    });

    // Send exactly 5 messages
    for (let i = 0; i < 5; i++) {
      ps.send(`message${i}`);
    }

    expect(ps.bufferedAmount).toBeGreaterThan(0);

    // 6th message should be dropped
    const bufferedBefore = ps.bufferedAmount;
    ps.send("message6");
    expect(ps.bufferedAmount).toBe(bufferedBefore);
  });

  it("should calculate bufferedAmount for string messages", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    ps.send("hello");
    expect(ps.bufferedAmount).toBe(5); // "hello".length
  });

  it("should calculate bufferedAmount for Blob messages", async () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    const blob = new Blob(["test data"]);
    ps.send(blob);

    expect(ps.bufferedAmount).toBe(9); // blob.size
  });

  it("should calculate bufferedAmount for ArrayBuffer messages", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    const buffer = new ArrayBuffer(8);
    ps.send(buffer);

    expect(ps.bufferedAmount).toBe(8); // buffer.byteLength
  });

  it("should calculate bufferedAmount for ArrayBufferView messages", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    const view = new Uint8Array([1, 2, 3, 4, 5]);
    ps.send(view);

    expect(ps.bufferedAmount).toBe(5); // view.byteLength
  });

  it("should flush message queue on connection", async () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    const messages: string[] = [];
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        messages.push(data.toString());
      });
    });

    // Queue messages
    ps.send("queued1");
    ps.send("queued2");
    expect(ps.bufferedAmount).toBeGreaterThan(0);

    const openPromise = new Promise<void>((resolve) => {
      ps.addEventListener("open", () => resolve());
    });

    ps.reconnect();
    await openPromise;

    // Wait for messages to be sent
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages).toContain("queued1");
    expect(messages).toContain("queued2");

    ps.close();
  });
});

describe("Edge Cases - ReadyState Constants", () => {
  it("should expose static readyState constants", () => {
    expect(ReconnectingWebSocket.CONNECTING).toBe(0);
    expect(ReconnectingWebSocket.OPEN).toBe(1);
    expect(ReconnectingWebSocket.CLOSING).toBe(2);
    expect(ReconnectingWebSocket.CLOSED).toBe(3);
  });

  it("should expose instance readyState constants", () => {
    const ps = new PartySocket({
      host: "localhost:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.CONNECTING).toBe(0);
    expect(ps.OPEN).toBe(1);
    expect(ps.CLOSING).toBe(2);
    expect(ps.CLOSED).toBe(3);
  });

  it("should report CLOSED state when startClosed is true", () => {
    const ps = new PartySocket({
      host: "localhost:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.readyState).toBe(ReconnectingWebSocket.CLOSED);
  });

  it("should report CONNECTING state by default", () => {
    const ps = new PartySocket({
      host: "localhost:1999",
      room: "test-room"
    });

    expect(ps.readyState).toBe(ReconnectingWebSocket.CONNECTING);
    ps.close();
  });
});

describe("Edge Cases - Close Behavior", () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: PORT });
  });

  afterEach(() => {
    wss.close();
  });

  it("should handle close() when not connected", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    expect(() => ps.close()).not.toThrow();
  });

  it("should handle multiple close() calls", async () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    const openPromise = new Promise<void>((resolve) => {
      ps.addEventListener("open", () => resolve());
    });

    ps.reconnect();
    await openPromise;

    ps.close();
    expect(() => ps.close()).not.toThrow();
  });

  it("should set shouldReconnect to false when close() is called", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    expect(ps.shouldReconnect).toBe(false);

    ps.reconnect();
    expect(ps.shouldReconnect).toBe(true);

    ps.close();
    expect(ps.shouldReconnect).toBe(false);
  });
});

describe("Edge Cases - RetryCount", () => {
  it("should start with retryCount 0", () => {
    const ps = new PartySocket({
      host: "localhost:1999",
      room: "test-room",
      startClosed: true
    });

    expect(ps.retryCount).toBe(0);
  });

  it("should reset retryCount when reconnect() is called", async () => {
    const wss = new WebSocketServer({ port: PORT });

    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    const openPromise = new Promise<void>((resolve) => {
      ps.addEventListener("open", () => resolve());
    });

    ps.reconnect();
    await openPromise;

    // Force a reconnection by calling reconnect
    ps.reconnect();

    // retryCount should be reset to 0
    expect(ps.retryCount).toBe(0);

    ps.close();
    wss.close();
  });
});

describe("Edge Cases - Extensions and Protocol", () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: PORT });
  });

  afterEach(() => {
    wss.close();
  });

  it("should return empty string for extensions when not connected", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    expect(ps.extensions).toBe("");
  });

  it("should return empty string for protocol when not connected", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    expect(ps.protocol).toBe("");
  });

  it("should return empty string for url when not connected", () => {
    const ps = new PartySocket({
      host: `localhost:${PORT}`,
      room: "test-room",
      startClosed: true
    });

    expect(ps.url).toBe("");
  });
});
