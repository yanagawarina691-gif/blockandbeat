import { pickRandomSpellId, SPELLS } from "./spells.js";
import type { MatchState, PlayerId, ProjectileState, SpellId } from "./types.js";

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 640;
export const BATTLE_Y = 378;
export const PLAYER_CAST_X: Record<PlayerId, number> = { p1: 92, p2: 268 };
export const PLAYER_RENDER_X: Record<PlayerId, number> = { p1: 74, p2: 286 };
export const CAST_COOLDOWN_MS = 1200;
export const AI_BLOCK_SUCCESS_RATE = 0.51;

const MATCH_DURATION_MS = 90_000;
const COUNTDOWN_MS = 1_800;
const GLOBAL_CAST_GAP_MS = 280;
const BLOCK_DEBOUNCE_MS = 90;
const BLOCK_SPEED_MULT = 1.12;
const BLOCK_SPEED_ADD = 18;
const MAX_PROJECTILE_SPEED = 520;
const BLOCK_ZONE: Record<PlayerId, { min: number; max: number }> = {
  p1: { min: 48, max: 100 },
  p2: { min: 260, max: 312 }
};
const LEFT_HIT_X = 56;
const RIGHT_HIT_X = 304;

let nextProjectileId = 1;
let nextImpactId = 1;

export function createMatchState(nowMs = 0): MatchState {
  return {
    status: "lobby",
    players: {
      p1: { id: "p1", health: 100, hits: 0, connected: false, ready: false },
      p2: { id: "p2", health: 100, hits: 0, connected: false, ready: false }
    },
    projectiles: [],
    impacts: [],
    nowMs,
    startedAtMs: 0,
    endsAtMs: 0,
    countdownEndsAtMs: 0,
    winnerId: null,
    castReadyAt: { p1: 0, p2: 0 },
    globalReadyAt: { p1: 0, p2: 0 },
    blockDebounceAt: { p1: 0, p2: 0 },
    recentText: ""
  };
}

export function startCountdown(state: MatchState, startsAtMs: number): void {
  resetBattle(state, startsAtMs - COUNTDOWN_MS);
  state.status = "countdown";
  state.countdownEndsAtMs = startsAtMs;
}

export function resetBattle(state: MatchState, nowMs: number): void {
  state.status = "lobby";
  state.players.p1.health = 100;
  state.players.p2.health = 100;
  state.players.p1.hits = 0;
  state.players.p2.hits = 0;
  state.projectiles = [];
  state.impacts = [];
  state.nowMs = nowMs;
  state.startedAtMs = 0;
  state.endsAtMs = 0;
  state.countdownEndsAtMs = 0;
  state.winnerId = null;
  state.castReadyAt = { p1: 0, p2: 0 };
  state.globalReadyAt = { p1: 0, p2: 0 };
  state.blockDebounceAt = { p1: 0, p2: 0 };
  state.recentText = "";
}

export interface BlockResult {
  blocked: boolean;
  spellName?: string;
  reason?: string;
  blockCount?: number;
}

export interface BlockOptions {
  successRate?: number;
}

function isThreatening(projectile: ProjectileState, defenderId: PlayerId): boolean {
  return defenderId === "p1" ? projectile.direction === -1 : projectile.direction === 1;
}

function findBlockableProjectile(state: MatchState, defenderId: PlayerId): ProjectileState | undefined {
  const zone = BLOCK_ZONE[defenderId];
  return state.projectiles
    .filter((projectile) => projectile.alive && isThreatening(projectile, defenderId))
    .sort((a, b) => (defenderId === "p1" ? a.x - b.x : b.x - a.x))
    .find((projectile) => projectile.x >= zone.min && projectile.x <= zone.max);
}

export function hasBlockableProjectile(state: MatchState, defenderId: PlayerId): boolean {
  return findBlockableProjectile(state, defenderId) !== undefined;
}

/** 场上仍有飞行中的技能（格挡拉锯中） */
export function hasLiveProjectiles(state: MatchState): boolean {
  return state.projectiles.some((projectile) => projectile.alive);
}

export function tryBlock(
  state: MatchState,
  defenderId: PlayerId,
  nowMs = state.nowMs,
  options: BlockOptions = {}
): BlockResult {
  if (state.status !== "running") return { blocked: false, reason: "战斗还没开始" };
  if (state.blockDebounceAt[defenderId] > nowMs) return { blocked: false, reason: "格挡太快" };

  const target = findBlockableProjectile(state, defenderId);
  if (!target) return { blocked: false, reason: "没有可格挡的技能" };

  const successRate = options.successRate ?? 1;
  if (Math.random() >= successRate) return { blocked: false, reason: "格挡失败" };

  reflectProjectile(state, target, defenderId, nowMs);
  const spellName = SPELLS[target.spellId].name;
  const speedLabel = target.blockCount > 1 ? ` ×${target.blockCount}` : "";
  state.recentText = `格挡：${spellName}${speedLabel}`;
  return { blocked: true, spellName, blockCount: target.blockCount };
}

function reflectProjectile(
  state: MatchState,
  projectile: ProjectileState,
  defenderId: PlayerId,
  nowMs: number
): void {
  const zone = BLOCK_ZONE[defenderId];
  projectile.direction = projectile.direction === 1 ? -1 : 1;
  projectile.ownerId = defenderId;
  projectile.blockCount += 1;
  projectile.speed = Math.min(
    MAX_PROJECTILE_SPEED,
    Math.round(projectile.speed * BLOCK_SPEED_MULT + BLOCK_SPEED_ADD)
  );
  projectile.boosted = true;
  projectile.x = defenderId === "p1" ? zone.min - 6 : zone.max + 6;
  state.blockDebounceAt[defenderId] = nowMs + BLOCK_DEBOUNCE_MS;
  addImpact(state, projectile.x, projectile.y, 0xfff06a, "格挡！");
}

export function canCast(state: MatchState, playerId: PlayerId, nowMs = state.nowMs): { ok: boolean; reason?: string } {
  if (state.status !== "running") return { ok: false, reason: "战斗还没开始" };
  if (state.globalReadyAt[playerId] > nowMs) return { ok: false, reason: "施法太快" };
  if (state.castReadyAt[playerId] > nowMs) return { ok: false, reason: "冷却中" };
  return { ok: true };
}

export function castRandomSpell(state: MatchState, playerId: PlayerId, nowMs = state.nowMs): boolean {
  return castSpell(state, playerId, pickRandomSpellId(), nowMs);
}

export function castSpell(state: MatchState, playerId: PlayerId, spellId: SpellId, nowMs = state.nowMs): boolean {
  const spell = SPELLS[spellId];
  const check = canCast(state, playerId, nowMs);
  if (!spell || !check.ok) {
    state.recentText = check.reason ?? "无法施法";
    return false;
  }

  state.castReadyAt[playerId] = nowMs + CAST_COOLDOWN_MS;
  state.globalReadyAt[playerId] = nowMs + GLOBAL_CAST_GAP_MS;
  state.projectiles.push({
    id: `shot-${nextProjectileId++}`,
    ownerId: playerId,
    spellId,
    x: PLAYER_CAST_X[playerId],
    y: BATTLE_Y,
    direction: playerId === "p1" ? 1 : -1,
    ageMs: 0,
    radius: spell.radius,
    damage: spell.damage,
    power: 1,
    speed: spell.speed,
    alive: true,
    boosted: false,
    blockCount: 0
  });
  state.recentText = `${playerId === "p1" ? "蓝方" : "红方"} ${spell.name}`;
  return true;
}

export function tickMatch(state: MatchState, dtMs: number, nowMs: number): void {
  state.nowMs = nowMs;
  if (state.status === "countdown" && nowMs >= state.countdownEndsAtMs) {
    state.status = "running";
    state.startedAtMs = nowMs;
    state.endsAtMs = nowMs + MATCH_DURATION_MS;
  }
  if (state.status !== "running") {
    updateImpacts(state, dtMs);
    return;
  }

  for (const projectile of state.projectiles) {
    projectile.ageMs += dtMs;
    projectile.x += projectile.direction * projectile.speed * (dtMs / 1000);
  }

  resolveProjectileCollisions(state);
  resolveHits(state);
  updateImpacts(state, dtMs);
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);

  if (state.players.p1.health <= 0 || state.players.p2.health <= 0 || nowMs >= state.endsAtMs) {
    finishMatch(state);
  }
}

export function timeLeftMs(state: MatchState): number {
  if (state.status !== "running") return MATCH_DURATION_MS;
  return Math.max(0, state.endsAtMs - state.nowMs);
}

export function castCooldownProgress(state: MatchState, playerId: PlayerId): number {
  const readyAt = state.castReadyAt[playerId] ?? 0;
  if (readyAt <= state.nowMs) return 1;
  return Math.max(0, 1 - (readyAt - state.nowMs) / CAST_COOLDOWN_MS);
}

function resolveProjectileCollisions(state: MatchState): void {
  for (let a = 0; a < state.projectiles.length; a += 1) {
    for (let b = a + 1; b < state.projectiles.length; b += 1) {
      const left = state.projectiles[a];
      const right = state.projectiles[b];
      if (!left.alive || !right.alive || left.ownerId === right.ownerId) continue;
      const distance = Math.hypot(left.x - right.x, left.y - right.y);
      if (distance <= left.radius + right.radius) resolveSpellCollision(state, left, right);
    }
  }
}

function resolveSpellCollision(state: MatchState, a: ProjectileState, b: ProjectileState): void {
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  defeatProjectile(state, a);
  defeatProjectile(state, b);
  addImpact(state, x, y, 0xffffff, "抵消");
}

function defeatProjectile(state: MatchState, projectile: ProjectileState): void {
  projectile.alive = false;
  addImpact(state, projectile.x, projectile.y, SPELLS[projectile.spellId].trailColor);
}

function resolveHits(state: MatchState): void {
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    const targetId: PlayerId = projectile.direction === 1 ? "p2" : "p1";
    const hit = projectile.direction === 1 ? projectile.x >= RIGHT_HIT_X : projectile.x <= LEFT_HIT_X;
    if (!hit) continue;

    state.players[targetId].health = Math.max(0, state.players[targetId].health - projectile.damage);
    state.players[projectile.ownerId].hits += 1;
    projectile.alive = false;
    addImpact(state, projectile.x, projectile.y, SPELLS[projectile.spellId].color, `-${projectile.damage}`);
  }
}

function updateImpacts(state: MatchState, dtMs: number): void {
  for (const impact of state.impacts) impact.ageMs += dtMs;
  state.impacts = state.impacts.filter((impact) => impact.ageMs < impact.ttlMs);
}

function finishMatch(state: MatchState): void {
  state.status = "finished";
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  if (p1.health === p2.health) {
    if (p1.hits === p2.hits) state.winnerId = "draw";
    else state.winnerId = p1.hits > p2.hits ? "p1" : "p2";
  } else {
    state.winnerId = p1.health > p2.health ? "p1" : "p2";
  }
}

function addImpact(state: MatchState, x: number, y: number, color: number, label?: string): void {
  state.impacts.push({
    id: `impact-${nextImpactId++}`,
    x,
    y,
    color,
    ageMs: 0,
    ttlMs: label === "格挡！" ? 920 : label ? 620 : 320,
    label
  });
}
