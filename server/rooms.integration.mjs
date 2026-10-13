import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

async function receive(client, type, predicate = () => true) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const index = client.messages.findIndex(message => message.type === type && predicate(message));
    if (index !== -1) return client.messages.splice(index, 1)[0];
    await delay(10);
  }
  throw new Error(`timed out waiting for ${type}`);
}

test('two-player rooms reject replacement, recover empty slots and survive malformed messages', { timeout: 30000 }, async (t) => {
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
  await receive(host, 'matchSnapshot', m => m.state.status === 'running');
  send(guest, { type: 'castSpell', spellId: 'fireball' });
  assert.equal((await receive(host, 'spellCast')).playerId, 'p2');
  await receive(host, 'matchSnapshot', m => m.state.projectiles.some(p => p.direction === -1 && p.x <= 100 && p.x > 56));
  send(host, { type: 'block' });
  assert.equal((await receive(host, 'blockResult')).blocked, true);
  const reflected = await receive(host, 'matchSnapshot', m => m.state.projectiles.some(p => p.blockCount === 1));
  const remoteReflected = await receive(guest, 'matchSnapshot', m => m.state.nowMs === reflected.state.nowMs && m.state.projectiles.some(p => p.blockCount === 1));
  assert.deepEqual(remoteReflected.state, reflected.state);
  assert.equal(reflected.state.projectiles[0].ownerId, 'p1');
  await receive(host, 'matchSnapshot', m => m.state.players.p2.health === 88);

  // The server ignores forged state and enforces cooldowns itself.
  send(guest, { type: 'matchSnapshot', state: { winnerId: 'p2' } });
  for (let hit = 0; hit < 8; hit++) {
    await receive(host, 'matchSnapshot', m => m.state.status === 'running' && m.state.castReadyAt.p1 <= m.state.nowMs && m.state.projectiles.length === 0);
    for (let spam = 0; spam < 3; spam++) send(host, { type: 'castSpell', spellId: 'fireball' });
    await receive(host, 'matchSnapshot', m => m.state.players.p2.health <= Math.max(0, 88 - (hit + 1) * 12));
    host.messages = host.messages.filter(m => m.type !== 'matchSnapshot');
  }
  const finished = await receive(guest, 'matchSnapshot', m => m.state.status === 'finished');
  assert.equal(finished.state.winnerId, 'p1');
  assert.equal(finished.state.players.p1.health, 100);
  assert.equal(finished.state.players.p1.hits, 9);

  for (const message of [null, [], 42, 'bad']) {
    send(guest, message);
    await receive(guest, 'error');
  }
  guest.ws.send('{');
  await receive(guest, 'error');
  send(guest, { type: 'rematch' });
  await receive(host, 'rematch');
  await receive(guest, 'rematch');

  send(guest, { type: 'leaveRoom' });
  await receive(guest, 'roomLeft');
  await receive(host, 'playerDisconnected');
  // The same socket can create another room immediately after leaving.
  send(guest, { type: 'createRoom' });
  await receive(guest, 'roomCreated');
  send(guest, { type: 'leaveRoom' });
  await receive(guest, 'roomLeft');
  const replacement = await connect();
  send(replacement, { type: 'joinRoom', roomCode });
  assert.equal((await receive(replacement, 'roomJoined')).playerId, 'p2');
  send(host, { type: 'ready', ready: true });
  send(replacement, { type: 'ready', ready: true });
  await receive(host, 'matchStart');
  await receive(replacement, 'matchStart');
});
