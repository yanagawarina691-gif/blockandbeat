import type { ElementType, SpellDefinition, SpellId } from "./types.js";

export const SPELLS: Record<SpellId, SpellDefinition> = {
  fireball: {
    id: "fireball",
    name: "火球",
    aliases: ["火球", "huoqiu", "火", "活球", "伙球", "火求", "火球术", "fireball", "fire"],
    element: "fire",
    tier: "quick",
    cooldownMs: 1200,
    speed: 284,
    damage: 12,
    radius: 18,
    color: 0xff5c2e,
    trailColor: 0xffb12e
  },
  waterball: {
    id: "waterball",
    name: "水球",
    aliases: ["水球", "shuiqiu", "水", "睡球"],
    element: "water",
    tier: "quick",
    cooldownMs: 1200,
    speed: 278,
    damage: 11,
    radius: 18,
    color: 0x41c7ff,
    trailColor: 0x9de9ff
  },
  vine: {
    id: "vine",
    name: "藤蔓",
    aliases: ["藤蔓", "草缚", "草縛", "tengman", "藤", "草", "蔓", "藤曼", "藤慢", "vine"],
    element: "grass",
    tier: "quick",
    cooldownMs: 1400,
    speed: 224,
    damage: 8,
    radius: 15,
    color: 0x62d46b,
    trailColor: 0xbbf15f
  },
  thunder: {
    id: "thunder",
    name: "雷矛",
    aliases: ["雷矛", "闪电", "閃電", "leimao", "雷", "电", "電", "雷毛", "雷猫", "thunder"],
    element: "lightning",
    tier: "quick",
    cooldownMs: 1600,
    speed: 290,
    damage: 11,
    radius: 12,
    color: 0xf8f05a,
    trailColor: 0xffffff
  },
  rockshield: {
    id: "rockshield",
    name: "岩盾",
    aliases: ["岩盾", "石盾", "yandun", "岩", "盾", "石头", "岩石", "rockshield", "rock"],
    element: "earth",
    tier: "heavy",
    cooldownMs: 3400,
    speed: 176,
    damage: 7,
    radius: 28,
    color: 0xc8a16a,
    trailColor: 0xf3d29a
  },
  windblade: {
    id: "windblade",
    name: "风刃",
    aliases: ["风刃", "風刃", "fengren", "风", "風", "刃", "风人", "疯刃", "windblade", "wind"],
    element: "wind",
    tier: "quick",
    cooldownMs: 1250,
    speed: 304,
    damage: 8,
    radius: 12,
    color: 0xc5fff4,
    trailColor: 0x7df8d6
  }
};

export const SPELL_LIST = Object.values(SPELLS);
export const RANDOM_SPELL_IDS = SPELL_LIST.map((spell) => spell.id);

export function pickRandomSpellId(): SpellId {
  return RANDOM_SPELL_IDS[Math.floor(Math.random() * RANDOM_SPELL_IDS.length)];
}

export function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[\s，。！？,.!?、·'"“”‘’]/g, "")
    .replace(/[！!？?。，,]/g, "");
}

export function findSpellByTranscript(transcript: string): SpellDefinition | null {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return null;

  return (
    [...SPELL_LIST]
      .sort(
        (a, b) =>
          Math.max(...b.aliases.map((alias) => alias.length)) - Math.max(...a.aliases.map((alias) => alias.length))
      )
      .find((spell) => spell.aliases.some((alias) => normalized.includes(normalizeTranscript(alias)))) ?? null
  );
}

export function elementName(element: ElementType): string {
  return {
    fire: "火",
    water: "水",
    grass: "草",
    lightning: "雷",
    earth: "岩",
    wind: "风"
  }[element];
}
