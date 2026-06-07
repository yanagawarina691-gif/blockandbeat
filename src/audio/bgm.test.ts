import { afterEach, describe, expect, it, vi } from "vitest";
import { stopBgm, syncBgm, warmUpBgm } from "./bgm";

describe("bgm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts and stops with match status", () => {
    const play = vi.fn(async () => undefined);
    const pause = vi.fn();
    const audio = { loop: false, volume: 0, preload: "", currentTime: 0, paused: true, load: vi.fn(), play, pause };
    const AudioCtor = vi.fn(() => audio);
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Audio", AudioCtor);

    warmUpBgm();
    warmUpBgm();
    syncBgm("running");
    expect(play).toHaveBeenCalled();
    expect(audio.load).toHaveBeenCalledTimes(1);

    audio.paused = false;
    syncBgm("finished");
    expect(pause).toHaveBeenCalled();

    stopBgm();
    expect(audio.currentTime).toBe(0);
  });
});
