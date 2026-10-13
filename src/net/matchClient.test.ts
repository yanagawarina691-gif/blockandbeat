import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchClient } from "./matchClient";

class Socket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  readyState = 0;
  sent: object[] = [];
  static instances: Socket[] = [];
  constructor(_url: string) {
    super();
    Socket.instances.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  Socket.instances = [];
});
describe("match connection lifecycle", () => {
  it("sends the first room action only after the connection opens", () => {
    vi.stubGlobal("WebSocket", Socket);
    const client = new MatchClient();
    client.connect("ws://local");
    client.createRoom();
    const socket = Socket.instances[0];
    expect(socket.sent).toEqual([]);
    socket.open();
    expect(socket.sent).toEqual([{ type: "createRoom" }]);
    client.disconnect();
    expect(socket.sent.at(-1)).toEqual({ type: "leaveRoom" });
  });
  it("discards queued actions and events from an abandoned connection", () => {
    vi.stubGlobal("WebSocket", Socket);
    const client = new MatchClient();
    const messages = vi.fn();
    client.onMessage(messages);
    client.connect("ws://local");
    client.createRoom();
    const old = Socket.instances[0];
    client.disconnect();
    client.connect("ws://local");
    const current = Socket.instances[1];
    old.open();
    old.dispatchEvent(
      new MessageEvent("message", { data: '{"type":"rematch"}' }),
    );
    current.open();
    expect(old.sent).toEqual([]);
    expect(current.sent).toEqual([]);
    expect(messages).not.toHaveBeenCalled();
  });
});
