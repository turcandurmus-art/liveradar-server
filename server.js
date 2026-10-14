import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";

const wss = new WebSocketServer({ port: process.env.PORT || 8081 });
wss.on("connection", (ws) => {
  let conn;
  const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify({ ts: Date.now(), ...o }));
  const u = (d) => ({ user: d.user?.uniqueId ?? d.uniqueId, nickname: d.user?.nickname ?? d.nickname });
  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw);
    if (msg.action !== "start") return;
    conn = new TikTokLiveConnection(msg.uniqueId);
    conn.on(WebcastEvent.CHAT, (d) => send({ type: "chat", ...u(d), text: d.comment }));
    conn.on(WebcastEvent.MEMBER, (d) => send({ type: "member", ...u(d) }));
    conn.on(WebcastEvent.LIKE, (d) => send({ type: "like", ...u(d), count: d.likeCount ?? 1 }));
    try { await conn.connect(); send({ type: "status", message: `@${msg.uniqueId} yayınına bağlanıldı` }); }
    catch (e) { send({ type: "status", message: "Hata: " + (e?.message ?? e) }); }
  });
  ws.on("close", () => conn?.disconnect());
});
console.log("LiveRadar server ready");
