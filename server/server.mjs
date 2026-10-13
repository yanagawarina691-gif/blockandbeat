import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port });
const rooms = new Map();
const spellIds = new Set(["fireball", "waterball", "vine", "thunder", "rockshield", "windblade"]);

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? makeCode() : code;
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room, message) {
  for (const client of room.clients.values()) send(client.ws, message);
}

function roomState(room) {
  return {
    type: "roomState",
    roomCode: room.code,
    players: [...room.clients.values()].map((client) => ({
      playerId: client.playerId,
      ready: client.ready,
      connected: true
    }))
  };
}

function attach(ws, room, playerId) {
  room.clients.set(playerId, { ws, playerId, ready: false });
  ws.roomCode = room.code;
  ws.playerId = playerId;
}

function handleCreate(ws) {
  if (ws.roomCode) {
    send(ws, { type: "error", message: "已在房间中，请断开后再创建房间" });
    return;
  }
  const code = makeCode();
  const room = {
    code,
    clients: new Map(),
    started: false
  };
  rooms.set(code, room);
  attach(ws, room, "p1");
  send(ws, { type: "roomCreated", roomCode: code, playerId: "p1" });
  broadcast(room, roomState(room));
}

function handleJoin(ws, roomCode) {
  if (ws.roomCode) {
    send(ws, { type: "error", message: "已在房间中，请断开后再加入房间" });
    return;
  }
  const room = rooms.get(String(roomCode || "").toUpperCase());
  if (!room) {
    send(ws, { type: "error", message: "房间不存在" });
    return;
  }
  if (room.clients.size >= 2) {
    send(ws, { type: "error", message: "房间已满" });
    return;
  }
  const playerId = room.clients.has("p1") ? "p2" : "p1";
  attach(ws, room, playerId);
  send(ws, { type: "roomJoined", roomCode: room.code, playerId });
  broadcast(room, roomState(room));
}

function handleReady(ws, ready) {
  const room = rooms.get(ws.roomCode);
  const client = room?.clients.get(ws.playerId);
  if (!room || !client || client.ws !== ws) return;
  client.ready = Boolean(ready);
  broadcast(room, roomState(room));
  if (!room.started && room.clients.size === 2 && [...room.clients.values()].every((player) => player.ready)) {
    room.started = true;
    broadcast(room, { type: "matchStart", startsAt: Date.now() + 1800, seed: Math.floor(Math.random() * 1_000_000) });
  }
}

function handleCast(ws, spellId, clientCastAt) {
  const room = rooms.get(ws.roomCode);
  if (!room || room.clients.get(ws.playerId)?.ws !== ws || !room.started || !spellIds.has(spellId)) return;
  broadcast(room, {
    type: "spellCast",
    playerId: ws.playerId,
    spellId,
    clientCastAt: Number(clientCastAt || Date.now()),
    serverCastAt: Date.now()
  });
}

function handleRematch(ws) {
  const room = rooms.get(ws.roomCode);
  const client = room?.clients.get(ws.playerId);
  if (!room || !client || client.ws !== ws) return;
  for (const player of room.clients.values()) player.ready = false;
  room.started = false;
  broadcast(room, { type: "rematch" });
  broadcast(room, roomState(room));
}

wss.on("connection", (ws) => {
  send(ws, { type: "connected", serverTime: Date.now() });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "消息格式无效" });
      return;
    }

    if (!message || typeof message !== "object" || Array.isArray(message)) {
      send(ws, { type: "error", message: "消息必须为 JSON 对象" });
      return;
    }

    if (message.type === "createRoom") handleCreate(ws);
    if (message.type === "joinRoom") handleJoin(ws, message.roomCode);
    if (message.type === "ready") handleReady(ws, message.ready);
    if (message.type === "castSpell") handleCast(ws, message.spellId, message.clientCastAt);
    if (message.type === "rematch") handleRematch(ws);
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomCode);
    if (!room || room.clients.get(ws.playerId)?.ws !== ws) return;
    room.clients.delete(ws.playerId);
    room.started = false;
    for (const player of room.clients.values()) player.ready = false;
    broadcast(room, { type: "playerDisconnected", playerId: ws.playerId });
    if (room.clients.size === 0) rooms.delete(room.code);
    else broadcast(room, roomState(room));
  });
});

wss.on("listening", () => {
  console.log(`Block & Beat realtime server listening on ws://localhost:${wss.address().port}`);
});
