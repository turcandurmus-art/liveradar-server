// LiveRadar bağlayıcı sunucu v4: tiktok-live-connector -> WebSocket
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

process.on("uncaughtException", (e) => console.error("uncaught", e));
process.on("unhandledRejection", (e) => console.error("unhandled", e));

const wss = new WebSocketServer({ port: process.env.PORT || 8081 });

wss.on("connection", (ws) => {
  let conn;
  const send = (o) => { try { ws.readyState === 1 && ws.send(JSON.stringify({ ts: Date.now(), ...o })); } catch {} };
  const status = (message) => send({ type: "status", message });
  const u = (d) => {
    const nickname = d.user?.nickname || d.nickname || "İzleyici";
    const user = d.user?.uniqueId || d.uniqueId || d.user?.displayId || (d.user?.userId ? String(d.user.userId) : "") || nickname;
    return { user, nickname };
  };

  // Render boşta bağlantıyı kesmesin diye 20 saniyede bir ping
  const ping = setInterval(() => { try { ws.ping(); } catch {} }, 20000);

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.action !== "start" || !msg.uniqueId) return;
    const id = String(msg.uniqueId).replace(/^@/, "").replace(/.*tiktok\.com\/@([^/?]+).*/, "$1");
    try { conn?.disconnect(); } catch {}
    status(`@${id} yayınına bağlanılıyor…`);
    try {
      conn = new TikTokLiveConnection(id, process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {});
      conn.on("error", (e) => status("TikTok hatası: " + (e?.info ?? e?.message ?? e)));
      if (ControlEvent?.DISCONNECTED) conn.on(ControlEvent.DISCONNECTED, () => status("TikTok bağlantısı kesildi"));
      if (ControlEvent?.ERROR) conn.on(ControlEvent.ERROR, (e) => status("TikTok hatası: " + (e?.info ?? e?.message ?? e)));
      conn.on(WebcastEvent.STREAM_END, () => status("Yayın sona erdi"));
      
      // TikTok v3 protokolünde mesaj d.content olarak gelir
      conn.on(WebcastEvent.CHAT, (d) => {
        const text = d.content || d.comment || d.text || d.message || "";
        send({ type: "chat", ...u(d), text, content: text });
      });
      conn.on(WebcastEvent.MEMBER, (d) => send({ type: "member", ...u(d) }));
      conn.on(WebcastEvent.LIKE, (d) => send({ type: "like", ...u(d), count: d.likeCount ?? d.count ?? 1 }));
      
      await conn.connect();
      status(`@${id} yayınına bağlanıldı`);
    } catch (e) {
      status("Bağlanılamadı: " + (e?.message ?? e) + " (yayın açık mı? kullanıcı adı doğru mu?)");
    }
  });

  ws.on("close", () => { clearInterval(ping); try { conn?.disconnect(); } catch {} });
});

console.log("LiveRadar server v4 ready");
      
