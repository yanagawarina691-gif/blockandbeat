import { pickRandomSpellId } from "../shared/spells";
import type { PlayerId, SpellId } from "../shared/types";

export type ServerMessage =
  | { type: "connected"; serverTime: number }
  | { type: "roomCreated"; roomCode: string; playerId: PlayerId }
  | { type: "roomJoined"; roomCode: string; playerId: PlayerId }
  | { type: "roomState"; roomCode: string; players: Array<{ playerId: PlayerId; ready: boolean; connected: boolean }> }
  | { type: "matchStart"; startsAt: number; seed: number }
  | { type: "spellCast"; playerId: PlayerId; spellId: SpellId; clientCastAt: number; serverCastAt: number }
  | { type: "playerDisconnected"; playerId: PlayerId }
  | { type: "rematch" }
  | { type: "error"; message: string };

type Listener = (message: ServerMessage) => void;

export class MatchClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(status: string) => void>();

  connect(url = defaultWsUrl()): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.emitStatus("连接中");
    this.ws = new WebSocket(url);
    this.ws.addEventListener("open", () => this.emitStatus("已连接"));
    this.ws.addEventListener("close", () => this.emitStatus("已断开"));
    this.ws.addEventListener("error", () => this.emitStatus("连接错误"));
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      for (const listener of this.listeners) listener(message);
    });
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
    this.send({ type: "castSpell", spellId, clientCastAt: Date.now() });
  }

  castRandomSpell(): void {
    this.castSpell(pickRandomSpellId());
  }

  rematch(): void {
    this.send({ type: "rematch" });
  }

  private send(message: object): void {
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
  return `${protocol}://${location.hostname}:8787`;
}
