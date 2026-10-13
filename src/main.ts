import Phaser from "phaser";
import "./styles.css";
import { GameScene } from "./game/GameScene";
import { gameBridge } from "./game/gameBridge";
import { stopBgm, syncBgm, warmUpBgm } from "./audio/bgm";
import { playSfx, warmUpAudio } from "./audio/sfx";
import { pulseBlockHaptic, warmUpHaptics } from "./input/haptics";
import { SwingBlockController, swingSupportMessage } from "./input/swingBlockController";
import { MatchClient } from "./net/matchClient";
import {
  AI_BLOCK_SUCCESS_RATE,
  castCooldownProgress,
  castRandomSpell,
  createMatchState,
  hasBlockableProjectile,
  hasLiveProjectiles,
  resetBattle,
  startCountdown,
  tickMatch,
  tryBlock,
  timeLeftMs,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "./shared/simulation";
import type { MatchState, PlayerId } from "./shared/types";

const foundUiRoot = document.querySelector<HTMLDivElement>("#ui");
if (!foundUiRoot) throw new Error("Missing #ui root");
const uiRoot: HTMLDivElement = foundUiRoot;

const state = createMatchState(Date.now());
const client = new MatchClient();
const swing = new SwingBlockController();
const onlineAvailable = import.meta.env.VITE_ONLINE_ENABLED !== "false" && (
  Boolean(import.meta.env.VITE_WS_URL) || import.meta.env.VITE_ONLINE_ENABLED === "true" ||
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname)
);

type PlayMode = "online" | "ai" | "tutorial";

let localPlayerId: PlayerId = "p1";
let playMode: PlayMode = "online";
let roomCode = "";
let networkStatus = onlineAvailable ? "未连接（人机/教程不受影响）" : "线上联机暂未开放";
let inputStatus = swingSupportMessage();
let blockFlashUntil = 0;
let lastMatchStatus = state.status;
let errorText = "";
let lastFrame = performance.now();
let lastRender = 0;
let renderKey = "";
let aiNextCastAt = 0;
let aiBlockAttemptAt = 0;
let tutorialStep = 0;
let tutorialHint = "";
let tutorialNextEnemyAt = 0;
let tutorialCastDone = false;
let tutorialBlockDone = false;
let heardImpactIds = new Set<string>();
let lastCountdownSecond = -1;
let lastSfxMatchStatus = state.status;

const AI_ATTACK_BASE_MS = 1400;
const AI_BLOCK_ATTEMPT_INTERVAL_MS = 150;

function randomAttackJitter(): number {
  return 1000 + Math.random() * 1000;
}

function nextAttackDelay(baseMs = AI_ATTACK_BASE_MS): number {
  return baseMs + randomAttackJitter();
}

function warmUpFeedback(): void {
  warmUpHaptics();
  warmUpAudio();
  warmUpBgm();
}

function resetSfxTrackers(): void {
  heardImpactIds.clear();
  lastCountdownSecond = -1;
  lastSfxMatchStatus = state.status;
}

function syncBattleSfx(): void {
  syncBgm(state.status);

  if (state.status === "countdown") {
    const sec = Math.max(1, Math.ceil((state.countdownEndsAtMs - state.nowMs) / 1000));
    if (sec !== lastCountdownSecond) {
      lastCountdownSecond = sec;
      playSfx("countdown");
    }
  }

  for (const impact of state.impacts) {
    if (heardImpactIds.has(impact.id)) continue;
    heardImpactIds.add(impact.id);
    if (impact.label === "抵消") playSfx("cancel");
    else if (impact.label?.startsWith("-")) playSfx("hit", { damage: Number(impact.label.slice(1)) || 10 });
  }

  if (lastSfxMatchStatus !== "finished" && state.status === "finished") {
    if (state.winnerId === "draw") playSfx("cancel");
    else if (state.winnerId === localPlayerId) playSfx("win");
    else playSfx("lose");
  }
  lastSfxMatchStatus = state.status;
}

gameBridge.getState = () => state;
gameBridge.getLocalPlayerId = () => localPlayerId;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: "#101522",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT
  },
  scene: [GameScene]
});

client.onStatus((status) => {
  networkStatus = status;
  if (status === "已断开" && playMode === "online" && roomCode) {
    returnHome();
    errorText = "连接已断开，请重新加入房间";
  }
  render();
});

client.onMessage((message) => {
  if (playMode !== "online") return;
  if (message.type === "matchSnapshot") Object.assign(state, message.state);
  if (message.type === "blockResult") handleBlockResult(message);
  if (message.type === "roomCreated" || message.type === "roomJoined") {
    roomCode = message.roomCode;
    localPlayerId = message.playerId;
    errorText = "";
  }
  if (message.type === "roomState") {
    roomCode = message.roomCode;
    for (const player of message.players) {
      state.players[player.playerId].connected = player.connected;
      state.players[player.playerId].ready = player.ready;
    }
  }
  if (message.type === "matchStart") {
    resetSfxTrackers();
    errorText = "";
  }
  if (message.type === "spellCast") {
    playSfx(message.playerId === localPlayerId ? "cast" : "castEnemy");
  }
  if (message.type === "playerDisconnected") {
    state.players[message.playerId].connected = false;
    errorText = "对手已断开";
  }
  if (message.type === "rematch") {
    resetBattle(state, Date.now());
  }
  if (message.type === "error") errorText = message.message;
  render();
});

let lastInputRenderAt = 0;

swing.onStatus((status) => {
  inputStatus = status;
  const now = Date.now();
  const urgent = status.includes("格挡") || status.includes("挥动") || status.includes("权限");
  if (urgent || now - lastInputRenderAt > 220) {
    lastInputRenderAt = now;
    render();
  }
});

function handleBlockResult(result: ReturnType<typeof tryBlock>): void {
  if (result.blocked) {
    inputStatus = `格挡成功：${result.spellName}`;
    if (playMode === "tutorial" && tutorialStep === 2) tutorialBlockDone = true;
    triggerBlockSuccess(result.blockCount ?? 1);
  } else {
    inputStatus = result.reason ?? "挥动未格挡";
    render(true);
  }
}

swing.onSwing(() => {
  if (state.status !== "running") return;
  if (playMode === "online") client.block();
  else handleBlockResult(tryBlock(state, localPlayerId, Date.now()));
});

render(true);
requestAnimationFrame(loop);

window.addEventListener("keydown", (event) => {
  if ((event.key === " " || event.key === "Enter") && state.status === "running") {
    event.preventDefault();
    warmUpHaptics();
    warmUpAudio();
    castLocalPlayerSpell();
  }
});

function loop(now: number): void {
  const dt = Math.min(50, now - lastFrame);
  lastFrame = now;
  if (playMode !== "online") tickMatch(state, dt, Date.now());
  syncBattleSfx();
  syncSwingWithMatch();
  if (Date.now() < blockFlashUntil && now - lastRender > 60) {
    render();
    lastRender = now;
  }
  runLocalOpponent(Date.now());
  runAiBlock(Date.now());

  if (now - lastRender > 180) {
    render();
    lastRender = now;
  }
  requestAnimationFrame(loop);
}

function render(force = false): void {
  const roomInputIsFocused =
    document.activeElement instanceof HTMLInputElement && document.activeElement.dataset.roomInput !== undefined;
  if (!force && roomInputIsFocused) return;

  const nextRenderKey = makeRenderKey();
  if (!force && nextRenderKey === renderKey) return;
  renderKey = nextRenderKey;

  const focusedInput = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
  const activeInputValue = uiRoot.querySelector<HTMLInputElement>("[data-room-input]")?.value ?? "";
  const shouldRestoreRoomInput = focusedInput?.dataset.roomInput !== undefined;
  const connected = Boolean(roomCode) || playMode !== "online";
  uiRoot.innerHTML = `
    <div class="hud ${state.status}">
      ${renderTopBar(state, localPlayerId)}
      ${connected ? renderRoomPanel(state, localPlayerId) : renderLobby()}
      ${renderBottomBar(state, localPlayerId)}
      ${state.status === "finished" ? renderResult(state, localPlayerId) : ""}
      ${Date.now() < blockFlashUntil ? '<div class="block-flash" aria-hidden="true"></div>' : ""}
    </div>
  `;

  uiRoot.querySelector<HTMLButtonElement>("[data-action='create']")?.addEventListener("click", () => {
    if (!onlineAvailable) {
      errorText = "线上版先开放教程和人机；联机房间需要接入实时服务";
      render(true);
      return;
    }
    ensureOnlineConnection();
    client.createRoom();
  });
  uiRoot.querySelector<HTMLButtonElement>("[data-action='join']")?.addEventListener("click", () => {
    if (!onlineAvailable) {
      errorText = "线上版先开放教程和人机；联机房间需要接入实时服务";
      render(true);
      return;
    }
    const input = uiRoot.querySelector<HTMLInputElement>("[data-room-input]");
    const code = input?.value;
    if (code) {
      ensureOnlineConnection();
      client.joinRoom(code);
    }
  });
  uiRoot.querySelector<HTMLButtonElement>("[data-action='ai']")?.addEventListener("click", () => {
    warmUpFeedback();
    startLocalMatch("ai");
  });
  uiRoot.querySelector<HTMLButtonElement>("[data-action='tutorial']")?.addEventListener("click", () => {
    warmUpFeedback();
    startLocalMatch("tutorial");
  });
  uiRoot.querySelector<HTMLButtonElement>("[data-action='back-home']")?.addEventListener("click", () => returnHome());
  uiRoot.querySelector<HTMLButtonElement>("[data-action='ready']")?.addEventListener("click", () => {
    if (playMode === "online") {
      ensureOnlineConnection();
      client.ready(!state.players[localPlayerId].ready);
      void startSwingFromGesture();
      return;
    }
    startLocalMatch(playMode);
    void startSwingFromGesture();
  });
  uiRoot.querySelector<HTMLButtonElement>("[data-action='gyro']")?.addEventListener("click", () => {
    if (swing.isActive()) swing.stop();
    else void startSwingFromGesture();
  });
  uiRoot.querySelector<HTMLButtonElement>("[data-action='rematch']")?.addEventListener("click", () => {
    if (playMode === "online") {
      ensureOnlineConnection();
      client.rematch();
    } else {
      startLocalMatch(playMode);
    }
    void startSwingFromGesture();
  });
  uiRoot.querySelector<HTMLButtonElement>("[data-action='cast']")?.addEventListener("click", () => {
    warmUpHaptics();
    warmUpAudio();
    castLocalPlayerSpell();
  });

  const input = uiRoot.querySelector<HTMLInputElement>("[data-room-input]");
  if (input) {
    input.value = activeInputValue;
    if (shouldRestoreRoomInput) input.focus();
  }
}

function renderBlockGuide(): string {
  return `
    <section class="gyro-card">
      <div class="gyro-card-title">操作说明</div>
      <ul class="gyro-map">
        <li><b>施法</b> → 点「施法」按钮（随机元素）</li>
        <li><b>格挡</b> → 挥动手机反弹加速，成功有震动和音效</li>
        <li><b>相撞</b> → 双方技能会抵消</li>
      </ul>
      <div class="status-line compact">手机请用 https 链接；开战后点「启体感」并允许传感器</div>
    </section>
  `;
}

function triggerBlockSuccess(blockCount = 1): void {
  pulseBlockHaptic(blockCount);
  playSfx("block", { blockCount });
  gameBridge.triggerBlockFlash();
  blockFlashUntil = Date.now() + 520;
  render(true);
}

function renderLobby(): string {
  return `
    <section class="panel lobby-panel">
      <div class="brand">Block & Beat</div>
      <div class="subtitle">像素元素体感对战</div>
      ${renderBlockGuide()}
      <button class="primary" data-action="tutorial">新手教程</button>
      <button data-action="ai">人机模式</button>
      <button data-action="create" ${onlineAvailable ? "" : "disabled"}>创建房间</button>
      <div class="join-row">
        <input data-room-input maxlength="6" placeholder="房间码" autocomplete="off" inputmode="text" ${onlineAvailable ? "" : "disabled"} />
        <button data-action="join" ${onlineAvailable ? "" : "disabled"}>加入</button>
      </div>
      <div class="status-line">${networkStatus}</div>
      ${errorText ? `<div class="error">${errorText}</div>` : ""}
    </section>
  `;
}

function renderRoomPanel(match: MatchState, playerId: PlayerId): string {
  if (match.status === "running") {
    return `
      <section class="center-chip">${tutorialHint || match.recentText || "点施法，挥动格挡反弹"}</section>
      ${playMode !== "online" ? `<button class="exit-run" data-action="back-home">返回</button>` : ""}
      ${playMode === "tutorial" ? renderTutorialCard() : ""}
    `;
  }
  if (match.status === "countdown") {
    const left = Math.max(1, Math.ceil((match.countdownEndsAtMs - match.nowMs) / 1000));
    return `<section class="countdown">${left}</section>`;
  }

  const local = match.players[playerId];
  const remote = match.players[opponentOf(playerId)];
  if (playMode !== "online") {
    return `
      <section class="panel room-panel">
        <div class="room-code">${playMode === "tutorial" ? "教程关" : "人机模式"}</div>
        <div class="status-line">${playMode === "tutorial" ? "学会施法与格挡反弹" : "点施法随机出招，挥动格挡反弹"}</div>
        <button class="primary" data-action="ready">开始</button>
        <button data-action="gyro">${swing.isActive() ? "关闭挥动检测" : "启体感"}</button>
        <button data-action="back-home">返回首页</button>
        ${renderBlockGuide()}
        <div class="status-line">${inputStatus}</div>
      </section>
    `;
  }

  return `
    <section class="panel room-panel">
      <div class="room-code">${roomCode}</div>
      <div class="room-grid">
        <span class="pill local">${local.ready ? "己方已准备" : "己方待准备"}</span>
        <span class="pill remote">${remote.connected ? (remote.ready ? "对手已准备" : "对手待准备") : "等待对手"}</span>
      </div>
      <button class="primary" data-action="ready">${local.ready ? "取消准备" : "准备"}</button>
      <button data-action="gyro">${swing.isActive() ? "关闭挥动检测" : "启体感"}</button>
      <button data-action="back-home">返回首页</button>
      <div class="status-line">${networkStatus} · ${inputStatus}</div>
      ${errorText ? `<div class="error">${errorText}</div>` : ""}
    </section>
  `;
}

function renderTopBar(match: MatchState, playerId: PlayerId): string {
  const remote = match.players[opponentOf(playerId)];
  const local = match.players[playerId];
  return `
    <header class="top-hud duel-hud">
      <div class="side-health self-side">
        <div class="player-label self">己方</div>
        ${renderHealth(local.health, "self")}
      </div>
      <div class="timer-stack">
        <div class="timer">${formatTime(timeLeftMs(match))}</div>
        <div class="input-state">${inputStatus}</div>
      </div>
      <div class="side-health enemy-side">
        <div class="player-label enemy">${playMode === "online" ? "对手" : "电脑"}</div>
        ${renderHealth(remote.health, "enemy")}
      </div>
    </header>
  `;
}

function renderBottomBar(match: MatchState, playerId: PlayerId): string {
  const ready = castCooldownProgress(match, playerId);
  const pct = Math.round(ready * 100);
  const tutorialHot =
    playMode === "tutorial" && match.status === "running" && ((tutorialStep === 1 && !tutorialCastDone) || (tutorialStep === 2 && !tutorialBlockDone))
      ? " spell-cd-hot"
      : "";

  return `
    <footer class="bottom-hud">
      <div class="gyro-row">
        <button class="gyro-button" data-action="gyro">${swing.isActive() ? "挥动开" : "启体感"}</button>
        <div class="status-line compact">${match.recentText || "施法 · 挥动格挡反弹"}</div>
      </div>
      <div class="cooldowns single-cast">
        <button class="spell-cd cast-button${tutorialHot}" data-action="cast" style="--p:${pct}%; --c:#41c7ff">
          <em class="spell-dir">随机元素</em>
          <span>施法</span>
        </button>
      </div>
    </footer>
  `;
}

function renderResult(match: MatchState, playerId: PlayerId): string {
  const result = match.winnerId === "draw" ? "平局" : match.winnerId === playerId ? "胜利" : "败北";
  return `
    <section class="panel result-panel">
      <div class="result-title">${result}</div>
      <div class="status-line">命中 ${match.players[playerId].hits} · 对手命中 ${match.players[opponentOf(playerId)].hits}</div>
      <button class="primary" data-action="rematch">再来一局</button>
      <button data-action="back-home">返回首页</button>
    </section>
  `;
}

function renderHealth(value: number, tone: "self" | "enemy"): string {
  return `
    <div class="health ${tone}">
      <span style="width:${Math.max(0, value)}%"></span>
      <b>${Math.max(0, value)}</b>
    </div>
  `;
}

function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === "p1" ? "p2" : "p1";
}

function formatTime(ms: number): string {
  return `${Math.ceil(ms / 1000).toString().padStart(2, "0")}`;
}

function startLocalMatch(mode: Exclude<PlayMode, "online">): void {
  playMode = mode;
  roomCode = "";
  client.disconnect();
  localPlayerId = "p1";
  resetBattle(state, Date.now());
  state.players.p1.connected = true;
  state.players.p2.connected = true;
  state.players.p1.ready = true;
  state.players.p2.ready = true;
  aiBlockAttemptAt = 0;
  aiNextCastAt = Date.now() + 1200 + nextAttackDelay();
  tutorialStep = mode === "tutorial" ? 1 : 0;
  tutorialHint = mode === "tutorial" ? "教程：点「施法」发出随机元素技能" : "";
  tutorialNextEnemyAt = Date.now() + 1200 + nextAttackDelay(1800);
  tutorialCastDone = false;
  tutorialBlockDone = false;
  resetSfxTrackers();
  startCountdown(state, Date.now() + 1200);
  render(true);
}

function returnHome(): void {
  playMode = "online";
  roomCode = "";
  client.disconnect();
  localPlayerId = "p1";
  swing.stop();
  Object.assign(state, createMatchState(Date.now()));
  tutorialHint = "";
  errorText = "";
  blockFlashUntil = 0;
  inputStatus = swingSupportMessage();
  lastMatchStatus = state.status;
  resetSfxTrackers();
  stopBgm();
  render(true);
}

function ensureOnlineConnection(): void {
  if (!onlineAvailable) return;
  client.connect();
}

function castLocalPlayerSpell(): void {
  if (playMode === "online") {
    ensureOnlineConnection();
    client.castRandomSpell();
    return;
  }
  const now = Date.now();
  const didCast = castRandomSpell(state, localPlayerId, now);
  if (!didCast) {
    inputStatus = state.recentText;
    render(true);
    return;
  }
  playSfx("cast");
  if (playMode === "tutorial" && tutorialStep === 1) tutorialCastDone = true;
  render(true);
}

function runLocalOpponent(now: number): void {
  if (playMode === "online" || state.status !== "running") return;
  if (playMode === "tutorial") {
    runTutorialOpponent(now);
    return;
  }
  if (now < aiNextCastAt || hasLiveProjectiles(state)) return;
  castRandomSpell(state, "p2", now);
  playSfx("castEnemy");
  aiNextCastAt = now + nextAttackDelay();
  render(true);
}

function runTutorialOpponent(now: number): void {
  if (tutorialStep === 1) {
    tutorialHint = tutorialCastDone
      ? "很好！等电脑出招后挥动手机格挡，技能会反弹并越来越快"
      : "教程：点「施法」发出随机元素技能";
    if (tutorialCastDone) {
      tutorialStep = 2;
      tutorialNextEnemyAt = now + nextAttackDelay(1200);
    }
    return;
  }
  if (tutorialStep === 2) {
    tutorialHint = tutorialBlockDone
      ? "学会了。接下来自由对打，格挡可以无限反弹"
      : "教程：电脑技能飞来时挥动格挡";
    if (now >= tutorialNextEnemyAt && !hasLiveProjectiles(state)) {
      castRandomSpell(state, "p2", now);
      playSfx("castEnemy");
      tutorialNextEnemyAt = now + nextAttackDelay(2200);
    }
    if (tutorialBlockDone) {
      tutorialStep = 3;
      aiNextCastAt = now + nextAttackDelay();
    }
    return;
  }
  tutorialHint = "自由对打：相撞会抵消，格挡会反弹加速";
  if (now < aiNextCastAt || hasLiveProjectiles(state)) return;
  castRandomSpell(state, "p2", now);
  playSfx("castEnemy");
  aiNextCastAt = now + nextAttackDelay();
}

function runAiBlock(now: number): void {
  if (playMode === "online" || state.status !== "running") return;
  if (!hasBlockableProjectile(state, "p2")) return;
  if (now < aiBlockAttemptAt) return;

  aiBlockAttemptAt = now + AI_BLOCK_ATTEMPT_INTERVAL_MS;
  const result = tryBlock(state, "p2", now, { successRate: AI_BLOCK_SUCCESS_RATE });
  if (result.blocked) {
    playSfx("block", { blockCount: result.blockCount ?? 1 }, 0.75);
    render(true);
  }
}

function renderTutorialCard(): string {
  return `
    <section class="tutorial-card">
      <b>新手教程</b>
      <span>${tutorialHint}</span>
    </section>
  `;
}

function syncSwingWithMatch(): void {
  if (lastMatchStatus === state.status) return;

  if (state.status === "running" && swing.supported && !swing.isActive()) {
    inputStatus = window.isSecureContext
      ? "战斗开始，点「启体感」后挥动手机格挡"
      : "请用 https://电脑IP:5173 打开以启用挥动格挡";
    render(true);
  }
  if (state.status === "finished" && swing.isActive()) {
    swing.stop();
    inputStatus = "战斗结束，挥动检测已关闭";
    render(true);
  }

  lastMatchStatus = state.status;
}

async function startSwingFromGesture(): Promise<void> {
  if (!swing.supported) {
    inputStatus = swingSupportMessage();
    render(true);
    return;
  }
  warmUpFeedback();
  const started = await swing.start();
  if (started) warmUpFeedback();
}

function makeRenderKey(): string {
  const castReady = Math.round(castCooldownProgress(state, localPlayerId) * 10);
  return [
    playMode,
    state.status,
    Math.ceil((state.countdownEndsAtMs - state.nowMs) / 1000),
    roomCode,
    networkStatus,
    inputStatus,
    errorText,
    state.players.p1.health,
    state.players.p2.health,
    state.players.p1.ready,
    state.players.p2.ready,
    state.players.p2.connected,
    state.winnerId,
    Math.ceil(timeLeftMs(state) / 1000),
    state.recentText,
    tutorialStep,
    tutorialHint,
    castReady,
    tutorialCastDone,
    tutorialBlockDone,
    swing.isActive(),
    blockFlashUntil
  ].join("|");
}
