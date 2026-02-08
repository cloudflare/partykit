/**
 * @vitest-environment jsdom
 */

import { describe, expect, test, vitest } from "vitest";

import PartySocket from "../index";

describe.skipIf(!!process.env.GITHUB_ACTIONS)("PartySocket.fetch", () => {
  test("constructs HTTP URL correctly", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      fetch: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("https://example.com/parties/main/my-room");
  });

  test("uses http:// for localhost", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "localhost:1999",
      room: "test",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("http://localhost:1999");
  });

  test("uses http:// for 127.0.0.1", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "127.0.0.1:1999",
      room: "test",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("http://127.0.0.1:1999");
  });

  test("uses http:// for private IP ranges", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "192.168.1.1",
      room: "test",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("http://192.168.1.1");
  });

  test("includes custom party in URL", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      party: "custom-party",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/parties/custom-party/my-room");
  });

  test("includes path in URL", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      path: "subpath",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/parties/main/my-room/subpath");
  });

  test("uses basePath when provided", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      basePath: "custom/base",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/custom/base");
  });

  test("uses prefix when provided", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      party: "custom",
      prefix: "rooms",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/rooms/custom/my-room");
  });

  test("includes query parameters", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      query: { foo: "bar", baz: "qux" },
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("foo=bar");
    expect(calledUrl).toContain("baz=qux");
  });

  test("omits null and undefined query parameters", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      query: { foo: "bar", nullParam: null, undefinedParam: undefined },
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("foo=bar");
    expect(calledUrl).not.toContain("nullParam");
    expect(calledUrl).not.toContain("undefinedParam");
  });

  test("handles async query provider", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      query: async () => ({ token: "abc123" }),
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("token=abc123");
  });

  test("handles sync query provider", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      query: () => ({ dynamic: "value" }),
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("dynamic=value");
  });

  test("can override protocol with explicit option", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      protocol: "http",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("http://example.com");
  });

  test("passes RequestInit to fetch", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ data: "test" })
    };

    await PartySocket.fetch(
      {
        host: "example.com",
        room: "my-room",
        fetch: mockFetch
      },
      init
    );

    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), init);
  });

  test("uses global fetch when not provided", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));
    global.fetch = mockFetch;

    await PartySocket.fetch({
      host: "example.com",
      room: "my-room"
    });

    expect(mockFetch).toHaveBeenCalled();

    global.fetch = originalFetch;
  });

  test("strips protocol from host", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "https://example.com",
      room: "my-room",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain("https://https://");
    expect(calledUrl).toContain("https://example.com");
  });

  test("handles trailing slash in host", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await PartySocket.fetch({
      host: "example.com/",
      room: "my-room",
      fetch: mockFetch
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe("https://example.com/parties/main/my-room?");
  });

  test("throws when path starts with slash", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    await expect(
      PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        path: "/invalid",
        fetch: mockFetch
      })
    ).rejects.toThrow("path must not start with a slash");
  });

  test("returns Response from fetch", async () => {
    const mockResponse = new Response("test data", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
    const mockFetch = vitest.fn().mockResolvedValue(mockResponse);

    const response = await PartySocket.fetch({
      host: "example.com",
      room: "my-room",
      fetch: mockFetch
    });

    expect(response).toBe(mockResponse);
    expect(await response.text()).toBe("test data");
  });

  test("propagates fetch errors", async () => {
    const mockFetch = vitest.fn().mockRejectedValue(new Error("Network error"));

    await expect(
      PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        fetch: mockFetch
      })
    ).rejects.toThrow("Network error");
  });

  test("works with different HTTP methods", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];

    for (const method of methods) {
      await PartySocket.fetch(
        {
          host: "example.com",
          room: "my-room",
          fetch: mockFetch
        },
        { method }
      );
    }

    expect(mockFetch).toHaveBeenCalledTimes(methods.length);
  });

  test("constructs same base URL as PartySocket with same options", async () => {
    const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

    const options = {
      host: "example.com",
      room: "test-room",
      party: "test-party",
      path: "test-path"
    };

    await PartySocket.fetch({
      ...options,
      fetch: mockFetch
    });

    const fetchUrl = mockFetch.mock.calls[0][0];

    const ps = new PartySocket({ ...options, startClosed: true });
    const socketUrl = ps.roomUrl;

    // Both should use the same path structure (http vs ws protocols are expected to differ)
    // Remove query string from fetch URL for comparison
    const fetchPath = fetchUrl.split("://")[1].split("?")[0];
    const socketPath = socketUrl.split("://")[1];
    expect(fetchPath).toBe(socketPath);
  });
});

describe.skipIf(!!process.env.GITHUB_ACTIONS)(
  "PartySocket.fetch edge cases",
  () => {
    test("handles empty query object", async () => {
      const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

      await PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        query: {},
        fetch: mockFetch
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      // Should still end with ? but no params
      expect(calledUrl).toMatch(/\?$/);
    });

    test("handles query provider returning empty object", async () => {
      const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

      await PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        query: () => ({}),
        fetch: mockFetch
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    test("works without optional parameters", async () => {
      const mockFetch = vitest.fn().mockResolvedValue(new Response("ok"));

      await PartySocket.fetch({
        host: "example.com",
        room: "my-room",
        fetch: mockFetch
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe("https://example.com/parties/main/my-room?");
    });
  }
);
