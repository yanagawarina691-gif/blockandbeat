import { describe, expect, it } from "vitest";
import {
  castRandomSpell,
  castSpell,
  createMatchState,
  resetBattle,
  hasLiveProjectiles,
  startCountdown,
  tickMatch,
  tryBlock
} from "./simulation";
import type { ProjectileState } from "./types";

function runningState(now = 1_000) {
  const state = createMatchState(now);
  state.players.p1.connected = true;
  state.players.p2.connected = true;
  startCountdown(state, now);
  tickMatch(state, 0, now);
  return state;
}

function makeProjectile(partial: Partial<ProjectileState> & Pick<ProjectileState, "ownerId" | "spellId" | "x" | "direction">): ProjectileState {
  return {
    id: "test-shot",
    y: 378,
    ageMs: 0,
    radius: 14,
    damage: 12,
    power: 1,
    speed: 284,
    alive: true,
    boosted: false,
    blockCount: 0,
    ...partial
  };
}

describe("element duel simulation", () => {
  it("resets a completed match to the lobby without losing room membership", () => {
    const state = runningState();
    state.status = "finished";
    state.winnerId = "p1";
    resetBattle(state, 5000);
    expect(state.status).toBe("lobby");
    expect(state.winnerId).toBeNull();
    expect(state.players.p1.connected).toBe(true);
  });
  it("cancels any colliding enemy projectiles", () => {
    const state = runningState();
    expect(castSpell(state, "p1", "waterball", 1_050)).toBe(true);
    expect(castSpell(state, "p2", "fireball", 1_050)).toBe(true);

    for (let i = 0; i < 12; i += 1) tickMatch(state, 33, 1_050 + i * 33);

    expect(state.projectiles).toHaveLength(0);
    expect(state.impacts.some((impact) => impact.label === "抵消")).toBe(true);
  });

  it("blocks repeated casts while cooling down", () => {
    const state = runningState();
    expect(castSpell(state, "p1", "fireball", 1_050)).toBe(true);
    expect(castSpell(state, "p1", "waterball", 1_200)).toBe(false);
    expect(castSpell(state, "p1", "vine", 2_400)).toBe(true);
  });

  it("finishes when a player reaches zero health", () => {
    const state = runningState();
    state.players.p2.health = 5;
    expect(castSpell(state, "p1", "thunder", 1_050)).toBe(true);

    for (let i = 0; i < 80; i += 1) tickMatch(state, 33, 1_050 + i * 33);

    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe("p1");
  });

  it("reflects blocked projectiles and makes them faster", () => {
    const state = runningState();
    const incoming = makeProjectile({
      id: "enemy-shot",
      ownerId: "p2",
      spellId: "fireball",
      x: 78,
      direction: -1,
      speed: 284
    });
    state.projectiles.push(incoming);

    const result = tryBlock(state, "p1", 1_100);
    expect(result.blocked).toBe(true);
    expect(incoming.alive).toBe(true);
    expect(incoming.direction).toBe(1);
    expect(incoming.blockCount).toBe(1);
    expect(incoming.ownerId).toBe("p1");
    expect(incoming.speed).toBeGreaterThan(284);
    expect(state.impacts.some((impact) => impact.label === "格挡！")).toBe(true);
  });

  it("lets the same projectile be blocked back and forth", () => {
    const state = runningState();
    const shot = makeProjectile({
      ownerId: "p1",
      spellId: "fireball",
      x: 78,
      direction: -1,
      speed: 284
    });
    state.projectiles.push(shot);

    expect(tryBlock(state, "p1", 1_100).blocked).toBe(true);
    expect(shot.direction).toBe(1);

    shot.x = 280;
    expect(tryBlock(state, "p2", 1_200).blocked).toBe(true);
    expect(shot.direction).toBe(-1);
    expect(shot.blockCount).toBe(2);
    expect(shot.speed).toBeGreaterThan(360);
  });

  it("can fail blocks with a success rate", () => {
    const state = runningState();
    state.projectiles.push(
      makeProjectile({
        ownerId: "p2",
        spellId: "fireball",
        x: 78,
        direction: -1
      })
    );

    const originalRandom = Math.random;
    Math.random = () => 0.9;
    const result = tryBlock(state, "p1", 1_100, { successRate: 0.51 });
    Math.random = originalRandom;

    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("格挡失败");
  });

  it("hits the player that failed to block a reflected shot", () => {
    const state = runningState();
    state.projectiles.push(
      makeProjectile({
        ownerId: "p2",
        spellId: "fireball",
        x: 52,
        direction: -1,
        speed: 900
      })
    );

    tickMatch(state, 16, 1_100);

    expect(state.players.p1.health).toBeLessThan(100);
    expect(state.projectiles).toHaveLength(0);
  });

  it("tracks live projectiles on the field", () => {
    const state = runningState();
    expect(hasLiveProjectiles(state)).toBe(false);
    castSpell(state, "p1", "fireball", 1_050);
    expect(hasLiveProjectiles(state)).toBe(true);
  });

  it("casts random spells", () => {
    const state = runningState();
    expect(castRandomSpell(state, "p1", 1_050)).toBe(true);
    expect(state.projectiles).toHaveLength(1);
  });
});
