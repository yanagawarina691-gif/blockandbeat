import { afterEach, describe, expect, it, vi } from "vitest";
import { playSfx, warmUpAudio } from "./sfx";

function makeAudioContextStub() {
  const gainParam = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  };
  const freqParam = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  const node = {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: "",
    frequency: freqParam,
    gain: gainParam,
    buffer: null as AudioBuffer | null
  };

  return class {
    state = "running";
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => undefined);
    createOscillator = vi.fn(() => ({ ...node, frequency: freqParam }));
    createGain = vi.fn(() => ({ ...node, gain: gainParam }));
    createBiquadFilter = vi.fn(() => ({ ...node, frequency: freqParam, Q: freqParam }));
    createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(120) }));
    createBufferSource = vi.fn(() => ({ ...node }));
  };
}

describe("sfx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("warms up audio without throwing", () => {
    vi.stubGlobal("window", {
      AudioContext: makeAudioContextStub(),
      setTimeout: (fn: () => void) => fn()
    });
    vi.stubGlobal("performance", { now: () => 1000 });

    expect(() => warmUpAudio()).not.toThrow();
  });

  it("plays cast sfx through audio context", () => {
    const Ctx = makeAudioContextStub();
    vi.stubGlobal("window", { AudioContext: Ctx, setTimeout: (fn: () => void, _ms: number) => fn() });
    vi.stubGlobal("performance", { now: () => 2000 });

    expect(() => playSfx("cast")).not.toThrow();
  });
});
