// LiveRadar All-in-One Sunucu (Web Panel + WebSocket Canlı TikTok Köprüsü)
// Sohbet, # İstekler, Hediyeler/Jetonlar, Beğeniler, CSV/Excel İndir, Sesli Bildirim ve Çökme Koruması

import http from "node:http";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

process.on("uncaughtException", (err) => console.error("uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

const PORT = process.env.PORT || 8081;

// --- GÖMÜLÜ WEB ARAYÜZÜ (HTML + JS + CSS) ---
const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LiveRadar — TikTok Canlı Yayın Paneli</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #e2e8f0; min-height: 100vh; }
    .header { background: #111827; border-bottom: 1px solid #1f2937; padding: 14px 20px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .logo { font-size: 20px; font-weight: 700; color: #f43f5e; display: flex; align-items: center; gap: 8px; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    input[type="text"] { background: #1e293b; border: 1px solid #334155; color: #fff; padding: 8px 14px; border-radius: 8px; font-size: 14px; outline: none; }
    input[type="text"]:focus { border-color: #f43f5e; }
    button { background: #f43f5e; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.15s; }
    button:hover { background: #e11d48; }
    button.secondary { background: #334155; }
    button.secondary:hover { background: #475569; }
    button.stop { background: #ef4444; }
    button.stop:hover { background: #dc2626; }
    .status-bar { background: #161e2e; padding: 10px 20px; border-bottom: 1px solid #1f2937; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; font-size: 13px; gap: 10px; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; background: #1e293b; color: #94a3b8; font-weight: 500; }
    .status-badge.connected { background: #064e3b; color: #34d399; }
    .status-badge.error { background: #7f1d1d; color: #fca5a5; }
    .stats { display: flex; gap: 12px; flex-wrap: wrap; }
    .stat-chip { background: #1e293b; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
    .stat-chip strong { color: #f43f5e; margin-left: 4px; }
    .main { padding: 16px 20px; max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .main { grid-template-columns: 1fr; } }
    .tabs { display: flex; gap: 6px; border-bottom: 1px solid #1f2937; padding-bottom: 8px; margin-bottom: 12px; overflow-x: auto; }
    .tab { background: transparent; color: #94a3b8; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
    .tab.active { background: #1e293b; color: #fff; border-bottom: 2px solid #f43f5e; }
    .feed { background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 14px; min-height: 520px; max-height: 700px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .feed-item { background: #1a2234; padding: 10px 12px; border-radius: 8px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; border-left: 3px solid #3b82f6; animation: fadeIn 0.2s; }
    .feed-item.gift { border-left-color: #f59e0b; background: #261f18; }
    .feed-item.like { border-left-color: #ec4899; }
    .feed-item.join { border-left-color: #10b981; }
    .feed-meta { display: flex; justify-content: space-between; color: #94a3b8; font-size: 11px; }
    .feed-user { font-weight: 700; color: #38bdf8; }
    .feed-gift-title { color: #f59e0b; font-weight: 700; }
    .feed-diamonds { background: #78350f; color: #fde68a; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 6px; }
    .side-panel { display: flex; flex-direction: column; gap: 16px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 14px; }
    .card-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .leader-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-real { background: #064e3b; color: #34d399; }
    .badge-bot { background: #7f1d1d; color: #fca5a5; }
    .badge-suspicious { background: #78350f; color: #fde68a; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">⚡ LiveRadar <span>TikTok Canlı Yayın</span></div>
    <div class="controls">
      <input type="text" id="username" placeholder="TikTok kullanıcı adı" value="siirinruhu" />
      <button id="btnStart" onclick="startSession()">Oturumu Başlat</button>
      <button id="btnDemo" class="secondary" onclick="startDemo()">Demo</button>
      <button id="btnStop" class="stop" onclick="stopSession()">Durdur</button>
      <button id="btnSound" class="secondary" onclick="toggleSound()">🔔 Ses: Açık</button>
      <button id="btnExport" class="secondary" onclick="exportCSV()">📥 CSV / Excel İndir</button>
    </div>
  </div>

  <div class="status-bar">
    <div id="statusBadge" class="status-badge">Bağlantı bekleniyor...</div>
    <div class="stats">
      <span class="stat-chip">Sohbet: <strong id="cntChat">0</strong></span>
      <span class="stat-chip">Hediyeler: <strong id="cntGift">0</strong></span>
      <span class="stat-chip">Toplam Jeton: <strong id="cntDiamonds">0 💎</strong></span>
      <span class="stat-chip">Beğeni: <strong id="cntLike">0</strong></span>
      <span class="stat-chip">Giriş: <strong id="cntJoin">0</strong></span>
    </div>
  </div>

  <div class="main">
    <div>
      <div class="tabs">
        <button class="tab active" onclick="setTab('all', event)">Tümü</button>
        <button class="tab" onclick="setTab('chat', event)">💬 Sohbet</button>
        <button class="tab" onclick="setTab('requests', event)">🏷️ # İstekler</button>
        <button class="tab" onclick="setTab('gifts', event)">🎁 Hediyeler</button>
        <button class="tab" onclick="setTab('joins', event)">👥 Girişler</button>
      </div>
      <div id="feed" class="feed"></div>
    </div>

    <div class="side-panel">
      <div class="card">
        <div class="card-title">
          <span>🏆 Beğeni Liderliği & Bot Analizi</span>
        </div>
        <div id="leaderboard">Henüz beğeni yok</div>
      </div>
      <div class="card">
        <div class="card-title">
          <span>🎁 En Çok Hediye Gönderenler</span>
        </div>
        <div id="giftBoard">Henüz hediye yok</div>
      </div>
    </div>
  </div>

  <script>
    var ws = null;
    var soundEnabled = true;
    var currentTab = "all";
    var events = [];
    var likers = {};
    var gifters = {};
    var totalDiamonds = 0;
    var isDemo = false;
    var demoTimer = null;
    var audioCtx = null;

    function playTone(freq, dur) {
      if (!soundEnabled) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
      } catch(e) {}
    }

    function toggleSound() {
      soundEnabled = !soundEnabled;
      document.getElementById("btnSound").textContent = soundEnabled ? "🔔 Ses: Açık" : "🔕 Ses: Kapalı";
    }

    function connectWS() {
      var proto = location.protocol === "https:" ? "wss:" : "ws:";
      var host = location.host;
      var wsUrl = proto + "//" + host;
      ws = new WebSocket(wsUrl);

      ws.onopen = function() {
        updateStatus("Sunucuya bağlandı, yayın başlatılmaya hazır.", "connected");
      };
      ws.onmessage = function(e) {
        try {
          var d = JSON.parse(e.data);
          handleEvent(d);
        } catch(err) {}
      };
      ws.onclose = function() {
        updateStatus("Sunucu bağlantısı koptu. Yeniden deneniyor...", "error");
        setTimeout(connectWS, 3000);
      };
      ws.onerror = function() {
        updateStatus("Sunucu bağlantı hatası", "error");
      };
    }

    function updateStatus(text, type) {
      var el = document.getElementById("statusBadge");
      el.textContent = text;
      el.className = "status-badge" + (type ? " " + type : "");
    }

    function startSession() {
      stopSession();
      var user = document.getElementById("username").value.trim();
      if (!user) return alert("Lütfen bir kullanıcı adı girin!");
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWS();
        setTimeout(function() {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "start", uniqueId: user }));
          }
        }, 800);
      } else {
        ws.send(JSON.stringify({ action: "start", uniqueId: user }));
      }
      updateStatus("@" + user + " yayınına bağlanılıyor...", "");
    }

    function stopSession() {
      if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "stop" }));
      }
      updateStatus("Oturum durduruldu", "");
    }

    function handleEvent(ev) {
      if (ev.type === "status") {
        var isConn = ev.text.includes("Canlı yayına bağlandı");
        var isErr = ev.text.includes("hata") || ev.text.includes("değil") || ev.text.includes("kesildi") || ev.text.includes("boş");
        updateStatus(ev.text, isConn ? "connected" : (isErr ? "error" : ""));
        return;
      }

      events.unshift(ev);
      if (events.length > 500) events.pop();

      if (ev.type === "chat") {
        incrementCount("cntChat");
        if (ev.text && ev.text.startsWith("#")) playTone(600, 0.1);
      } else if (ev.type === "gift") {
        incrementCount("cntGift");
        totalDiamonds += (ev.diamonds || 0);
        document.getElementById("cntDiamonds").textContent = totalDiamonds + " 💎";
        gifters[ev.user] = (gifters[ev.user] || 0) + (ev.diamonds || 1);
        updateGiftBoard();
        playTone(880, 0.25);
      } else if (ev.type === "like") {
        incrementCount("cntLike", ev.count || 1);
        likers[ev.user] = (likers[ev.user] || 0) + (ev.count || 1);
        updateLeaderboard();
      } else if (ev.type === "member") {
        incrementCount("cntJoin");
      }

      renderFeedItem(ev);
    }

    function incrementCount(id, delta) {
      var el = document.getElementById(id);
      var cur = parseInt(el.textContent.replace(/[^0-9]/g, "") || "0", 10);
      el.textContent = (cur + (delta || 1)).toLocaleString("tr-TR");
    }

    function renderFeedItem(ev) {
      var isMatch = false;
      if (currentTab === "all") isMatch = true;
      else if (currentTab === "chat" && ev.type === "chat") isMatch = true;
      else if (currentTab === "requests" && ev.type === "chat" && ev.text && ev.text.startsWith("#")) isMatch = true;
      else if (currentTab === "gifts" && ev.type === "gift") isMatch = true;
      else if (currentTab === "joins" && ev.type === "member") isMatch = true;

      if (!isMatch) return;

      var feed = document.getElementById("feed");
      var item = document.createElement("div");
      item.className = "feed-item " + (ev.type === "gift" ? "gift" : (ev.type === "like" ? "like" : (ev.type === "member" ? "join" : "")));
      
      var timeStr = new Date(ev.ts || Date.now()).toLocaleTimeString("tr-TR");
      var html = '<div class="feed-meta"><span class="feed-user">@' + escapeHtml(ev.user) + '</span><span>' + timeStr + '</span></div>';

      if (ev.type === "chat") {
        html += '<div>' + escapeHtml(ev.text) + '</div>';
      } else if (ev.type === "gift") {
        html += '<div class="feed-gift-title">🎁 ' + escapeHtml(ev.giftName || "Hediye") + ' x' + (ev.giftCount || 1) + ' <span class="feed-diamonds">' + (ev.diamonds || 0) + ' 💎</span></div>';
      } else if (ev.type === "like") {
        html += '<div>❤️ ' + (ev.count || 1) + ' beğeni gönderdi</div>';
      } else if (ev.type === "member") {
        html += '<div>👋 Yayına katıldı</div>';
      }

      item.innerHTML = html;
      feed.insertBefore(item, feed.firstChild);

      if (feed.children.length > 200) {
        feed.removeChild(feed.lastChild);
      }
    }

    function setTab(tab, e) {
      currentTab = tab;
      var tabs = document.querySelectorAll(".tab");
      tabs.forEach(function(t) { t.classList.remove("active"); });
      if (e) e.target.classList.add("active");
      
      var feed = document.getElementById("feed");
      feed.innerHTML = "";
      for (var i = 0; i < events.length; i++) {
        renderFeedItem(events[i]);
      }
    }

    function updateLeaderboard() {
      var arr = Object.keys(likers).map(function(k) { return { user: k, count: likers[k] }; });
      arr.sort(function(a, b) { return b.count - a.count; });
      var top5 = arr.slice(0, 6);
      
      var html = "";
      top5.forEach(function(item) {
        var badge = '<span class="badge badge-real">Gerçek</span>';
        if (item.count >= 150) badge = '<span class="badge badge-bot">🤖 Bot</span>';
        else if (item.count >= 50) badge = '<span class="badge badge-suspicious">⚠️ Şüpheli</span>';

        html += '<div class="leader-row"><div><strong>@' + escapeHtml(item.user) + '</strong> (' + item.count + ')</div>' + badge + '</div>';
      });
      document.getElementById("leaderboard").innerHTML = html || "Henüz beğeni yok";
    }

    function updateGiftBoard() {
      var arr = Object.keys(gifters).map(function(k) { return { user: k, diamonds: gifters[k] }; });
      arr.sort(function(a, b) { return b.diamonds - a.diamonds; });
      var top5 = arr.slice(0, 5);

      var html = "";
      top5.forEach(function(item) {
        html += '<div class="leader-row"><div><strong>@' + escapeHtml(item.user) + '</strong></div><div style="color:#fde68a;font-weight:700;">' + item.diamonds + ' 💎</div></div>';
      });
      document.getElementById("giftBoard").innerHTML = html || "Henüz hediye yok";
    }

    function exportCSV() {
      if (!events.length) return alert("Dışa aktarılacak veri yok!");
      var csv = "\\uFEFFZaman,Olay Tipi,Kullanici,Detay,Jeton / Deger\\n";
      events.forEach(function(e) {
        var d = new Date(e.ts).toLocaleString("tr-TR");
        var val = (e.type === "chat" ? (e.text || "") : (e.type === "gift" ? (e.giftName + " x" + e.giftCount) : (e.count || "")));
        var diamonds = e.diamonds || "";
        csv += '"' + d + '","' + e.type + '","' + (e.user || "") + '","' + String(val).replace(/"/g, '""') + '","' + diamonds + '"\\n';
      });
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "liveradar-export-" + Date.now() + ".csv";
      a.click();
    }

    function startDemo() {
      stopSession();
      updateStatus("Demo Modu Aktif (Örnek veriler akıyor)", "connected");
      var sampleUsers = ["ahmet_kaya", "ayse_yildiz", "tiktok_canavari", "canan_34", "mehmet_tr"];
      var sampleGifts = [
        { name: "Gül", dia: 1 },
        { name: "TikTok Kalp", dia: 10 },
        { name: "Yat", dia: 500 },
        { name: "Aslan", dia: 2999 }
      ];

      demoTimer = setInterval(function() {
        var r = Math.random();
        var u = sampleUsers[Math.floor(Math.random() * sampleUsers.length)];
        if (r < 0.4) {
          var isReq = Math.random() < 0.3;
          handleEvent({
            type: "chat",
            ts: Date.now(),
            user: u,
            text: isReq ? "#istek sarkisi calar misin" : "Harika bir yayin, tebrikler!"
          });
        } else if (r < 0.7) {
          handleEvent({
            type: "like",
            ts: Date.now(),
            user: u,
            count: Math.floor(Math.random() * 5) + 1
          });
        } else if (r < 0.85) {
          var g = sampleGifts[Math.floor(Math.random() * sampleGifts.length)];
          handleEvent({
            type: "gift",
            ts: Date.now(),
            user: u,
            giftName: g.name,
            giftCount: 1,
            diamonds: g.dia
          });
        } else {
          handleEvent({
            type: "member",
            ts: Date.now(),
            user: u
          });
        }
      }, 700);
    }

    function escapeHtml(s) {
      if (!s) return "";
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // Sayfa açıldığında otomatik bağlan
    connectWS();
  </script>
</body>
</html>
`;

// --- HTTP SUNUCUSU ---
const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?"))) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML_DASHBOARD);
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }
  res.writeHead(404);
  res.end();
});

// --- WEBSOCKET SUNUCUSU (Lovable App & Dashboard Köprüsü) ---
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
      conn = new TikTokLiveConnection(uniqueId, {
        processInitialData: false,
        fetchRoomInfoOnConnect: true,
        enableExtendedGiftInfo: false,
        ...(process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {})
      });

      conn.on("error", (err) => {
        const msg = String(err?.info ?? err?.message ?? err);
        if (msg.includes("Empty Payload") || msg.includes("missing tokens")) {
          status("TikTok imza yanıtı boş döndü (Empty Payload). Yayıncı yayını kapatmış olabilir veya geçici istek sınırı uygulanmış olabilir. Lütfen kullanıcının şu an canlı yayında olduğunu kontrol edin ve 1 dakika sonra tekrar deneyin.");
        } else if (msg.includes("isn't online")) {
          status(`@${uniqueId} şu an canlı yayında değil.`);
        } else {
          status("TikTok hatası: " + msg);
        }
      });

      if (ControlEvent?.DISCONNECTED) {
        conn.on(ControlEvent.DISCONNECTED, () => status("TikTok c
