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
      if (demoTimer) clearInterval(demoTimer);
      demoTimer = null;
      isDemo = false;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "stop" }));
      }
      updateStatus("Durduruldu.", "");
    }

    function handleEvent(d) {
      if (d.type === "status") {
        var isErr = d.message.indexOf("hatası") !== -1 || d.message.indexOf("Bağlanılamadı") !== -1 || d.message.indexOf("kapalı") !== -1 || d.message.indexOf("Payload") !== -1;
        var isOk = d.message.indexOf("bağlanıldı") !== -1;
        updateStatus(d.message, isErr ? "error" : (isOk ? "connected" : ""));
        return;
      }

      events.unshift(d);
      if (events.length > 500) events.pop();

      if (d.type === "chat") {
        var cEl = document.getElementById("cntChat");
        cEl.textContent = parseInt(cEl.textContent) + 1;
        playTone(440, 0.05);
      } else if (d.type === "like") {
        var count = d.count || 1;
        var lEl = document.getElementById("cntLike");
        lEl.textContent = parseInt(lEl.textContent) + count;
        likers[d.user] = (likers[d.user] || 0) + count;
        renderLeaderboard();
      } else if (d.type === "member") {
        var mEl = document.getElementById("cntJoin");
        mEl.textContent = parseInt(mEl.textContent) + 1;
      } else if (d.type === "gift") {
        var gEl = document.getElementById("cntGift");
        gEl.textContent = parseInt(gEl.textContent) + (d.giftCount || 1);
        var dias = d.diamonds || 0;
        totalDiamonds += dias;
        document.getElementById("cntDiamonds").textContent = totalDiamonds + " 💎";
        gifters[d.user] = (gifters[d.user] || { name: d.nickname, diamonds: 0, count: 0 });
        gifters[d.user].diamonds += dias;
        gifters[d.user].count += (d.giftCount || 1);
        renderGiftBoard();
        playTone(880, 0.15);
      }

      renderFeed();
    }

    function setTab(tab, ev) {
      currentTab = tab;
      var tabs = document.querySelectorAll(".tab");
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove("active");
      if (ev && ev.target) ev.target.classList.add("active");
      renderFeed();
    }

    function renderFeed() {
      var feed = document.getElementById("feed");
      var filtered = events.filter(function(e) {
        if (currentTab === "all") return true;
        if (currentTab === "chat") return e.type === "chat";
        if (currentTab === "requests") return e.type === "chat" && (e.text || "").trim().indexOf("#") === 0;
        if (currentTab === "gifts") return e.type === "gift";
        if (currentTab === "joins") return e.type === "member";
        return true;
      });

      feed.innerHTML = filtered.slice(0, 80).map(function(e) {
        var time = new Date(e.ts || Date.now()).toLocaleTimeString("tr-TR");
        var usr = escapeHTML(e.nickname || e.user || "");
        if (e.type === "chat") {
          return '<div class="feed-item">' +
            '<div class="feed-meta"><span class="feed-user">' + usr + '</span><span>' + time + '</span></div>' +
            '<div>' + escapeHTML(e.text || "") + '</div>' +
          '</div>';
        } else if (e.type === "gift") {
          return '<div class="feed-item gift">' +
            '<div class="feed-meta"><span class="feed-user">' + usr + '</span><span>' + time + '</span></div>' +
            '<div>🎁 <span class="feed-gift-title">' + (e.giftCount || 1) + 'x ' + escapeHTML(e.giftName || "Hediye") + '</span> <span class="feed-diamonds">+' + (e.diamonds || 0) + ' 💎</span></div>' +
          '</div>';
        } else if (e.type === "like") {
          return '<div class="feed-item like">' +
            '<div class="feed-meta"><span class="feed-user">' + usr + '</span><span>' + time + '</span></div>' +
            '<div>❤️ ' + (e.count || 1) + ' beğeni gönderdi</div>' +
          '</div>';
        } else if (e.type === "member") {
          return '<div class="feed-item join">' +
            '<div class="feed-meta"><span class="feed-user">' + usr + '</span><span>' + time + '</span></div>' +
            '<div>👋 Yayına katıldı</div>' +
          '</div>';
        }
        return "";
      }).join("");
    }

    function renderLeaderboard() {
      var lb = document.getElementById("leaderboard");
      var entries = Object.entries(likers);
      entries.sort(function(a, b) { return b[1] - a[1]; });
      var top10 = entries.slice(0, 10);
      if (top10.length === 0) { lb.innerHTML = "Henüz beğeni yok"; return; }
      lb.innerHTML = top10.map(function(entry, i) {
        var user = entry[0];
        var count = entry[1];
        var cls = count > 150 ? "badge-bot" : (count > 50 ? "badge-suspicious" : "badge-real");
        var label = count > 150 ? "Bot" : (count > 50 ? "Şüpheli" : "Gerçek");
        return '<div class="leader-row">' +
          '<span>#' + (i + 1) + ' <strong>@' + escapeHTML(user) + '</strong> (' + count + ' ❤️)</span>' +
          '<span class="badge ' + cls + '">' + label + '</span>' +
        '</div>';
      }).join("");
    }

    function renderGiftBoard() {
      var gb = document.getElementById("giftBoard");
      var entries = Object.entries(gifters);
      entries.sort(function(a, b) { return b[1].diamonds - a[1].diamonds; });
      var top10 = entries.slice(0, 10);
      if (top10.length === 0) { gb.innerHTML = "Henüz hediye yok"; return; }
      gb.innerHTML = top10.map(function(entry, i) {
        var user = entry[0];
        var data = entry[1];
        return '<div class="leader-row">' +
          '<span>#' + (i + 1) + ' <strong>' + escapeHTML(data.name || user) + '</strong></span>' +
          '<span class="feed-diamonds">' + data.diamonds + ' 💎 (' + data.count + ' adet)</span>' +
        '</div>';
      }).join("");
    }

    function exportCSV() {
      if (events.length === 0) return alert("Dışa aktarılacak veri bulunmuyor!");
      var csv = "\\uFEFFZaman,Olay Tipi,Kullanıcı,Metin / Hediye / Adet,Jeton (Elmas)\\n";
      events.forEach(function(e) {
        var time = new Date(e.ts || Date.now()).toLocaleTimeString("tr-TR");
        var type = e.type === "chat" ? "Sohbet" : (e.type === "gift" ? "Hediye" : (e.type === "like" ? "Beğeni" : "Katılım"));
        var user = '"' + (e.nickname || e.user || "").replace(/"/g, '""') + '"';
        var detail = "";
        var dia = "";
        if (e.type === "chat") detail = '"' + (e.text || "").replace(/"/g, '""') + '"';
        else if (e.type === "gift") { detail = '"' + (e.giftCount || 1) + "x " + (e.giftName || "") + '"'; dia = e.diamonds || 0; }
        else if (e.type === "like") detail = (e.count || 1) + " beğeni";
        else if (e.type === "member") detail = "Katıldı";
        csv += time + "," + type + "," + user + "," + detail + "," + dia + "\\n";
      });

      var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "liveradar-veriler-" + Date.now() + ".csv";
      a.click();
      URL.revokeObjectURL(url);
    }

    function startDemo() {
      stopSession();
      isDemo = true;
      updateStatus("Demo modu aktif — Örnek veriler akıyor...", "connected");
      var demoUsers = ["ayse_can", "mehmet99", "selin_live", "can_kaya", "burak_x"];
      var demoMessages = ["Selam herkese!", "Harika yayın #istek parça var mı?", "Takip ettim", "#istek sezen aksu lütfen", "Ses çok net geliyor"];
      var demoGifts = [{ name: "Gül", dia: 1 }, { name: "Kalp", dia: 10 }, { name: "Aslan", dia: 1000 }, { name: "Panda", dia: 5 }];

      demoTimer = setInterval(function() {
        var rnd = Math.random();
        var u = demoUsers[Math.floor(Math.random() * demoUsers.length)];
        if (rnd < 0.5) {
          handleEvent({ type: "chat", user: u, nickname: u, text: demoMessages[Math.floor(Math.random() * demoMessages.length)], ts: Date.now() });
        } else if (rnd < 0.75) {
          handleEvent({ type: "like", user: u, nickname: u, count: Math.floor(Math.random() * 5) + 1, ts: Date.now() });
        } else if (rnd < 0.9) {
          var g = demoGifts[Math.floor(Math.random() * demoGifts.length)];
          handleEvent({ type: "gift", user: u, nickname: u, giftName: g.name, giftCount: 1, diamonds: g.dia, ts: Date.now() });
        } else {
          handleEvent({ type: "member", user: u, nickname: u, ts: Date.now() });
        }
      }, 1000);
    }

    function escapeHTML(str) {
      return String(str || "").replace(/[&<>'"]/g, function(tag) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag;
      });
    }

    connectWS();
  </script>
</body>
</html>`;

// 1. Web arayüzünü doğrudan sunan HTTP sunucusu
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML_DASHBOARD);
});

// 2. Hem web arayüzünün hem de harici istemcilerin bağlandığı WebSocket sunucusu
const wss = new WebSocketServer({ server });

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

  const pingInterval = setInterval(() => {
    try { ws.ping(); } catch {}
  }, 20000);

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.action === "stop") {
      try { conn?.disconnect(); } catch {}
      conn = null;
      status("Bağlantı durduruldu.");
      return;
    }

    if (msg.action !== "start" || !msg.uniqueId) return;

    const uniqueId = String(msg.uniqueId)
      .trim()
      .replace(/^@/, "")
      .replace(/.*tiktok\\.com\\/@([^/?]+).*/, "$1"
          

      
