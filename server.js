// LiveRadar Hafif ve Hızlı Canlı Yayın Köprüsü
// Ağır veri indirmeleri ve hediye katalogları kapalı, sadece anlık canlı yayın akışı

import http from "node:http";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

process.on("uncaughtException", (err) => console.error("uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

const PORT = process.env.PORT || 8081;

console.log("EULER_API_KEY tanımlı mı:", !!process.env.EULER_API_KEY);

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
  console.log("🔌 Yeni WebSocket bağlantısı geldi");
  let conn = null;

  const send = (obj) => {
    try {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    } catch {}
  };

  const status = (text) => {
    console.log("📤 status gönderiliyor:", text);
    send({ type: "status", text, ts: Date.now() });
  };

  ws.on("message", (raw) => {
    console.log("📩 Mesaj alındı:", String(raw));
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch (e) {
      console.log("❌ JSON parse hatası:", e.message);
      return;
    }

    if (msg.action === "stop") {
      console.log("🛑 stop komutu alındı");
      try { conn?.disconnect(); } catch {}
      conn = null;
      status("Oturum durduruldu.");
      return;
    }

    if (msg.action !== "start" || !msg.uniqueId) {
      console.log("⚠️ Geçersiz action veya uniqueId yok:", msg);
      return;
    }

    const uniqueId = String(msg.uniqueId)
      .trim()
      .replace(/^@/, "")
      .replace(/.*tiktok\.com\/@([^/?]+).*/, "$1");

    console.log("▶️ start komutu alındı, uniqueId:", uniqueId);

    try { conn?.disconnect(); } catch {}
    conn = null;

    status(`@${uniqueId} yayınına bağlanılıyor…`);

    try {
      conn = new TikTokLiveConnection(uniqueId, {
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
        enableExtendedGiftInfo: false,
        ...(process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {})
      });

      conn.on("error", (err) => {
        const msg = String(err?.info ?? err?.message ?? err);
        console.log("🔴 conn error event:", msg);
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
        conn.on(ControlEvent.DISCONNECTED, () => {
          console.log("🔌 DISCONNECTED event");
          status("Yayın bağlantısı kesildi.");
        });
      }

      conn.on(WebcastEvent.STREAM_END, () => {
        console.log("🔚 STREAM_END event");
        status("Canlı yayın sona erdi.");
      });

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

      console.log("🔗 conn.connect() çağrılıyor...");
      conn.connect()
        .then((state) => {
          console.log("✅ Bağlantı başarılı! State:", JSON.stringify(state)?.slice(0, 300));
          status("Canlı yayına başarıyla bağlandı!");
        })
        .catch((err) => {
          const m = String(err?.info ?? err?.message ?? err);
          console.log("❌ conn.connect() hata verdi:", m);
          console.log("Tam hata objesi:", err);
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
      console.log("❌ try-catch hata:", e?.message || e);
      status("Hata: " + (e?.message || e));
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket bağlantısı kapandı");
    try { conn?.disconnect(); } catch {}
    conn = null;
  });

  ws.on("error", (err) => {
    console.log("🔴 WebSocket error:", err?.message || err);
    try { conn?.disconnect(); } catch {}
    conn = null;
  });
});

server.listen(PORT, () => {
  console.log(`LiveRadar köprüsü port ${PORT} üzerinde hazır!`);
});
        
