export type PlayerId = "p1" | "p2";

export type ElementType = "fire" | "water" | "grass" | "lightning" | "earth" | "wind";

export type SpellId =
  | "fireball"
  | "waterball"
  | "vine"
  | "thunder"
  | "rockshield"
  | "windblade";

export interface SpellDefinition {
  id: SpellId;
  name: string;
  aliases: string[];
  element: ElementType;
  tier: "quick" | "heavy";
  cooldownMs: number;
  speed: number;
  damage: number;
  radius: number;
  color: number;
  trailColor: number;
}

export interface PlayerState {
  id: PlayerId;
  health: number;
  hits: number;
  connected: boolean;
  ready: boolean;
}

export interface ProjectileState {
  id: string;
  ownerId: PlayerId;
  spellId: SpellId;
  x: number;
  y: number;
  direction: -1 | 1;
  ageMs: number;
  radius: number;
  damage: number;
  power: number;
  speed: number;
  alive: boolean;
  boosted: boolean;
  blockCount: number;
}

export interface ImpactState {
  id: string;
  x: number;
  y: number;
  color: number;
  ageMs: number;
  ttlMs: number;
  label?: string;
}

export interface MatchState {
  status: "lobby" | "countdown" | "running" | "finished";
  players: Record<PlayerId, PlayerState>;
  projectiles: ProjectileState[];
  impacts: ImpactState[];
  nowMs: number;
  startedAtMs: number;
  endsAtMs: number;
  countdownEndsAtMs: number;
  winnerId: PlayerId | "draw" | null;
  castReadyAt: Record<PlayerId, number>;
  globalReadyAt: Record<PlayerId, number>;
  blockDebounceAt: Record<PlayerId, number>;
  recentText: string;
}

