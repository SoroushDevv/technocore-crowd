const roomSelect = document.getElementById("room");
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const fieldCanvas = document.getElementById("field");
const fieldCtx = fieldCanvas.getContext("2d");

// شناسه رسمی شما جهت برجسته‌سازی اختصاصی در پیام‌ها
const MY_AGENT_DID = "did:key:z6MkoZA46EWPJR6HSFD92hEfGVGpLCE9YJvC7cDviwrQ8crj";

let currentRoom = "kibble";
let messages = [];
let agents = new Map();
let filterType = null;

function resize() {
  const rect = fieldCanvas.parentElement.getBoundingClientRect();
  fieldCanvas.width = rect.width;
  fieldCanvas.height = rect.height;
}
window.addEventListener("resize", resize);
resize();

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

function updateStats() {
  const types = {};
  for (const a of agents.values()) {
    types[a.type] = (types[a.type] || 0) + 1;
  }
  statsEl.innerHTML = "";
  for (const [type, count] of Object.entries(types)) {
    const pill = document.createElement("div");
    pill.className = `stat-pill ${filterType === type ? "active" : ""}`;
    pill.innerText = `${type}: ${count}`;
    pill.onclick = () => {
      filterType = filterType === type ? null : type;
      updateStats();
    };
    statsEl.appendChild(pill);
  }
}

function renderMessages() {
  listEl.innerHTML = "";
  const recent = messages.slice(-40).reverse();

  for (const m of recent) {
    const key = extractKey(m.author || m.from || m.sender || m.did);
    const body = m.content || m.text || m.body || (typeof m === "string" ? m : JSON.stringify(m));
    const time = m.created_at || m.timestamp || m.ts || "";

    const el = document.createElement("div");
    el.className = "msg";

    // اگر پیام متعلق به DID اختصاصی شما بود، درخشان و متمایز شود
    const isMine = key && key.includes(MY_AGENT_DID);
    if (isMine) {
      el.classList.add("msg-mine");
    }

    const head = document.createElement("div");
    head.className = "msg-head";

    const senderSpan = document.createElement("span");
    if (isMine) {
      senderSpan.innerHTML = `<span class="msg-mine-badge">YOUR AGENT</span><strong style="color:#00ff66;">${shortKey(key)}</strong>`;
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
    if (filterType && a.type !== filterType) continue;

    const isMine = a.key && a.key.includes(MY_AGENT_DID);

    fieldCtx.beginPath();
    fieldCtx.arc(a.x, a.y, isMine ? 8 : 4, 0, Math.PI * 2);
    fieldCtx.fillStyle = isMine ? "#00ff66" : (a.color || "#38bdf8");
    fieldCtx.fill();

    if (isMine) {
      fieldCtx.strokeStyle = "#ffffff";
      fieldCtx.lineWidth = 2;
      fieldCtx.stroke();
    }

    fieldCtx.fillStyle = isMine ? "#00ff66" : "#64748b";
    fieldCtx.font = isMine ? "bold 11px monospace" : "10px monospace";
    fieldCtx.fillText(isMine ? "★ YOUR AGENT" : shortKey(a.key), a.x + 10, a.y + 3);
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

    // همگام‌سازی موقعیت و برچسب ایجنت‌ها در میدان
    for (const m of messages) {
      const key = extractKey(m.author || m.from || m.sender || m.did);
      if (!agents.has(key)) {
        const isMine = key.includes(MY_AGENT_DID);
        agents.set(key, {
          key,
          x: Math.random() * (fieldCanvas.width - 40) + 20,
          y: Math.random() * (fieldCanvas.height - 40) + 20,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          type: isMine ? "OWNER_AGENT" : (key.startsWith("did:key") ? "ED25519" : "HUMAN"),
          color: isMine ? "#00ff66" : "#38bdf8"
        });
      }
    }

    updateStats();
    statusEl.innerText = `connected to #${currentRoom} (${messages.length} msgs)`;
  } catch (err) {
    statusEl.innerText = `error: ${err.message}`;
  }
}

roomSelect.addEventListener("change", () => {
  currentRoom = roomSelect.value;
  messages = [];
  agents.clear();
  fetchRoom();
});

fetchRoom();
setInterval(fetchRoom, 4000);