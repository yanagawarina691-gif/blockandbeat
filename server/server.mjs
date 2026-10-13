import { WebSocketServer } from "ws";
import {
  createMatchState,
  startCountdown,
  resetBattle,
  tickMatch,
  castSpell,
  tryBlock,
} from "../.server-build/simulation.js";
import { SPELLS } from "../.server-build/spells.js";

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port, maxPayload: 16 * 1024 });
const rooms = new Map();

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1)
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? makeCode() : code;
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room, message) {
  for (const client of room.clients.values()) send(client.ws, message);
}

function snapshot(room) {
  broadcast(room, { type: "matchSnapshot", state: room.state });
}

function broadcastRoom(room) {
  broadcast(room, {
    type: "roomState",
    roomCode: room.code,
    players: Object.values(room.state.players).map((player) => ({
      playerId: player.id,
      ready: player.ready,
      connected: player.connected,
    })),
  });
  snapshot(room);
}

function attach(ws, room, playerId) {
  room.clients.set(playerId, { ws, playerId });
  ws.roomCode = room.code;
  ws.playerId = playerId;
  room.state.players[playerId].connected = true;
  room.state.players[playerId].ready = false;
}

function currentRoom(ws) {
  const room = rooms.get(ws.roomCode);
  return room?.clients.get(ws.playerId)?.ws === ws ? room : null;
}

function leaveRoom(ws) {
  const room = currentRoom(ws);
  if (!room) return;
  const playerId = ws.playerId;
  room.clients.delete(playerId);
  ws.roomCode = undefined;
  ws.playerId = undefined;
  resetBattle(room.state, Date.now());
  for (const player of Object.values(room.state.players)) {
    player.ready = false;
    player.connected = room.clients.has(player.id);
  }
  broadcast(room, { type: "playerDisconnected", playerId });
  if (room.clients.size === 0) rooms.delete(room.code);
  else broadcastRoom(room);
}

function handleCreate(ws) {
  if (ws.roomCode)
    return send(ws, { type: "error", message: "已在房间中，请先退出房间" });
  const room = {
    code: makeCode(),
    clients: new Map(),
    state: createMatchState(Date.now()),
    lastTickAt: Date.now(),
  };
  rooms.set(room.code, room);
  attach(ws, room, "p1");
  send(ws, { type: "roomCreated", roomCode: room.code, playerId: "p1" });
  broadcastRoom(room);
}

function handleJoin(ws, roomCode) {
  if (ws.roomCode)
    return send(ws, { type: "error", message: "已在房间中，请先退出房间" });
  const room =
    typeof roomCode === "string" ? rooms.get(roomCode.toUpperCase()) : null;
  if (!room) return send(ws, { type: "error", message: "房间不存在" });
  if (room.clients.size >= 2)
    return send(ws, { type: "error", message: "房间已满" });
  const playerId = room.clients.has("p1") ? "p2" : "p1";
  attach(ws, room, playerId);
  send(ws, { type: "roomJoined", roomCode: room.code, playerId });
  broadcastRoom(room);
}

function handleReady(ws, ready) {
  const room = currentRoom(ws);
  if (!room || room.state.status !== "lobby" || typeof ready !== "boolean")
    return;
  room.state.players[ws.playerId].ready = ready;
  if (
    room.clients.size === 2 &&
    Object.values(room.state.players).every((player) => player.ready)
  ) {
    const startsAt = Date.now() + 1800;
    startCountdown(room.state, startsAt);
    room.lastTickAt = Date.now();
    broadcast(room, { type: "matchStart", startsAt });
  }
  broadcastRoom(room);
}

function advance(room, now = Date.now()) {
  tickMatch(room.state, Math.min(50, Math.max(0, now - room.lastTickAt)), now);
  room.lastTickAt = now;
}

function handleCast(ws, spellId) {
  const room = currentRoom(ws);
  if (!room || typeof spellId !== "string" || !Object.hasOwn(SPELLS, spellId))
    return;
  advance(room);
  if (!castSpell(room.state, ws.playerId, spellId, room.state.nowMs)) return;
  snapshot(room);
  broadcast(room, { type: "spellCast", playerId: ws.playerId, spellId });
}

function handleBlock(ws) {
  const room = currentRoom(ws);
  if (!room) return;
  advance(room);
  const result = tryBlock(room.state, ws.playerId, room.state.nowMs);
  snapshot(room);
  send(ws, { type: "blockResult", ...result });
}

function handleRematch(ws) {
  const room = currentRoom(ws);
  if (!room || room.state.status !== "finished") return;
  resetBattle(room.state, Date.now());
  for (const player of Object.values(room.state.players)) player.ready = false;
  broadcast(room, { type: "rematch" });
  broadcastRoom(room);
}

wss.on("connection", (ws) => {
  send(ws, { type: "connected", serverTime: Date.now() });
  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "消息格式无效" });
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return send(ws, { type: "error", message: "消息必须为 JSON 对象" });
    }
    switch (message.type) {
      case "createRoom":
        return handleCreate(ws);
      case "joinRoom":
        return handleJoin(ws, message.roomCode);
      case "leaveRoom":
        leaveRoom(ws);
        return send(ws, { type: "roomLeft" });
      case "ready":
        return handleReady(ws, message.ready);
      case "castSpell":
        return handleCast(ws, message.spellId);
      case "block":
        return handleBlock(ws);
      case "rematch":
        return handleRematch(ws);
    }
  });
  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => leaveRoom(ws));
});

const ticker = setInterval(() => {
  for (const room of rooms.values()) {
    if (room.state.status !== "countdown" && room.state.status !== "running")
      continue;
    advance(room);
    snapshot(room);
  }
}, 50);
wss.on("close", () => clearInterval(ticker));
wss.on("listening", () => {
  console.log(
    `Block & Beat realtime server listening on ws://localhost:${wss.address().port}`,
  );
});
