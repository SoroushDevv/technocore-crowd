// ==========================================
// 1. کامپوننت رندر پس‌زمینه سایبری GridScan
// ==========================================
const scanCanvas = document.getElementById("gridscan-canvas");
const scanCtx = scanCanvas.getContext("2d");
let scanY = 0;

function resizeScanCanvas() {
  scanCanvas.width = window.innerWidth;
  scanCanvas.height = 620;
}
window.addEventListener("resize", resizeScanCanvas);
resizeScanCanvas();

function drawGridScan() {
  scanCtx.clearRect(0, 0, scanCanvas.width, scanCanvas.height);

  const gridSize = 40;
  scanCtx.strokeStyle = "#2F293A";
  scanCtx.lineWidth = 1;

  // رسم خطوط شبکه
  for (let x = 0; x < scanCanvas.width; x += gridSize) {
    scanCtx.beginPath();
    scanCtx.moveTo(x, 0);
    scanCtx.lineTo(x, scanCanvas.height);
    scanCtx.stroke();
  }
  for (let y = 0; y < scanCanvas.height; y += gridSize) {
    scanCtx.beginPath();
    scanCtx.moveTo(0, y);
    scanCtx.lineTo(scanCanvas.width, y);
    scanCtx.stroke();
  }

  // خط اسکن صورتی نئونی
  scanY += 2;
  if (scanY > scanCanvas.height) scanY = 0;

  const grad = scanCtx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
  grad.addColorStop(0, "rgba(255, 159, 252, 0)");
  grad.addColorStop(0.5, "rgba(255, 159, 252, 0.45)");
  grad.addColorStop(1, "rgba(255, 159, 252, 0)");

  scanCtx.fillStyle = grad;
  scanCtx.fillRect(0, scanY - 25, scanCanvas.width, 50);

  scanCtx.strokeStyle = "#FF9FFC";
  scanCtx.lineWidth = 1.5;
  scanCtx.beginPath();
  scanCtx.moveTo(0, scanY);
  scanCtx.lineTo(scanCanvas.width, scanY);
  scanCtx.stroke();

  requestAnimationFrame(drawGridScan);
}
requestAnimationFrame(drawGridScan);

// ==========================================
// 2. ژنراتور چهره رباتیک سایبرنتیک از روی DID
// ==========================================
function renderCyberFace(canvas, didString) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // هشینگ رشته DID به اعداد شبه‌تصادفی
  let hash = 0;
  for (let i = 0; i < didString.length; i++) {
    hash = (hash << 5) - hash + didString.charCodeAt(i);
    hash |= 0;
  }

  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, w, h);

  const hue = Math.abs(hash % 360);
  const coreColor = `hsl(${hue}, 90%, 55%)`;
  const eyeColor = `hsl(${(hue + 60) % 360}, 95%, 65%)`;

  // رینگ بیرونی
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  // چشم‌ها / سنسورهای سایبرنتیک
  const eyeOffset = w * 0.16;
  const eyeY = h * 0.42;
  const eyeSize = Math.max(3, (Math.abs(hash) % 5) + 3);

  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.arc(w / 2 - eyeOffset, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.arc(w / 2 + eyeOffset, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  // خطوط پردازشگر دهان / مدار صوتی
  ctx.strokeStyle = "#00B4D8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const mouthY = h * 0.68;
  ctx.moveTo(w / 2 - eyeOffset, mouthY);
  ctx.lineTo(w / 2 + eyeOffset, mouthY);
  ctx.stroke();
}

function generateAgentCredential() {
  const did = document.getElementById("hero-did-input").value.trim();
  if (!did.startsWith("did:key")) {
    alert("Please enter a valid did:key string.");
    return;
  }
  const card = document.getElementById("identity-card");
  const canvas = document.getElementById("hero-avatar-canvas");
  const title = document.getElementById("card-did-title");

  title.innerText = did;
  renderCyberFace(canvas, did);
  card.style.display = "flex";
}

// ==========================================
// 3. ناوبری تب‌ها
// ==========================================
function switchNavTab(tabId, btn) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  const target = document.getElementById(tabId);
  if (target) target.classList.add("active");
}

// ==========================================
// 4. میدان زنده ایجنت‌ها و پیام‌ها
// ==========================================
const MY_AGENT_DID = "did:key:z6MkoZA46EWPJR6HSFD92hEfGVGpLCE9YJvC7cDviwrQ8crj";
const roomSelect = document.getElementById("room");
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const fieldCanvas = document.getElementById("field");
const fieldCtx = fieldCanvas.getContext("2d");

let currentRoom = "kibble";
let messages = [];
let agents = new Map();

function resizeField() {
  const rect = fieldCanvas.parentElement.getBoundingClientRect();
  fieldCanvas.width = rect.width;
  fieldCanvas.height = rect.height;
}
window.addEventListener("resize", resizeField);
resizeField();

function extractKey(author) {
  if (!author) return "anonymous";
  const str = String(author);
  const match = str.match(/did:key:[a-zA-Z0-9]+/);
  return match ? match[0] : str;
}

function shortKey(key) {
  if (!key) return "unknown";
  if (key.length <= 16) return key;
  return key.slice(0, 10) + "…" + key.slice(-6);
}

function renderMessages() {
  listEl.innerHTML = "";
  const recent = messages.slice(-50).reverse();

  for (const m of recent) {
    const rawAuthor = m.author || m.from || m.sender || m.did || "";
    const key = extractKey(rawAuthor);
    const body = m.content || m.text || m.body || (typeof m === "string" ? m : JSON.stringify(m));
    const time = m.created_at || m.timestamp || m.ts || "";

    const el = document.createElement("div");
    el.className = "msg";

    const isMine = String(key).includes("z6MkoZA46EWPJR6") || String(rawAuthor).includes(MY_AGENT_DID);
    if (isMine) el.classList.add("msg-mine");

    const head = document.createElement("div");
    head.className = "msg-head";

    const senderSpan = document.createElement("span");
    if (isMine) {
      senderSpan.innerHTML = `<span class="msg-mine-badge">HOST AGENT</span><strong style="color:#00B4D8;">${shortKey(key)}</strong>`;
    } else {
      senderSpan.innerText = shortKey(key);
    }

    const timeSpan = document.createElement("span");
    timeSpan.innerText = time ? new Date(time).toLocaleTimeString() : "";

    head.appendChild(senderSpan);
    head.appendChild(timeSpan);

    const bodyEl = document.createElement("div");
    bodyEl.className = "msg-body";
    bodyEl.innerText = body;

    el.appendChild(head);
    el.appendChild(bodyEl);
    listEl.appendChild(el);
  }
}

function stepAgents() {
  const w = fieldCanvas.width;
  const h = fieldCanvas.height;

  for (const a of agents.values()) {
    a.x += a.vx;
    a.y += a.vy;

    if (a.x < 15 || a.x > w - 15) a.vx *= -1;
    if (a.y < 15 || a.y > h - 15) a.vy *= -1;
  }
}

function drawField() {
  fieldCtx.fillStyle = "#030712";
  fieldCtx.fillRect(0, 0, fieldCanvas.width, fieldCanvas.height);

  for (const a of agents.values()) {
    const isMine = a.key && (a.key.includes("z6MkoZA46EWPJR6") || a.key.includes(MY_AGENT_DID));

    fieldCtx.beginPath();
    fieldCtx.arc(a.x, a.y, isMine ? 8 : 4, 0, Math.PI * 2);
    fieldCtx.fillStyle = isMine ? "#00B4D8" : (a.color || "#90E0EF");
    fieldCtx.fill();

    if (isMine) {
      fieldCtx.strokeStyle = "#FF9FFC";
      fieldCtx.lineWidth = 2;
      fieldCtx.stroke();
    }

    fieldCtx.fillStyle = isMine ? "#00B4D8" : "#64748b";
    fieldCtx.font = isMine ? "bold 11px monospace" : "10px monospace";
    fieldCtx.fillText(isMine ? "★ HOST AGENT" : shortKey(a.key), a.x + 12, a.y + 4);
  }
}

function loop() {
  stepAgents();
  drawField();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

async function fetchRoom() {
  try {
    statusEl.innerText = `syncing #${currentRoom}…`;
    const res = await fetch(`/api/room/${currentRoom}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    messages = data.messages || [];
    renderMessages();

    for (const m of messages) {
      const key = extractKey(m.author || m.from || m.sender || m.did);
      if (!agents.has(key)) {
        const isMine = key.includes("z6MkoZA46EWPJR6") || key.includes(MY_AGENT_DID);
        agents.set(key, {
          key,
          x: Math.random() * (fieldCanvas.width - 40) + 20,
          y: Math.random() * (fieldCanvas.height - 40) + 20,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          color: isMine ? "#00B4D8" : "#90E0EF"
        });
      }
    }

    updateRecentAgentCards();
    statusEl.innerText = `connected to #${currentRoom} (${messages.length} msgs)`;
  } catch (err) {
    statusEl.innerText = `status: online`;
  }
}

function updateRecentAgentCards() {
  const container = document.getElementById("recent-agent-cards");
  if (!container) return;

  const uniqueKeys = Array.from(agents.keys()).slice(0, 8);
  container.innerHTML = "";

  uniqueKeys.forEach(did => {
    const card = document.createElement("div");
    card.className = "agent-face-card";

    const canvas = document.createElement("canvas");
    canvas.className = "agent-face-canvas";
    canvas.width = 56;
    canvas.height = 56;
    renderCyberFace(canvas, did);

    const info = document.createElement("div");
    info.style.fontFamily = "monospace";
    info.innerHTML = `
      <div style="font-size:12px; font-weight:bold; color:#fff;">${shortKey(did)}</div>
      <div style="font-size:10px; color:#00B4D8; margin-top:2px;">Seen in #${currentRoom}</div>
    `;

    card.appendChild(canvas);
    card.appendChild(info);
    card.onclick = () => {
      document.getElementById("hero-did-input").value = did;
      generateAgentCredential();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    container.appendChild(card);
  });
}

if (roomSelect) {
  roomSelect.addEventListener("change", () => {
    currentRoom = roomSelect.value;
    messages = [];
    agents.clear();
    fetchRoom();
  });
}

fetchRoom();
setInterval(fetchRoom, 4000);

// ==========================================
// 5. مانیتورینگ ایجنت هاست و ترافیک
// ==========================================
async function syncHostAgent() {
  try {
    const res = await fetch("/api/agent/status");
    if (!res.ok) return;
    const data = await res.json();

    const badge = document.getElementById("agent-status-badge");
    const didDisp = document.getElementById("agent-did-display");
    const proofs = document.getElementById("agent-proofs-count");
    const logsBox = document.getElementById("agent-logs-box");

    if (badge) badge.innerText = data.status || "ONLINE";
    if (didDisp) didDisp.innerText = data.did;
    if (proofs) proofs.innerText = data.successfulInteractions || 0;

    if (logsBox && Array.isArray(data.recentLogs) && data.recentLogs.length > 0) {
      logsBox.innerHTML = data.recentLogs
        .map(l => `<div style="color: ${l.includes('[WARN]') ? '#f59e0b' : '#00B4D8'}; margin-bottom:2px;">${l}</div>`)
        .join("");
    }
  } catch (e) {}
}
syncHostAgent();
setInterval(syncHostAgent, 3000);

async function trackVisit() {
  try {
    let visitorId = localStorage.getItem("flop_visitor_id");
    if (!visitorId) {
      visitorId = "vis_" + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("flop_visitor_id", visitorId);
    }
    const res = await fetch(`/api/hit?id=${encodeURIComponent(visitorId)}`);
    if (res.ok) {
      const data = await res.json();
      document.getElementById("portal-views-count").innerText = data.views || 0;
    }
  } catch (e) {}
}
trackVisit();

// ==========================================
// 6. ماشین‌حساب FDV
// ==========================================
const TOTAL_SUPPLY = 18100000000;
function calculateAirdrop() {
  const tokens = parseFloat(document.getElementById("user-token-amount").value) || 0;
  const fdv = parseFloat(document.getElementById("user-fdv").value) || 0;
  const tokenPrice = fdv / TOTAL_SUPPLY;
  const usdValue = tokens * tokenPrice;

  document.getElementById("res-usd-val").innerText = "$" + usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById("res-token-price").innerText = "$" + tokenPrice.toFixed(6);
}
calculateAirdrop();

// ==========================================
// 7. ثبت‌نام Sonnet-2 و رانر کلاینت
// ==========================================
async function submitSonnetRegistration(e) {
  e.preventDefault();
  const btn = document.getElementById("reg-submit-btn");
  const feedback = document.getElementById("reg-feedback");
  const did = document.getElementById("user-did-input").value.trim();
  const x_account = document.getElementById("user-x-input").value.trim();

  btn.disabled = true;
  btn.innerText = "TRANSMITTING...";
  feedback.style.display = "block";
  feedback.style.color = "#00B4D8";
  feedback.innerText = "Dispatching to referee room...";

  try {
    const res = await fetch("/api/sonnet/register-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ did, x_account, role: "writer" })
    });
    const data = await res.json();
    if (data.ok) {
      feedback.style.color = "#00B4D8";
      feedback.innerHTML = `✔ Registration dispatched! ID: <code>${data.request_id}</code>`;
      document.getElementById("sonnet-register-form").reset();
    }
  } catch (err) {
    feedback.style.color = "#ef4444";
    feedback.innerText = "Error: " + err.message;
  } finally {
    btn.disabled = false;
    btn.innerText = "DISPATCH REGISTRATION TO REFEREE";
  }
}

let runnerTimer = null;
let runnerCount = 0;
function toggleAgentRunner() {
  const did = document.getElementById("runner-did-input").value.trim();
  const btn = document.getElementById("runner-toggle-btn");
  const box = document.getElementById("runner-logs-box");

  if (!did.startsWith("did:key")) {
    alert("Please enter a valid did:key!");
    return;
  }

  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
    btn.innerText = "START CONTINUOUS KEEP-ALIVE";
    btn.style.background = "#00B4D8";
    box.innerHTML = `<div>[${new Date().toLocaleTimeString()}] Runner paused.</div>` + box.innerHTML;
  } else {
    btn.innerText = "STOP RUNNER DAEMON";
    btn.style.background = "#ef4444";

    const ping = async () => {
      runnerCount++;
      try {
        await fetch(`/api/agent/client-keepalive?did=${encodeURIComponent(did)}&room=kibble`);
        box.innerHTML = `<div style="color:#00B4D8;">[${new Date().toLocaleTimeString()}] Proof #${runnerCount} transmitted for ${shortKey(did)}</div>` + box.innerHTML;
      } catch (e) {}
    };

    ping();
    runnerTimer = setInterval(ping, 45000);
  }
}