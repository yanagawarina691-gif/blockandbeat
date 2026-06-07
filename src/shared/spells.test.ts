import { describe, expect, it } from "vitest";
import { findSpellByTranscript, normalizeTranscript } from "./spells";

describe("spell voice matching", () => {
  it("matches canonical skill names", () => {
    expect(findSpellByTranscript("火球")?.id).toBe("fireball");
    expect(findSpellByTranscript("水球")?.id).toBe("waterball");
    expect(findSpellByTranscript("风刃")?.id).toBe("windblade");
    expect(findSpellByTranscript("雷矛")?.id).toBe("thunder");
    expect(findSpellByTranscript("藤蔓")?.id).toBe("vine");
    expect(findSpellByTranscript("岩盾")?.id).toBe("rockshield");
  });

  it("normalizes punctuation and spacing from speech transcripts", () => {
    expect(normalizeTranscript(" 火球！ ")).toBe("火球");
    expect(findSpellByTranscript("喊，水球。")?.id).toBe("waterball");
    expect(findSpellByTranscript("放 风 刃")?.id).toBe("windblade");
  });

  it("matches common misheard aliases", () => {
    expect(findSpellByTranscript("活球")?.id).toBe("fireball");
    expect(findSpellByTranscript("睡球")?.id).toBe("waterball");
    expect(findSpellByTranscript("闪电")?.id).toBe("thunder");
    expect(findSpellByTranscript("石盾")?.id).toBe("rockshield");
  });

  it("prefers longer aliases when multiple could match", () => {
    expect(findSpellByTranscript("火球术")?.id).toBe("fireball");
    expect(findSpellByTranscript("水球攻击")?.id).toBe("waterball");
  });
});
