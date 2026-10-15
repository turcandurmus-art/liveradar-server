// LiveRadar TikTok Canlı Yayın Bağlayıcı Sunucu
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

const PORT = process.env.PORT || 8081;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let conn = null;

  const send = (data) => {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ ts: Date.now(), ...data }));
      }
    } catch {}
  };

  const status = (message) => send({ type: "status", message });

  const extractUser = (d) => ({
    user: d.user?.uniqueId || d.user?.displayId || d.uniqueId || String(d.user?.id ?? d.userId ?? "?"),
    nickname: d.user?.nickname || d.nickname || d.user?.uniqueId || "?"
  });

  // Render sunucusunun boştayken bağlantıyı kesmesini önlemek için 20 sn'de bir ping
  const pingInterval = setInterval(() => {
    try { ws.ping(); } catch {}
  }, 20000);

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.action !== "start" || !msg.uniqueId) return;

    // Kullanıcı adını / bağlantı linkini temizleme
    const uniqueId = String(msg.uniqueId)
      .trim()
      .replace(/^@/, "")
      .replace(/.*tiktok\.com\/@([^/?]+).*/, "$1");

    try { conn?.disconnect(); } catch {}

    status(`@${uniqueId} yayınına bağlanılıyor…`);

    try {
      conn = new TikTokLiveConnection(uniqueId, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        ...(process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {})
      });

      conn.on("error", (err) => {
        status("TikTok hatası: " + (err?.info ?? err?.message ?? err));
      });

      if (ControlEvent?.DISCONNECTED) {
        conn.on(ControlEvent.DISCONNECTED, () => status("TikTok bağlantısı kesildi"));
      }
      if (ControlEvent?.ERROR) {
        conn.on(ControlEvent.ERROR, (err) => status("TikTok hatası: " + (err?.info ?? err?.message ?? err)));
      }

      conn.on(WebcastEvent.STREAM_END, () => status("Yayın sona erdi"));

      // Sohbet mesajları (TikTok'un comment veya content olarak gönderdiği tüm metinleri yakalar)
      conn.on(WebcastEvent.CHAT, (d) => {
        const text = d.comment ?? d.content ?? d.text ?? "";
        send({ type: "chat", ...extractUser(d), text });
      });

      // Katılan izleyiciler
      conn.on(WebcastEvent.MEMBER, (d) => {
        send({ type: "member", ...extractUser(d) });
      });

      // Beğeniler
      conn.on(WebcastEvent.LIKE, (d) => {
        const count = d.likeCount ?? d.count ?? 1;
        send({ type: "like", ...extractUser(d), count });
      });

      // Hediyeler ve Jeton / Elmas değerleri
      conn.on(WebcastEvent.GIFT, (d) => {
        const giftName = d.giftName ?? d.gift?.name ?? d.describe ?? "Hediye";
        const giftCount = d.repeatCount ?? d.giftCount ?? d.count ?? 1;
        const diamonds = d.diamondCount ?? (d.gift?.diamond_count ? d.gift.diamond_count * giftCount : 0);
        send({
          type: "gift",
          ...extractUser(d),
          giftName,
          giftCount,
          diamonds
        });
      });

      await conn.connect();
      status(`@${uniqueId} yayınına bağlanıldı`);
    } catch (err) {
      status("Bağlanılamadı: " + (err?.message ?? err) + " (yayın açık mı? kullanıcı adı doğru mu?)");
    }
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    try { conn?.disconnect(); } catch {}
  });
});

console.log("LiveRadar sunucusu hazır!");
          

      
