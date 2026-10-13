import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

async function receive(client, type) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const index = client.messages.findIndex(message => message.type === type);
    if (index !== -1) return client.messages.splice(index, 1)[0];
    await delay(10);
  }
  throw new Error(`timed out waiting for ${type}`);
}

test('two-player rooms reject replacement, recover empty slots and survive malformed messages', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['server/server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.ws.terminate();
    if (child.exitCode === null) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/ws:\/\/localhost:\d+/);
      if (match) resolve(match[0]);
    });
  });
  async function connect() {
    const client = { ws: new WebSocket(url), messages: [] };
    clients.push(client);
    client.ws.on('message', raw => client.messages.push(JSON.parse(raw.toString())));
    await once(client.ws, 'open');
    await receive(client, 'connected');
    return client;
  }
  const send = (client, message) => client.ws.send(JSON.stringify(message));
  const host = await connect();
  send(host, { type: 'createRoom' });
  const { roomCode } = await receive(host, 'roomCreated');
  const guest = await connect();
  send(guest, { type: 'joinRoom', roomCode });
  assert.equal((await receive(guest, 'roomJoined')).playerId, 'p2');

  const third = await connect();
  send(third, { type: 'joinRoom', roomCode });
  assert.match((await receive(third, 'error')).message, /房间已满/);
  const thirdClosed = once(third.ws, 'close');
  third.ws.close();
  await thirdClosed;

  send(guest, { type: 'joinRoom', roomCode });
  assert.match((await receive(guest, 'error')).message, /已在房间/);
  send(guest, { type: 'createRoom' });
  assert.match((await receive(guest, 'error')).message, /已在房间/);
  send(host, { type: 'ready', ready: true });
  send(guest, { type: 'ready', ready: true });
  await receive(host, 'matchStart');
  await receive(guest, 'matchStart');
  send(guest, { type: 'castSpell', spellId: 'fireball' });
  assert.equal((await receive(host, 'spellCast')).playerId, 'p2');

  for (const message of [null, [], 42, 'bad']) {
    send(guest, message);
    await receive(guest, 'error');
  }
  guest.ws.send('{');
  await receive(guest, 'error');
  send(guest, { type: 'rematch' });
  await receive(host, 'rematch');
  await receive(guest, 'rematch');

  const guestClosed = once(guest.ws, 'close');
  guest.ws.close();
  await guestClosed;
  await receive(host, 'playerDisconnected');
  const replacement = await connect();
  send(replacement, { type: 'joinRoom', roomCode });
  assert.equal((await receive(replacement, 'roomJoined')).playerId, 'p2');
  send(host, { type: 'ready', ready: true });
  send(replacement, { type: 'ready', ready: true });
  await receive(host, 'matchStart');
  await receive(replacement, 'matchStart');
});
