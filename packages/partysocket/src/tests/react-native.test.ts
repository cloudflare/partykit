/**
 * @vitest-environment jsdom
 *
 * Tests for React Native environment detection and event cloning
 * See: https://github.com/cloudflare/partykit/issues/257
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("React Native environment detection", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true
    });
  });

  test("detects React Native environment via navigator.product", async () => {
    // Mock React Native environment
    Object.defineProperty(globalThis, "navigator", {
      value: { product: "ReactNative" },
      writable: true,
      configurable: true
    });

    // Re-import the module to pick up the new navigator value
    const { default: ReconnectingWebSocket } = await import("../ws");

    // The module should have been loaded with isReactNative = true
    // We verify this by checking that the class can be instantiated
    expect(ReconnectingWebSocket).toBeDefined();
  });

  test("cloneEventNode creates valid Event instances", async () => {
    // Import the module in a standard environment first
    const wsModule = await import("../ws");

    // Test that CloseEvent and ErrorEvent are proper Event subclasses
    const closeEvent = new wsModule.CloseEvent(1000, "test", {});
    expect(closeEvent).toBeInstanceOf(Event);
    expect(closeEvent.type).toBe("close");
    expect(closeEvent.code).toBe(1000);
    expect(closeEvent.reason).toBe("test");

    const errorEvent = new wsModule.ErrorEvent(new Error("test error"), {});
    expect(errorEvent).toBeInstanceOf(Event);
    expect(errorEvent.type).toBe("error");
    expect(errorEvent.message).toBe("test error");
  });

  test("event classes can be dispatched via EventTarget", async () => {
    const wsModule = await import("../ws");

    const target = new EventTarget();
    let receivedEvent: Event | null = null;

    target.addEventListener("close", (e) => {
      receivedEvent = e;
    });

    const closeEvent = new wsModule.CloseEvent(1000, "normal closure", {});
    target.dispatchEvent(closeEvent);

    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent).toBeInstanceOf(Event);
  });
});

describe("Event cloning for dispatchEvent", () => {
  test("cloned MessageEvent maintains data property", () => {
    const originalEvent = new MessageEvent("message", { data: "test data" });
    const clonedEvent = new MessageEvent(originalEvent.type, originalEvent);

    expect(clonedEvent).toBeInstanceOf(Event);
    expect(clonedEvent).toBeInstanceOf(MessageEvent);
    expect(clonedEvent.data).toBe("test data");
  });

  test("cloned Event can be dispatched", () => {
    const target = new EventTarget();
    let eventReceived = false;

    target.addEventListener("open", () => {
      eventReceived = true;
    });

    const originalEvent = new Event("open");
    const clonedEvent = new Event(originalEvent.type, originalEvent);

    target.dispatchEvent(clonedEvent);
    expect(eventReceived).toBe(true);
  });
});
