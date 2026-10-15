// LiveRadar Hafif ve Hızlı Canlı Yayın Köprüsü
// Ağır veri indirmeleri ve hediye katalogları kapalı, sadece anlık canlı yayın akışı

import http from "node:http";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

process.on("uncaughtException", (err) => console.error("uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

const PORT = process.env.PORT || 8081;

// Durum kontrol sayfası
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html lang="tr">
    <head><meta charset="UTF-8"><title>LiveRadar Köprüsü Aktif</title></head>
    <body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:40px;text-align:center;">
      <h1 style="color:#f43f5e;">⚡ LiveRadar Canlı Yayın Köprüsü Aktif</h1>
      <p style="color:#94a3b8;">Lovable panelinizden canlı yayını başlatabilirsiniz.</p>
    </body>
    </html>
  `);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let conn = null;

  const send = (obj) => {
    try {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    } catch {}
  };

  const status = (text) => send({ type: "status", text, ts: Date.now() });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.action === "stop") {
      try { conn?.disconnect(); } catch {}
      conn = null;
      status("Oturum durduruldu.");
      return;
    }

    if (msg.action !== "start" || !msg.uniqueId) return;

    const uniqueId = String(msg.uniqueId)
      .trim()
      .replace(/^@/, "")
      .replace(/.*tiktok\.com\/@([^/?]+).*/, "$1");

    try { conn?.disconnect(); } catch {}
    conn = null;

    status(`@${uniqueId} yayınına bağlanılıyor…`);

    try {
      // Ağır veri indirmeleri tamamen kapalı — sıfır imza ücreti, hafif ve anlık bağlantı
      conn = new TikTokLiveConnection(uniqueId, {
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
        enableExtendedGiftInfo: false,
        ...(process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {})
      });

      conn.on("error", (err) => {
        const msg = String(err?.info ?? err?.message ?? err);
        if (msg.includes("rate_limit") || msg.includes("Rate Limit")) {
          status("Geçici hız sınırı. Lütfen 30 saniye bekleyip tekrar deneyin.");
        } else if (msg.includes("isn't online")) {
          status(`@${uniqueId} şu an canlı yayında değil.`);
        } else if (msg.includes("Empty Payload") || msg.includes("missing tokens")) {
          status("TikTok yanıt vermedi. Yayıncı çevrimdışı olabilir, lütfen 1 dakika sonra tekrar deneyin.");
        } else {
          status("Bağlantı bildirimi: " + msg);
        }
      });

      if (ControlEvent?.DISCONNECTED) {
        conn.on(ControlEvent.DISCONNECTED, () => status("Yayın bağlantısı kesildi."));
      }

      conn.on(WebcastEvent.STREAM_END, () => status("Canlı yayın sona erdi."));

      // Sohbet mesajları
      conn.on(WebcastEvent.CHAT, (d) => {
        const user = d.user?.displayId || d.uniqueId || d.user?.nickname || "izleyici";
        const nickname = d.user?.nickname || d.user?.displayId || d.nickname || "izleyici";
        const text = d.content ?? d.comment ?? d.text ?? "";
        send({
          type: "chat",
          ts: Number(d.createTime) || Date.now(),
          user,
          nickname,
          text: String(text)
        });
      });

      // Beğeniler
      conn.on(WebcastEvent.LIKE, (d) => {
        const user = d.user?.displayId || d.uniqueId || d.user?.nickname || "izleyici";
        const nickname = d.user?.nickname || d.user?.displayId || d.nickname || "izleyici";
        send({
          type: "like",
          ts: Date.now(),
          user,
          nickname,
          count: Number(d.likeCount ?? d.count ?? 1)
        });
      });

      // Yayına katılanlar
      conn.on(WebcastEvent.MEMBER, (d) => {
        const user = d.user?.displayId || d.uniqueId || d.user?.nickname || "izleyici";
        const nickname = d.user?.nickname || d.user?.displayId || d.nickname || "izleyici";
        send({
          type: "member",
          ts: Date.now(),
          user,
          nickname
        });
      });

      // Canlı hediye akışı (ön indirme yapmaz, atıldığında anlık iletir)
      conn.on(WebcastEvent.GIFT, (d) => {
        const user = d.user?.displayId || d.uniqueId || d.user?.nickname || "izleyici";
        const nickname = d.user?.nickname || d.user?.displayId || d.nickname || "izleyici";
        const diamonds = (Number(d.diamondCount) || 0) * (Number(d.repeatCount) || 1);
        send({
          type: "gift",
          ts: Date.now(),
          user,
          nickname,
          giftName: d.giftName || "Hediye",
          giftCount: Number(d.repeatCount) || 1,
          diamonds
        });
      });

      conn.connect()
        .then(() => {
          status("Canlı yayına başarıyla bağlandı!");
        })
        .catch((err) => {
          const m = String(err?.info ?? err?.message ?? err);
          if (m.includes("isn't online")) {
            status(`@${uniqueId} şu an canlı yayında değil.`);
          } else if (m.includes("rate_limit") || m.includes("Rate Limit")) {
            status("Çok sık denendiği için geçici hız sınırı. 30 saniye bekleyip tekrar deneyin.");
          } else if (m.includes("Empty Payload") || m.includes("missing tokens")) {
            status("TikTok imza yanıtı vermedi. Yayıncı çevrimdışı olabilir.");
          } else {
            status(`Bağlanılamadı: ${m}`);
          }
        });

    } catch (e) {
      status("Hata: " + (e?.message || e));
    }
  });

  ws.on("close", () => {
    try { conn?.disconnect(); } catch {}
    conn = null;
  });

  ws.on("error", () => {
    try { conn?.disconnect(); } catch {}
    conn = null;
  });
});

server.listen(PORT, () => {
  console.log(`LiveRadar köprüsü port ${PORT} üzerinde hazır!`);
});
        
