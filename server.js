// KoRSaN PaNeL – Bağlayıcı Sunucu
import http from "http";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

const PORT = process.env.PORT || 10000;
const BUFFER_SIZE = 500;
const IDLE_CLOSE_MS = 10 * 60 * 1000;

const rooms = new Map();

function pushEvent(room, ev) {
  ev.id = ++room.seq;
  ev.ts = ev.ts || Date.now();
  room.buffer.push(ev);
  if (room.buffer.length > BUFFER_SIZE) room.buffer.shift();
  const msg = JSON.stringify(ev);
  for (const ws of room.clients) if (ws.readyState === 1) ws.send(msg);
}

function status(room, text) {
  const msg = JSON.stringify({ type: "status", message: text, ts: Date.now() });
  for (const ws of room.clients) if (ws.readyState === 1) ws.send(msg);
}

function userOf(d) {
  const u = d.user || d;
  const user = u.displayId || u.uniqueId || (u.id ? String(u.id) : "") || u.nickname || "izleyici";
  const nickname = u.nickname || u.displayId || u.uniqueId || user;
  return { user, nickname };
}

function openRoom(uniqueId) {
  let room = rooms.get(uniqueId);
  if (room) return room;
  room = { conn: null, buffer: [], seq: 0, clients: new Set(), idleTimer: null, connected: false, retry: 0 };
  rooms.set(uniqueId, room);
  connectTikTok(uniqueId, room);
  return room;
}

function connectTikTok(uniqueId, room) {
  const conn = new TikTokLiveConnection(uniqueId, {
    enableExtendedGiftInfo: false,
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
  });
  room.conn = conn;

  // Sohbet (content, comment veya text alanlarını eksiksiz okur)
  conn.on(WebcastEvent.CHAT, (d) => {
    const text = d.content ?? d.comment ?? d.text ?? "";
    pushEvent(room, { type: "chat", ...userOf(d), text: String(text) });
  });

  // Beğeni (count veya likeCount)
  conn.on(WebcastEvent.LIKE, (d) => {
    const count = Number(d.count ?? d.likeCount ?? 1) || 1;
    pushEvent(room, { type: "like", ...userOf(d), count });
  });

  // Giriş
  conn.on(WebcastEvent.MEMBER, (d) => pushEvent(room, { type: "member", ...userOf(d) }));

  // Hediyeler
  conn.on(WebcastEvent.GIFT, (d) => {
    const giftName = d.giftName || d.gift?.name || d.describe || "Hediye";
    const giftCount = Number(d.repeatCount ?? d.giftCount ?? d.count ?? 1) || 1;
    const diamonds = (Number(d.diamondCount) || 0) * giftCount;
    pushEvent(room, { type: "gift", ...userOf(d), giftName, giftCount, diamonds });
  });

  conn.on(WebcastEvent.STREAM_END, () => status(room, "Yayın sona erdi"));
  conn.on(ControlEvent.DISCONNECTED, () => {
    room.connected = false;
    if (!rooms.has(uniqueId)) return;
    status(room, "TikTok bağlantısı koptu — yeniden bağlanılıyor…");
    const wait = Math.min(30000, 3000 * ++room.retry);
    setTimeout(() => rooms.get(uniqueId) === room && connectTikTok(uniqueId, room), wait);
  });

  conn
    .connect()
    .then(() => {
      room.connected = true;
      room.retry = 0;
      status(room, `@${uniqueId} yayınına bağlanıldı`);
    })
    .catch((err) => {
      status(room, "Bağlanılamadı: " + (err?.message || err));
      closeRoom(uniqueId);
    });
}

function closeRoom(uniqueId) {
  const room = rooms.get(uniqueId);
  if (!room) return;
  rooms.delete(uniqueId);
  clearTimeout(room.idleTimer);
  try { room.conn?.disconnect(); } catch {}
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("KoRSaN PaNeL sunucusu çalışıyor. Aktif yayın: " + rooms.size);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let roomId = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.action === "ping") return ws.send(JSON.stringify({ type: "pong" }));

    if (msg.action === "start" && msg.uniqueId) {
      const id = String(msg.uniqueId).replace(/^@/, "").trim().toLowerCase();
      if (roomId && roomId !== id) rooms.get(roomId)?.clients.delete(ws);
      roomId = id;
      const room = openRoom(id);
      clearTimeout(room.idleTimer);
      room.clients.add(ws);

      const since = Number(msg.since) || 0;
      const missed = since > 0 ? room.buffer.filter((e) => e.id > since) : room.buffer.slice(-200);
      if (missed.length) ws.send(JSON.stringify({ type: "history", events: missed }));
      ws.send(JSON.stringify({
        type: "status",
        message: room.connected
          ? `@${id} yayınına bağlı${since && missed.length ? ` — ${missed.length} kaçan olay geri alındı` : ""}`
          : `@${id} yayınına bağlanılıyor…`,
        ts: Date.now(),
      }));
    }
  });

  ws.on("close", () => {
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.clients.delete(ws);
    if (room.clients.size === 0) {
      const id = roomId;
      room.idleTimer = setTimeout(() => closeRoom(id), IDLE_CLOSE_MS);
    }
  });
});

server.listen(PORT, () => console.log("KoRSaN PaNeL sunucusu port " + PORT));

