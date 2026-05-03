/**
 * @vitest-environment node
 */

import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

test("does not generate random values while importing the websocket module", async () => {
  vi.resetModules();
  const random = vi.spyOn(Math, "random");

  await import("../ws");

  expect(random).not.toHaveBeenCalled();
});
