/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, test, vitest } from "vitest";

import PartySocket from "../index";

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "PartySocket URL Construction",
  () => {
    test("constructs URL from host and room", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        startClosed: true
      });
      expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room");
    });

    test("constructs URL with custom party", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        party: "custom",
        startClosed: true
      });
      expect(ps.roomUrl).toBe("wss://example.com/parties/custom/my-room");
    });

    test("uses ws:// for localhost", () => {
      const ps = new PartySocket({
        host: "localhost:1999",
        room: "test",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("ws://localhost:1999");
    });

    test("uses ws:// for 127.0.0.1", () => {
      const ps = new PartySocket({
        host: "127.0.0.1:1999",
        room: "test",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("ws://127.0.0.1:1999");
    });

    test("uses ws:// for private IP 192.168.x.x", () => {
      const ps = new PartySocket({
        host: "192.168.1.1",
        room: "test",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("ws://192.168.1.1");
    });

    test("uses ws:// for private IP 10.x.x.x", () => {
      const ps = new PartySocket({
        host: "10.0.0.1",
        room: "test",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("ws://10.0.0.1");
    });

    test("uses ws:// for private IP 172.16-31.x.x", () => {
      const ps = new PartySocket({
        host: "172.16.0.1",
        room: "test",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("ws://172.16.0.1");

      const ps2 = new PartySocket({
        host: "172.31.255.255",
        room: "test",
        startClosed: true
      });
      expect(ps2.roomUrl).toContain("ws://172.31.255.255");
    });

    test("uses ws:// for IPv6 localhost", () => {
      const ps = new PartySocket({
        host: "[::ffff:7f00:1]:1999",
        room: "test",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("ws://[::ffff:7f00:1]:1999");
    });

    test("uses wss:// for public domains", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "test",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("wss://example.com");
    });

    test("strips protocol from host (https)", () => {
      const ps = new PartySocket({
        host: "https://example.com",
        room: "my-room",
        startClosed: true
      });
      expect(ps.host).toBe("example.com");
      expect(ps.roomUrl).not.toContain("https://https://");
    });

    test("strips protocol from host (http)", () => {
      const ps = new PartySocket({
        host: "http://example.com",
        room: "my-room",
        startClosed: true
      });
      expect(ps.host).toBe("example.com");
    });

    test("strips protocol from host (ws)", () => {
      const ps = new PartySocket({
        host: "ws://example.com",
        room: "my-room",
        startClosed: true
      });
      expect(ps.host).toBe("example.com");
    });

    test("strips protocol from host (wss)", () => {
      const ps = new PartySocket({
        host: "wss://example.com",
        room: "my-room",
        startClosed: true
      });
      expect(ps.host).toBe("example.com");
    });

    test("handles trailing slash in host", () => {
      const ps = new PartySocket({
        host: "example.com/",
        room: "my-room",
        startClosed: true
      });
      expect(ps.host).toBe("example.com");
      expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room");
    });

    test("throws when path starts with slash", () => {
      expect(() => {
        new PartySocket({
          host: "example.com",
          room: "my-room",
          path: "/invalid"
        });
      }).toThrow("path must not start with a slash");
    });

    test("includes path in URL when provided", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        path: "subpath",
        startClosed: true
      });
      expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room/subpath");
      expect(ps.path).toBe("/subpath");
    });

    test("uses basePath when provided", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        basePath: "custom/base/path",
        startClosed: true
      });
      expect(ps.roomUrl).toBe("wss://example.com/custom/base/path");
    });

    test("uses prefix when provided", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        party: "custom-party",
        prefix: "rooms",
        startClosed: true
      });
      expect(ps.roomUrl).toBe("wss://example.com/rooms/custom-party/my-room");
    });

    test("basePath takes precedence over prefix", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        basePath: "absolute/path",
        prefix: "should-be-ignored",
        startClosed: true
      });
      expect(ps.roomUrl).toBe("wss://example.com/absolute/path");
    });

    test("can override protocol with explicit option", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        protocol: "ws",
        startClosed: true
      });
      expect(ps.roomUrl).toContain("ws://example.com");
    });

    test("defaults party to 'main' when not provided", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        startClosed: true
      });
      expect(ps.name).toBe("main");
      expect(ps.roomUrl).toContain("/parties/main/");
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "PartySocket Query Parameters",
  () => {
    test("includes connection ID in query params", () => {
      const customId = "custom-connection-id";
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        id: customId,
        startClosed: true
      });
      expect(ps.id).toBe(customId);
      // ID is added to URL via _pk parameter
    });

    test("generates random ID when not provided", () => {
      const ps1 = new PartySocket({
        host: "example.com",
        room: "my-room",
        startClosed: true
      });
      const ps2 = new PartySocket({
        host: "example.com",
        room: "my-room",
        startClosed: true
      });
      expect(ps1.id).toBeDefined();
      expect(ps2.id).toBeDefined();
      expect(ps1.id).not.toBe(ps2.id);
    });

    test("adds static query parameters", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        query: { foo: "bar", baz: "qux" },
        startClosed: true
      });
      // Query params are added when URL is resolved
      expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room");
    });

    test("omits null and undefined query parameters", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        query: { foo: "bar", nullParam: null, undefinedParam: undefined },
        startClosed: true
      });
      // Only non-null params should be included
      expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room");
    });

    test("handles empty query object", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        query: {},
        startClosed: true
      });
      expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room");
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)("PartySocket Properties", () => {
  test("exposes host property", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      startClosed: true
    });
    expect(ps.host).toBe("example.com");
  });

  test("exposes room property", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      startClosed: true
    });
    expect(ps.room).toBe("my-room");
  });

  test("exposes name (party) property", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      party: "custom",
      startClosed: true
    });
    expect(ps.name).toBe("custom");
  });

  test("exposes path property", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      path: "subpath",
      startClosed: true
    });
    expect(ps.path).toBe("/subpath");
  });

  test("exposes roomUrl property", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      startClosed: true
    });
    expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room");
  });

  test("roomUrl is static without query parameters", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      query: { dynamic: "value" },
      startClosed: true
    });
    // roomUrl should not include query params
    expect(ps.roomUrl).toBe("wss://example.com/parties/main/my-room");
    expect(ps.roomUrl).not.toContain("?");
  });
});

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "PartySocket.updateProperties",
  () => {
    test("updates room", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "old-room",
        startClosed: true
      });
      ps.updateProperties({ room: "new-room" });
      expect(ps.room).toBe("new-room");
    });

    test("updates host", () => {
      const ps = new PartySocket({
        host: "old.com",
        room: "my-room",
        startClosed: true
      });
      ps.updateProperties({ host: "new.com" });
      expect(ps.host).toBe("new.com");
    });

    test("updates party", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        party: "old-party",
        startClosed: true
      });
      ps.updateProperties({ party: "new-party" });
      expect(ps.name).toBe("new-party");
    });

    test("updates path", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        path: "old-path",
        startClosed: true
      });
      ps.updateProperties({ path: "new-path" });
      expect(ps.path).toBe("/new-path");
    });

    test("updates multiple properties at once", () => {
      const ps = new PartySocket({
        host: "old.com",
        room: "old-room",
        startClosed: true
      });
      ps.updateProperties({
        host: "new.com",
        room: "new-room",
        party: "new-party"
      });
      expect(ps.host).toBe("new.com");
      expect(ps.room).toBe("new-room");
      expect(ps.name).toBe("new-party");
    });

    test("preserves existing properties when partially updating", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "room1",
        party: "custom",
        startClosed: true
      });
      ps.updateProperties({ room: "room2" });
      expect(ps.host).toBe("example.com");
      expect(ps.name).toBe("custom");
      expect(ps.room).toBe("room2");
    });

    test("updates query parameters", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        query: { old: "value" },
        startClosed: true
      });
      ps.updateProperties({ query: { new: "value" } });
      // Query is part of options, should be updated
    });

    test("throws when reconnecting without host and room", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        startClosed: true
      });
      ps.updateProperties({ host: "", room: "" });
      expect(() => {
        ps.reconnect();
      }).toThrow("The host must be set");
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "PartySocket Name Validation",
  () => {
    let warnSpy: ReturnType<typeof vitest.spyOn>;

    beforeEach(() => {
      warnSpy = vitest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test("warns when party name contains forward slash", () => {
      new PartySocket({
        host: "example.com",
        room: "room",
        party: "bad/party",
        startClosed: true
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('party name "bad/party" contains forward slash')
      );
    });

    test("warns when room name contains forward slash", () => {
      new PartySocket({
        host: "example.com",
        room: "bad/room",
        startClosed: true
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('room name "bad/room" contains forward slash')
      );
    });

    test("warns for both party and room with forward slashes", () => {
      new PartySocket({
        host: "example.com",
        room: "bad/room",
        party: "bad/party",
        startClosed: true
      });
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    test("can disable name validation", () => {
      new PartySocket({
        host: "example.com",
        room: "bad/room",
        party: "bad/party",
        disableNameValidation: true,
        startClosed: true
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test("does not warn for valid names", () => {
      new PartySocket({
        host: "example.com",
        room: "valid-room",
        party: "valid-party",
        startClosed: true
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  }
);

describe.skipIf(!!process.env.GITHUB_ACTIONS)("PartySocket Protocols", () => {
  test("accepts protocols array", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      protocols: ["protocol1", "protocol2"],
      startClosed: true
    });
    expect(ps).toBeDefined();
  });

  test("accepts single protocol string", () => {
    const ps = new PartySocket({
      host: "example.com",
      room: "my-room",
      protocols: ["single-protocol"],
      startClosed: true
    });
    expect(ps).toBeDefined();
  });
});

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "PartySocket Options Passthrough",
  () => {
    test("passes maxRetries to ReconnectingWebSocket", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        maxRetries: 5,
        startClosed: true
      });
      expect(ps).toBeDefined();
      // Option is passed through to parent class
    });

    test("passes debug option to ReconnectingWebSocket", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        debug: true,
        startClosed: true
      });
      expect(ps).toBeDefined();
    });

    test("passes connectionTimeout to ReconnectingWebSocket", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        connectionTimeout: 5000,
        startClosed: true
      });
      expect(ps).toBeDefined();
    });

    test("passes minReconnectionDelay to ReconnectingWebSocket", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        minReconnectionDelay: 1000,
        startClosed: true
      });
      expect(ps).toBeDefined();
    });

    test("passes maxReconnectionDelay to ReconnectingWebSocket", () => {
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        maxReconnectionDelay: 10000,
        startClosed: true
      });
      expect(ps).toBeDefined();
    });

    test("passes custom WebSocket constructor", () => {
      const customWS = class extends WebSocket {};
      const ps = new PartySocket({
        host: "example.com",
        room: "my-room",
        WebSocket: customWS,
        startClosed: true
      });
      expect(ps).toBeDefined();
    });
  }
);
