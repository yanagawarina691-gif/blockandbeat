import Phaser from "phaser";
import { ASSET_KEYS, ASSET_PATHS, CROPPED_SPELL_FX, GENERATED_SPELL_FX, sequenceFrameKey, sequenceFramePath } from "./assets";
import { gameBridge } from "./gameBridge";
import { SPELLS } from "../shared/spells";
import { BATTLE_Y, PLAYER_RENDER_X, WORLD_HEIGHT, WORLD_WIDTH } from "../shared/simulation";
import type { ImpactState, PlayerId, ProjectileState } from "../shared/types";

const PLAYER_BASELINE_Y = 436;
const PLAYER_SCALE = 3.45;
const THROW_WINDOW_MS = 520;
const HURT_WINDOW_MS = 520;

type CharacterSide = "dude" | "pink";

export class GameScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Graphics;
  private playerSprites = new Map<PlayerId, Phaser.GameObjects.Sprite>();
  private projectileSprites = new Map<string, Phaser.GameObjects.Image>();
  private fxText = new Map<string, Phaser.GameObjects.Text>();

  constructor() {
    super("game");
  }

  preload(): void {
    this.load.image(ASSET_KEYS.environment.battleground, ASSET_PATHS.environment.battleground);
    this.load.image(ASSET_KEYS.environment.bg, ASSET_PATHS.environment.bg);
    this.load.image(ASSET_KEYS.environment.candelia, ASSET_PATHS.environment.candelia);
    this.load.image(ASSET_KEYS.environment.columns, ASSET_PATHS.environment.columns);
    this.load.image(ASSET_KEYS.environment.dragon, ASSET_PATHS.environment.dragon);
    this.load.image(ASSET_KEYS.environment.floor, ASSET_PATHS.environment.floor);
    this.load.image(ASSET_KEYS.environment.mountains, ASSET_PATHS.environment.mountains);
    this.load.image(ASSET_KEYS.environment.wallWindows, ASSET_PATHS.environment.wallWindows);
    this.load.image(ASSET_KEYS.fx.magic, ASSET_PATHS.fx.magic);
    for (const generated of Object.values(GENERATED_SPELL_FX)) this.load.image(generated.key, generated.path);
    for (let frame = 1; frame <= 8; frame += 1) {
      this.load.image(sequenceFrameKey("fireArrow", frame), sequenceFramePath("fireArrow", frame));
      this.load.image(sequenceFrameKey("waterArrow", frame), sequenceFramePath("waterArrow", frame));
    }
    this.load.spritesheet(ASSET_KEYS.characters.dudeThrow, ASSET_PATHS.characters.dudeThrow, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet(ASSET_KEYS.characters.dudeHurt, ASSET_PATHS.characters.dudeHurt, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet(ASSET_KEYS.characters.pinkThrow, ASSET_PATHS.characters.pinkThrow, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet(ASSET_KEYS.characters.pinkHurt, ASSET_PATHS.characters.pinkHurt, { frameWidth: 32, frameHeight: 32 });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#11101c");
    this.drawBackground();
    this.world = this.add.graphics().setDepth(15);
  }

  update(): void {
    const state = gameBridge.getState();
    if (!state) return;

    const localPlayerId = gameBridge.getLocalPlayerId();
    this.world.clear();
    this.syncBlockFlash(localPlayerId);
    this.drawBattleGuides(localPlayerId);
    this.syncPlayers(localPlayerId);
    this.syncProjectiles(state.projectiles, localPlayerId);
    for (const impact of state.impacts) this.drawImpact(impact, localPlayerId);
    this.cleanupProjectiles(state.projectiles.map((projectile) => projectile.id));
    this.cleanupFxTexts(state.impacts.map((impact) => impact.id));
  }

  private drawBackground(): void {
    this.add
      .image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, ASSET_KEYS.environment.battleground)
      .setOrigin(0.5)
      .setDisplaySize(WORLD_HEIGHT * (16 / 9), WORLD_HEIGHT)
      .setDepth(-20);

    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x090713, 0.2).setDepth(-10);
  }

  private drawBattleGuides(localPlayerId: PlayerId): void {
    const g = this.world;
    const leftX = this.mapX(PLAYER_RENDER_X[localPlayerId], localPlayerId);
    const rightX = this.mapX(PLAYER_RENDER_X[this.opponentOf(localPlayerId)], localPlayerId);

    g.fillStyle(0x070611, 0.38);
    g.fillEllipse(leftX, PLAYER_BASELINE_Y + 4, 76, 18);
    g.fillEllipse(rightX, PLAYER_BASELINE_Y + 4, 76, 18);

    g.lineStyle(2, 0xfff06a, 0.18);
    g.lineBetween(88, BATTLE_Y + 2, WORLD_WIDTH - 88, BATTLE_Y + 2);
  }

  private syncPlayers(localPlayerId: PlayerId): void {
    const state = gameBridge.getState();
    if (!state) return;

    (["p1", "p2"] as PlayerId[]).forEach((playerId) => {
      const isLocal = playerId === localPlayerId;
      const side: CharacterSide = isLocal ? "dude" : "pink";
      const screenX = this.mapX(PLAYER_RENDER_X[playerId], localPlayerId);
      const isThrowing = state.projectiles.some((projectile) => projectile.ownerId === playerId && projectile.alive && projectile.ageMs < THROW_WINDOW_MS);
      const isHurt = state.impacts.some((impact) => {
        const impactX = this.mapX(impact.x, localPlayerId);
        return impact.label?.startsWith("-") && impact.ageMs < HURT_WINDOW_MS && Math.abs(impactX - screenX) < 72;
      });
      const texture = this.characterTexture(side, isHurt);
      const frame = isHurt || isThrowing ? Math.floor(this.time.now / 95) % 4 : 0;
      const sprite = this.getPlayerSprite(playerId, texture);

      sprite.setTexture(texture);
      sprite.setFrame(frame);
      sprite.setPosition(screenX, PLAYER_BASELINE_Y);
      sprite.setScale(PLAYER_SCALE);
      sprite.setFlipX(!isLocal);
      sprite.setDepth(35);
    });
  }

  private getPlayerSprite(playerId: PlayerId, texture: string): Phaser.GameObjects.Sprite {
    let sprite = this.playerSprites.get(playerId);
    if (!sprite) {
      sprite = this.add.sprite(0, 0, texture, 0).setOrigin(0.5, 1);
      this.playerSprites.set(playerId, sprite);
    }
    return sprite;
  }

  private syncProjectiles(projectiles: ProjectileState[], localPlayerId: PlayerId): void {
    for (const projectile of projectiles) {
      if (!projectile.alive) continue;
      this.drawProjectileTrail(projectile, localPlayerId);
      this.syncProjectileSprite(projectile, localPlayerId);
    }
  }

  private syncProjectileSprite(projectile: ProjectileState, localPlayerId: PlayerId): void {
    if (projectile.spellId === "fireball" || projectile.spellId === "waterball") {
      this.syncArrowProjectileSprite(projectile, localPlayerId);
      return;
    }

    const generated = GENERATED_SPELL_FX[projectile.spellId];
    if (generated) {
      this.syncGeneratedProjectileSprite(projectile, localPlayerId, generated);
      return;
    }

    const def = CROPPED_SPELL_FX[projectile.spellId];
    if (!def) return;
    const screenDirection = this.screenDirection(projectile.direction, localPlayerId);
    const sprite = this.getProjectileSprite(projectile.id);
    const frame = Math.floor(projectile.ageMs / 72) % def.frames;
    const cropX = def.x + frame * def.stepX;
    const x = this.mapX(projectile.x, localPlayerId);
    const y = projectile.y;
    const scaleX = def.displayWidth / def.width;
    const scaleY = def.displayHeight / def.height;

    sprite.setCrop(cropX, def.y, def.width, def.height);
    sprite.setPosition(x, y);
    sprite.setScale(screenDirection > 0 ? -scaleX : scaleX, scaleY);
    sprite.setAlpha(def.alpha ?? 1);
    sprite.setTint(projectile.boosted ? 0xfff06a : (def.tint ?? 0xffffff));
    sprite.setAngle(projectile.spellId === "thunder" ? (screenDirection > 0 ? 90 : -90) : 0);
    sprite.setDepth(projectile.spellId === "rockshield" ? 28 : 25);

    if (projectile.boosted) {
      this.world.lineStyle(3, 0xfff06a, 0.7);
      this.world.strokeCircle(x, y, projectile.radius + 8);
    }
  }

  private syncGeneratedProjectileSprite(
    projectile: ProjectileState,
    localPlayerId: PlayerId,
    def: { key: string; displayWidth: number; displayHeight: number; nativeDirection: -1 | 1 }
  ): void {
    const screenDirection = this.screenDirection(projectile.direction, localPlayerId);
    const sprite = this.getProjectileSprite(projectile.id);
    const pulse = 1 + Math.sin(projectile.ageMs * 0.018) * 0.035;

    sprite.setTexture(def.key);
    sprite.setCrop();
    sprite.setPosition(this.mapX(projectile.x, localPlayerId), projectile.y);
    sprite.setDisplaySize(def.displayWidth * pulse, def.displayHeight * pulse);
    this.faceSpriteDirection(sprite, screenDirection, def.nativeDirection);
    sprite.setAlpha(1);
    sprite.clearTint();
    sprite.setAngle(0);
    sprite.setDepth(projectile.spellId === "rockshield" ? 28 : 26);
  }

  private syncArrowProjectileSprite(projectile: ProjectileState, localPlayerId: PlayerId): void {
    const sequence = projectile.spellId === "fireball" ? "fireArrow" : "waterArrow";
    const frame = (Math.floor(projectile.ageMs / 58) % 8) + 1;
    const key = sequenceFrameKey(sequence, frame);
    const screenDirection = this.screenDirection(projectile.direction, localPlayerId);
    const sprite = this.getProjectileSprite(projectile.id);

    sprite.setTexture(key);
    sprite.setCrop();
    sprite.setPosition(this.mapX(projectile.x, localPlayerId), projectile.y);
    sprite.setDisplaySize(projectile.spellId === "fireball" ? 76 : 72, projectile.spellId === "fireball" ? 40 : 54);
    this.faceSpriteDirection(sprite, screenDirection, 1);
    sprite.setAlpha(1);
    sprite.clearTint();
    sprite.setAngle(0);
    sprite.setDepth(27);
  }

  private getProjectileSprite(id: string): Phaser.GameObjects.Image {
    let sprite = this.projectileSprites.get(id);
    if (!sprite) {
      sprite = this.add.image(0, 0, ASSET_KEYS.fx.magic).setOrigin(0.5).setDepth(25);
      this.projectileSprites.set(id, sprite);
    }
    return sprite;
  }

  private drawProjectileTrail(projectile: ProjectileState, localPlayerId: PlayerId): void {
    const spell = SPELLS[projectile.spellId];
    const direction = this.screenDirection(projectile.direction, localPlayerId);
    const x = this.mapX(projectile.x, localPlayerId);
    const y = projectile.y;
    const g = this.world;

    g.fillStyle(spell.trailColor, projectile.boosted ? 0.42 : 0.24);
    for (let i = 1; i <= 4; i += 1) {
      const width = Math.max(5, projectile.radius * 2 - i * 5);
      g.fillRect(x - direction * i * 12 - width / 2, y - 3, width, 6);
    }

    if (projectile.spellId === "waterball") {
      g.lineStyle(3, 0x9de9ff, 0.28);
      g.lineBetween(x - direction * 44, y + 15, x - direction * 16, y + 6);
    }
  }

  private syncBlockFlash(localPlayerId: PlayerId): void {
    const left = performance.now();
    if (gameBridge.blockFlashUntil <= left) return;

    const strength = (gameBridge.blockFlashUntil - left) / 520;
    this.cameras.main.shake(140, 0.01 * strength);
    const x = this.mapX(PLAYER_RENDER_X[localPlayerId], localPlayerId);
    const g = this.world;
    const pulse = 58 + (1 - strength) * 42;
    g.lineStyle(5, 0xfff06a, 0.55 * strength);
    g.strokeCircle(x, BATTLE_Y, pulse);
    g.lineStyle(2, 0xffffff, 0.35 * strength);
    g.strokeCircle(x, BATTLE_Y, pulse * 0.72);
  }

  private drawImpact(impact: ImpactState, localPlayerId: PlayerId): void {
    const age = impact.ageMs / impact.ttlMs;
    const x = this.mapX(impact.x, localPlayerId);
    const y = impact.y;
    const isBlock = impact.label === "格挡！";
    const size = isBlock ? 18 + age * 52 : 10 + age * 34;
    const alpha = 1 - age;
    const g = this.world;
    g.fillStyle(impact.color, alpha);
    g.fillRect(x - size / 2, y - 3, size, 6);
    g.fillRect(x - 3, y - size / 2, 6, size);
    g.fillStyle(0xffffff, alpha * 0.74);
    g.fillRect(x - size / 3, y - size / 3, size / 1.5, size / 1.5);

    if (impact.label) this.drawImpactText(impact, x, y - (isBlock ? 36 : 28), alpha);
  }

  private drawImpactText(impact: ImpactState, x: number, y: number, alpha: number): void {
    const isBlock = impact.label === "格挡！";
    let text = this.fxText.get(impact.id);
    if (!text) {
      text = this.add.text(x, y, impact.label ?? "", {
        fontFamily: "monospace",
        fontSize: isBlock ? "20px" : "12px",
        color: isBlock ? "#fff06a" : "#ffffff",
        stroke: "#101522",
        strokeThickness: isBlock ? 6 : 4
      });
      text.setOrigin(0.5);
      text.setDepth(45);
      this.fxText.set(impact.id, text);
    }
    text.setPosition(x, y - impact.ageMs * 0.025);
    text.setAlpha(alpha);
  }

  private cleanupProjectiles(activeIds: string[]): void {
    const active = new Set(activeIds);
    for (const [id, sprite] of this.projectileSprites.entries()) {
      if (active.has(id)) continue;
      sprite.destroy();
      this.projectileSprites.delete(id);
    }
  }

  private cleanupFxTexts(activeIds: string[]): void {
    const active = new Set(activeIds);
    for (const [id, text] of this.fxText.entries()) {
      if (active.has(id)) continue;
      text.destroy();
      this.fxText.delete(id);
    }
  }

  private characterTexture(side: CharacterSide, hurt: boolean): string {
    if (side === "dude") return hurt ? ASSET_KEYS.characters.dudeHurt : ASSET_KEYS.characters.dudeThrow;
    return hurt ? ASSET_KEYS.characters.pinkHurt : ASSET_KEYS.characters.pinkThrow;
  }

  private mapX(x: number, localPlayerId: PlayerId): number {
    return localPlayerId === "p1" ? x : WORLD_WIDTH - x;
  }

  private screenDirection(direction: -1 | 1, localPlayerId: PlayerId): -1 | 1 {
    if (localPlayerId === "p1") return direction;
    return direction === 1 ? -1 : 1;
  }

  private faceSpriteDirection(sprite: Phaser.GameObjects.Image, screenDirection: -1 | 1, nativeDirection: -1 | 1): void {
    sprite.setFlipX(false);
    sprite.setScale(Math.abs(sprite.scaleX) * screenDirection * nativeDirection, Math.abs(sprite.scaleY));
  }

  private opponentOf(playerId: PlayerId): PlayerId {
    return playerId === "p1" ? "p2" : "p1";
  }
}
