import { pickRandomSpellId } from "../shared/spells";
import type { MatchState, PlayerId, SpellId } from "../shared/types";

export type ServerMessage =
  | { type: "connected"; serverTime: number }
  | { type: "roomCreated"; roomCode: string; playerId: PlayerId }
  | { type: "roomJoined"; roomCode: string; playerId: PlayerId }
  | {
      type: "roomState";
      roomCode: string;
      players: Array<{
        playerId: PlayerId;
        ready: boolean;
        connected: boolean;
      }>;
    }
  | { type: "matchStart"; startsAt: number }
  | { type: "matchSnapshot"; state: MatchState }
  | { type: "roomLeft" }
  | {
      type: "blockResult";
      blocked: boolean;
      spellName?: string;
      reason?: string;
      blockCount?: number;
    }
  | { type: "spellCast"; playerId: PlayerId; spellId: SpellId }
  | { type: "playerDisconnected"; playerId: PlayerId }
  | { type: "rematch" }
  | { type: "error"; message: string };

type Listener = (message: ServerMessage) => void;

export class MatchClient {
  private ws: WebSocket | null = null;
  private pending: object[] = [];
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(status: string) => void>();

  connect(url = defaultWsUrl()): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.emitStatus("连接中");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      if (this.ws !== ws) return;
      this.emitStatus("已连接");
      for (const message of this.pending.splice(0)) this.send(message);
    });
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.pending = [];
      this.emitStatus("已断开");
    });
    ws.addEventListener("error", () => {
      if (this.ws === ws) this.emitStatus("连接错误");
    });
    ws.addEventListener("message", (event) => {
      if (this.ws !== ws) return;
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        if (
          !message ||
          typeof message !== "object" ||
          typeof message.type !== "string"
        )
          return;
        for (const listener of this.listeners) listener(message);
      } catch {
        this.emitStatus("收到无效消息");
      }
    });
  }

  disconnect(): void {
    const ws = this.ws;
    this.ws = null;
    this.pending = [];
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "leaveRoom" }));
    ws?.close();
    this.emitStatus("未连接");
  }

  block(): void {
    this.send({ type: "block" });
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: (status: string) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  createRoom(): void {
    this.send({ type: "createRoom" });
  }

  joinRoom(roomCode: string): void {
    this.send({ type: "joinRoom", roomCode: roomCode.trim().toUpperCase() });
  }

  ready(ready: boolean): void {
    this.send({ type: "ready", ready });
  }

  castSpell(spellId: SpellId): void {
    this.send({ type: "castSpell", spellId });
  }

  castRandomSpell(): void {
    this.castSpell(pickRandomSpellId());
  }

  rematch(): void {
    this.send({ type: "rematch" });
  }

  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      if (this.pending.length < 16) this.pending.push(message);
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emitStatus("未连接");
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private emitStatus(status: string): void {
    for (const listener of this.statusListeners) listener(status);
  }
}

function defaultWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
}
