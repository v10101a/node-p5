// Single-process dev/prod server: serves the app and relays Yjs updates over websockets.
//   npm run dev    -> Vite dev server (with HMR) + Yjs relay on the same port
//   npm start      -> serves ./dist + Yjs relay
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const PORT = Number(process.env.PORT || 5173);
const PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || './data';

// ---------- Yjs rooms ----------
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

/** @type {Map<string, {doc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Map<any, Set<number>>, saveTimer: any}>} */
const rooms = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });

function roomFile(name) {
  return `${DATA_DIR}/${encodeURIComponent(name)}.bin`;
}

function getRoom(name) {
  let room = rooms.get(name);
  if (room) return room;
  const doc = new Y.Doc();
  // crude persistence: snapshot the doc to disk (debounced)
  try {
    const f = roomFile(name);
    if (fs.existsSync(f)) Y.applyUpdate(doc, fs.readFileSync(f));
  } catch (e) {
    console.warn('could not load room', name, e);
  }
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  room = { doc, awareness, conns: new Map(), saveTimer: null };
  rooms.set(name, room);

  doc.on('update', (update, origin) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    for (const conn of room.conns.keys()) if (conn !== origin) send(conn, msg);
    clearTimeout(room.saveTimer);
    room.saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(roomFile(name), Y.encodeStateAsUpdate(doc));
      } catch (e) {
        console.warn('save failed', e);
      }
    }, 800);
  });

  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    if (origin && room.conns.has(origin)) {
      const ids = room.conns.get(origin);
      added.forEach((id) => ids.add(id));
      removed.forEach((id) => ids.delete(id));
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    const msg = encoding.toUint8Array(enc);
    for (const conn of room.conns.keys()) send(conn, msg);
  });
  return room;
}

function send(conn, msg) {
  if (conn.readyState !== 1) return;
  try {
    conn.send(msg, (err) => err && conn.close());
  } catch {
    conn.close();
  }
}

function onConnection(conn, roomName) {
  const room = getRoom(roomName);
  console.log(`  + client joined #${roomName} (${room.conns.size + 1} online)`);
  room.conns.set(conn, new Set());
  conn.binaryType = 'arraybuffer';
  conn.on('message', (data) => {
    try {
      const dec = decoding.createDecoder(new Uint8Array(data));
      const enc = encoding.createEncoder();
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC) {
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(dec, enc, room.doc, conn);
        if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc));
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(dec), conn);
      }
    } catch (e) {
      console.error(e);
    }
  });
  const close = () => {
    const ids = room.conns.get(conn);
    room.conns.delete(conn);
    if (ids) awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(ids), null);
    conn.close();
  };
  conn.on('close', close);
  conn.on('error', close);

  // initial sync step 1 + current awareness
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(conn, encoding.toUint8Array(enc));
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const enc2 = encoding.createEncoder();
    encoding.writeVarUint(enc2, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc2, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
    send(conn, encoding.toUint8Array(enc2));
  }
}

// ---------- HTTP ----------
async function main() {
  let handler;
  if (PROD) {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    handler = (req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = path.join('dist', path.normalize(decodeURIComponent(url.pathname)));
      if (!file.startsWith('dist') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = 'dist/index.html';
      res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    };
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, hmr: { port: PORT + 1 } }, appType: 'spa' });
    handler = (req, res) => vite.middlewares(req, res, () => { res.statusCode = 404; res.end('not found'); });
  }
  const server = http.createServer(handler);
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/yjs/')) return; // let others (e.g. vite hmr) handle
    const room = decodeURIComponent(url.pathname.slice('/yjs/'.length)) || 'lobby';
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, room));
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  patch  →  http://localhost:${PORT}   (${PROD ? 'production' : 'dev'})\n`);
  });
}
main();
