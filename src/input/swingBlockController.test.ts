import { afterEach, describe, expect, it, vi } from "vitest";
import { isSwingSupported, swingSupportMessage } from "./swingBlockController";

describe("swingBlockController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports support based on DeviceMotionEvent", () => {
    vi.stubGlobal("window", { isSecureContext: true, DeviceMotionEvent: class {} });
    expect(isSwingSupported()).toBe(true);
  });

  it("returns a support message string", () => {
    vi.stubGlobal("window", { isSecureContext: true, DeviceMotionEvent: class {} });
    expect(swingSupportMessage()).toContain("挥动");
  });
});
