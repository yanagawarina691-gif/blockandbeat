import type { SpellId } from "../shared/types";

export const ASSET_KEYS = {
  environment: {
    battleground: "environment:battleground2",
    bg: "environment:bg",
    candelia: "environment:candelia",
    columns: "environment:columns",
    dragon: "environment:dragon",
    floor: "environment:floor",
    mountains: "environment:mountains",
    wallWindows: "environment:wall-windows"
  },
  characters: {
    dudeThrow: "character:dude-throw",
    dudeHurt: "character:dude-hurt",
    pinkThrow: "character:pink-throw",
    pinkHurt: "character:pink-hurt"
  },
  fx: {
    magic: "fx:magic-effects",
    fireArrow: "fx:fire-arrow",
    waterArrow: "fx:water-arrow",
    thunderArrow: "fx:generated:thunder-arrow",
    windArrow: "fx:generated:wind-arrow",
    vineArrow: "fx:generated:vine-arrow",
    rockArrow: "fx:generated:rock-arrow"
  }
} as const;

export const ASSET_PATHS = {
  environment: {
    battleground: "/assets/environment/battleground2.png",
    bg: "/assets/environment/bg.png",
    candelia: "/assets/environment/candeliar.png",
    columns: "/assets/environment/columns-flags.png",
    dragon: "/assets/environment/dragon.png",
    floor: "/assets/environment/floor.png",
    mountains: "/assets/environment/mountains.png",
    wallWindows: "/assets/environment/wall-windows.png"
  },
  characters: {
    dudeThrow: "/assets/characters/dude-throw.png",
    dudeHurt: "/assets/characters/dude-hurt.png",
    pinkThrow: "/assets/characters/pink-throw.png",
    pinkHurt: "/assets/characters/pink-hurt.png"
  },
  fx: {
    magic: "/assets/fx/magic-effects.webp",
    fireArrowDir: "/assets/fx/fire-arrow",
    waterArrowDir: "/assets/fx/water-arrow",
    thunderArrow: "/assets/fx/generated/thunder-arrow.png",
    windArrow: "/assets/fx/generated/wind-arrow.png",
    vineArrow: "/assets/fx/generated/vine-arrow.png",
    rockArrow: "/assets/fx/generated/rock-arrow.png"
  }
} as const;

export function sequenceFrameKey(sequence: "fireArrow" | "waterArrow", frame: number): string {
  return `${ASSET_KEYS.fx[sequence]}:${frame.toString().padStart(2, "0")}`;
}

export function sequenceFramePath(sequence: "fireArrow" | "waterArrow", frame: number): string {
  const dir = sequence === "fireArrow" ? ASSET_PATHS.fx.fireArrowDir : ASSET_PATHS.fx.waterArrowDir;
  return `${dir}/frame-${frame.toString().padStart(2, "0")}.png`;
}

export interface FxCropDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  stepX: number;
  frames: number;
  displayWidth: number;
  displayHeight: number;
  tint?: number;
  alpha?: number;
}

export interface GeneratedSpellFxDefinition {
  key: string;
  path: string;
  displayWidth: number;
  displayHeight: number;
  nativeDirection: -1 | 1;
}

export const GENERATED_SPELL_FX: Partial<Record<SpellId, GeneratedSpellFxDefinition>> = {
  thunder: {
    key: ASSET_KEYS.fx.thunderArrow,
    path: ASSET_PATHS.fx.thunderArrow,
    displayWidth: 78,
    displayHeight: 44,
    nativeDirection: 1
  },
  windblade: {
    key: ASSET_KEYS.fx.windArrow,
    path: ASSET_PATHS.fx.windArrow,
    displayWidth: 78,
    displayHeight: 48,
    nativeDirection: 1
  },
  vine: {
    key: ASSET_KEYS.fx.vineArrow,
    path: ASSET_PATHS.fx.vineArrow,
    displayWidth: 82,
    displayHeight: 54,
    nativeDirection: 1
  },
  rockshield: {
    key: ASSET_KEYS.fx.rockArrow,
    path: ASSET_PATHS.fx.rockArrow,
    displayWidth: 82,
    displayHeight: 54,
    nativeDirection: 1
  }
};

export const CROPPED_SPELL_FX: Partial<Record<SpellId, FxCropDefinition>> = {
  thunder: {
    x: 552,
    y: 122,
    width: 74,
    height: 104,
    stepX: 70,
    frames: 8,
    displayWidth: 36,
    displayHeight: 66,
    tint: 0xdfffff
  },
  windblade: {
    x: 552,
    y: 34,
    width: 92,
    height: 72,
    stepX: 86,
    frames: 8,
    displayWidth: 58,
    displayHeight: 32,
    tint: 0xb8fff3,
    alpha: 0.9
  },
  rockshield: {
    x: 552,
    y: 660,
    width: 88,
    height: 92,
    stepX: 88,
    frames: 8,
    displayWidth: 54,
    displayHeight: 62,
    tint: 0xc8a16a
  },
  vine: {
    x: 552,
    y: 508,
    width: 92,
    height: 78,
    stepX: 86,
    frames: 8,
    displayWidth: 54,
    displayHeight: 42,
    tint: 0x62d46b
  }
};
