/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type WebSocket as NodeWebSocket, WebSocketServer } from "ws";
import { usePartySocket, useWebSocket } from "../react";

const PORT = 50135;

// Mock window object for SSR tests
const originalWindow = global.window;
const originalDocument = global.document;

describe.skip("SSR/Node.js Environment - usePartySocket", () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: PORT });
    // Clean up globals
    // @ts-expect-error - we're testing undefined window
    delete global.window;
    // @ts-expect-error - we're testing undefined document
    delete global.document;
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client: NodeWebSocket) => {
        client.terminate();
      });
      wss.close(() => {
        global.window = originalWindow;
        global.document = originalDocument;
        resolve();
      });
    });
  });

  it("should use default host when window is not available", () => {
    expect(global.window).toBeUndefined();

    function TestComponent() {
      const socket = usePartySocket({
        room: "test-room",
        startClosed: true
      });

      return <div>Host: {socket.host}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("dummy-domain.com");
  });

  it("should not attempt to connect during SSR when startClosed is true", () => {
    const onOpen = vi.fn();
    const onError = vi.fn();

    function TestComponent() {
      usePartySocket({
        room: "test-room",
        startClosed: true,
        onOpen,
        onError
      });

      return <div>Rendered</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("Rendered");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("should handle explicit host in SSR environment", () => {
    function TestComponent() {
      const socket = usePartySocket({
        host: "custom-host.com",
        room: "test-room",
        startClosed: true
      });

      return <div>Host: {socket.host}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("custom-host.com");
  });

  it("should create socket with correct protocol in SSR", () => {
    function TestComponent() {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        protocol: "wss",
        startClosed: true
      });

      return <div>URL: {socket.roomUrl}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("wss://example.com");
  });

  it("should handle party option in SSR", () => {
    function TestComponent() {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        party: "custom-party",
        startClosed: true
      });

      return <div>Party: {socket.name}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("custom-party");
  });

  it("should generate UUID for client id in SSR", () => {
    function TestComponent() {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        startClosed: true
      });

      return <div>ID: {socket.id}</div>;
    }

    const html = renderToString(<TestComponent />);
    // Should have generated a UUID (36 characters with hyphens)
    // React adds <!-- --> comments in SSR output
    expect(html).toMatch(
      /ID:.*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/
    );
  });

  it("should preserve custom id in SSR", () => {
    function TestComponent() {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        id: "custom-client-id",
        startClosed: true
      });

      return <div>ID: {socket.id}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("custom-client-id");
  });

  it("should handle query params in SSR", () => {
    function TestComponent() {
      const _socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        query: { token: "abc123" },
        startClosed: true
      });

      return <div>Created</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("Created");
  });

  it("should handle async query params in SSR", () => {
    function TestComponent() {
      const _socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        query: async () => ({ token: "abc123" }),
        startClosed: true
      });

      return <div>Created</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("Created");
  });

  it("should not throw when WebSocket constructor is missing", () => {
    // Save WebSocket
    const originalWebSocket = global.WebSocket;
    // @ts-expect-error - testing missing WebSocket
    delete global.WebSocket;

    function TestComponent() {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        startClosed: true
      });

      return <div>Rendered: {socket.readyState}</div>;
    }

    expect(() => {
      const html = renderToString(<TestComponent />);
      expect(html).toContain("Rendered");
    }).not.toThrow();

    // Restore
    global.WebSocket = originalWebSocket;
  });
});

describe.skip("SSR/Node.js Environment - useWebSocket", () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: PORT + 1 });
    // @ts-expect-error - we're testing undefined window
    delete global.window;
    // @ts-expect-error - we're testing undefined document
    delete global.document;
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      wss.clients.forEach((client: NodeWebSocket) => {
        client.terminate();
      });
      wss.close(() => {
        global.window = originalWindow;
        global.document = originalDocument;
        resolve();
      });
    });
  });

  it("should render with string URL in SSR", () => {
    function TestComponent() {
      const socket = useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        startClosed: true
      });

      return <div>State: {socket.readyState}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("State:");
  });

  it("should render with function URL in SSR", () => {
    function TestComponent() {
      const socket = useWebSocket(
        () => `ws://localhost:${PORT + 1}`,
        undefined,
        {
          startClosed: true
        }
      );

      return <div>State: {socket.readyState}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("State:");
  });

  it("should render with async URL in SSR", () => {
    function TestComponent() {
      const socket = useWebSocket(
        async () => `ws://localhost:${PORT + 1}`,
        undefined,
        {
          startClosed: true
        }
      );

      return <div>State: {socket.readyState}</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("State:");
  });

  it("should handle protocols array in SSR", () => {
    function TestComponent() {
      const _socket = useWebSocket(
        `ws://localhost:${PORT + 1}`,
        ["protocol1", "protocol2"],
        {
          startClosed: true
        }
      );

      return <div>Rendered</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("Rendered");
  });

  it("should handle protocol function in SSR", () => {
    function TestComponent() {
      const _socket = useWebSocket(
        `ws://localhost:${PORT + 1}`,
        () => "protocol1",
        {
          startClosed: true
        }
      );

      return <div>Rendered</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("Rendered");
  });

  it("should handle async protocol in SSR", () => {
    function TestComponent() {
      const _socket = useWebSocket(
        `ws://localhost:${PORT + 1}`,
        async () => "protocol1",
        {
          startClosed: true
        }
      );

      return <div>Rendered</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("Rendered");
  });

  it("should not connect during SSR rendering", () => {
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();

    function TestComponent() {
      useWebSocket(`ws://localhost:${PORT + 1}`, undefined, {
        startClosed: true,
        onOpen,
        onMessage,
        onError
      });

      return <div>Rendered</div>;
    }

    const html = renderToString(<TestComponent />);
    expect(html).toContain("Rendered");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe.skip("SSR/Node.js Environment - Hydration Safety", () => {
  beforeEach(() => {
    // @ts-expect-error - we're testing undefined window
    delete global.window;
    // @ts-expect-error - we're testing undefined document
    delete global.document;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  it("should create consistent socket IDs across renders", () => {
    function TestComponent() {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        id: "stable-id",
        startClosed: true
      });

      return <div>ID: {socket.id}</div>;
    }

    const html1 = renderToString(<TestComponent />);
    const html2 = renderToString(<TestComponent />);

    expect(html1).toBe(html2);
  });

  it("should create consistent URLs across renders", () => {
    function TestComponent() {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        id: "stable-id",
        query: { token: "abc" },
        startClosed: true
      });

      return <div>URL: {socket.roomUrl}</div>;
    }

    const html1 = renderToString(<TestComponent />);
    const html2 = renderToString(<TestComponent />);

    expect(html1).toBe(html2);
  });

  it("should handle changing query params in SSR", () => {
    function TestComponent({ token }: { token: string }) {
      const socket = usePartySocket({
        host: "example.com",
        room: "test-room",
        id: "stable-id",
        query: { token },
        startClosed: true
      });

      return <div>URL: {socket.roomUrl}</div>;
    }

    const html1 = renderToString(<TestComponent token="abc" />);
    const html2 = renderToString(<TestComponent token="xyz" />);

    // Base URL should be the same
    expect(html1).toContain("wss://example.com/parties/main/test-room");
    expect(html2).toContain("wss://example.com/parties/main/test-room");
  });
});
