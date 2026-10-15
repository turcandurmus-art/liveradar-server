import http from "node:http";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

process.on("uncaughtException", (err) => console.error("Kritik Hata:", err?.message || err));
process.on("unhandledRejection", (err) => console.error("Reddedilen İşlem:", err?.message || err));

const PORT = process.env.PORT || 8081;

// HTTP ve WebSocket Sunucusu
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html>
<head><title>LiveRadar Sunucu</title><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0b0f19;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:30px;background:#1e293b;border-radius:12px;border:1px solid #334155;">
    <h1 style="color:#f43f5e;margin-bottom:10px;">LiveRadar Köprüsü Aktif</h1>
    <p style="color:#94a3b8;">WebSocket ve TikTok Canlı Yayın Bağlantısı Hazır</p>
    <p style="margin-top:15px;font-size:12px;color:#64748b;">Port: ${PORT}</p>
  </div>
</body>
</html>`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let tiktok = null;
  const send = (obj) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  const status = (message) => send({ type: "status", message, ts: Date.now() });

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.action === "stop") {
        if (tiktok) { try { await tiktok.disconnect(); } catch {} tiktok = null; }
        return status("Yayın bağlantısı kesildi");
      }
      if (data.action === "start" && data.uniqueId) {
        if (tiktok) { try { await tiktok.disconnect(); } catch {} tiktok = null; }
        const user = String(data.uniqueId).replace(/^@/, "").trim();
        status(`@${user} yayınına bağlanılıyor...`);

        tiktok = new TikTokLiveConnection(user, {
          enableExtendedGiftInfo: true,
          processInitialData: false,
          clientParams: { app_language: "tr-TR" }
        });

        tiktok.on(WebcastEvent.CHAT, (d) => {
          send({
            type: "chat",
            user: d.uniqueId || d.nickname || "izleyici",
            nickname: d.nickname || d.uniqueId || "izleyici",
            text: d.comment || d.content || "",
            ts: Date.now()
          });
        });

        tiktok.on(WebcastEvent.MEMBER, (d) => {
          send({
            type: "member",
            user: d.uniqueId || d.nickname || "izleyici",
            nickname: d.nickname || d.uniqueId || "izleyici",
            ts: Date.now()
          });
        });

        tiktok.on(WebcastEvent.LIKE, (d) => {
          send({
            type: "like",
            user: d.uniqueId || d.nickname || "izleyici",
            nickname: d.nickname || d.uniqueId || "izleyici",
            count: Number(d.likeCount || d.count || 1),
            ts: Date.now()
          });
        });

        tiktok.on(ControlEvent.DISCONNECTED, () => status("Yayın kapandı veya bağlantı koptu"));
        tiktok.on(ControlEvent.ERROR, (err) => status(`Hata: ${err?.message || "Bağlantı hatası"}`));

        try {
          await tiktok.connect();
          status(`@${user} yayınına başarıyla bağlandı!`);
        } catch (err) {
          const msg = String(err?.message || "");
          if (msg.includes("LIVE has ended") || msg.includes("not found")) {
            status(`@${user} şu an canlı yayında değil.`);
          } else {
            status(`Bağlanılamadı: ${msg || "TikTok yanıt vermedi"}`);
          }
        }
      }
    } catch (e) {
      status("İstek işlenirken hata oluştu");
    }
  });

  ws.on("close", () => {
    if (tiktok) { try { tiktok.disconnect(); } catch {} tiktok = null; }
  });
});

server.listen(PORT, () => {
  console.log(`LiveRadar sunucusu ${PORT} portunda aktif!`);
});


      
