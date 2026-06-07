import { afterEach, describe, expect, it, vi } from "vitest";
import { isHapticSupported, pulseBlockHaptic, warmUpHaptics } from "./haptics";

function makeHeadDocumentStub() {
  const head = { appendChild: vi.fn(), removeChild: vi.fn() };
  return {
    head,
    createElement: (tag: string) => {
      const node = {
        type: "",
        ariaHidden: false,
        style: { display: "" },
        appendChild: vi.fn(),
        click: vi.fn(),
        setAttribute: vi.fn()
      };
      if (tag === "input") node.type = "checkbox";
      return node;
    }
  };
}

describe("haptics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses navigator.vibrate on non-ios devices", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { userAgent: "Android", vibrate });
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", makeHeadDocumentStub());

    pulseBlockHaptic(2);

    expect(vibrate).toHaveBeenCalled();
  });

  it("uses ios switch trick on iphone", () => {
    const doc = makeHeadDocumentStub();
    vi.stubGlobal("navigator", { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 });
    vi.stubGlobal("window", { setTimeout: (fn: () => void, _ms: number) => fn() });
    vi.stubGlobal("document", doc);

    pulseBlockHaptic(3);

    expect(doc.head.appendChild).toHaveBeenCalled();
  });

  it("warms up without throwing", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { userAgent: "Pixel", vibrate });
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", makeHeadDocumentStub());

    expect(() => warmUpHaptics()).not.toThrow();
  });

  it("reports support on ios and android", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", makeHeadDocumentStub());

    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    expect(isHapticSupported()).toBe(true);

    vi.stubGlobal("navigator", { userAgent: "Android", vibrate: vi.fn() });
    expect(isHapticSupported()).toBe(true);
  });
});
