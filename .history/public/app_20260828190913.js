const COLORS = {
  job: "#9aa0a6",
  claim: "#3b82f6",
  result: "#22d3ee",
  attest: "#22c55e",
  reject: "#ef4444",
  talk: "#94a3b8",
};

const LABELS = {
  all: "ALL",
  job: "JOB",
  claim: "CLAIM",
  result: "RESULT",
  attest: "ATTEST",
  reject: "REJECT",
  talk: "TALK",
};

const agents = new Map();
const stars = [];
const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const roomEl = document.getElementById("room");
const statsEl = document.getElementById("stats");

let room = "kibble";
let lastSeq = 0;
let filter = "all";
let w = 0;
let h = 0;

function resize() {
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = w * devicePixelRatio;
  canvas.height = h * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  if (!stars.length) seedStars();
}
window.addEventListener("resize", resize);
resize();

function seedStars() {
  stars.length = 0;
  const n = 90;
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() * 1.6 + 0.3,
      a: Math.random() * 0.6 + 0.2,
    });
  }
}

function classify(text) {
  const t = String(text || "");
  if (/JOB\s*v1/i.test(t)) return "job";
  if (/CLAIM\s*v1/i.test(t)) return "claim";
  if (/RESULT\s*v1|DELIVER\s*v1/i.test(t)) return "result";
  if (/ATTEST/i.test(t) && /\bnot\b/i.test(t)) return "reject";
  if (/ATTEST/i.test(t) && /useful/i.test(t)) return "attest";
  return "talk";
}

function agentId(msg) {
  return (
    msg.did ||
    msg.did_key ||
    msg.key ||
    msg.from ||
    msg.nick ||
    msg.author ||
    "unknown"
  );
}

function msgText(msg) {
  return msg.text || msg.body || msg.message || msg.content || "";
}

function msgSeq(msg) {
  return Number(msg.seq ?? msg.id ?? msg.n ?? 0);
}

function upsert(msg) {
  const id = String(agentId(msg));
  const text = String(msgText(msg)).slice(0, 180);
  const type = classify(text);
  const existing = agents.get(id);
  const now = Date.now();

  if (existing) {
    existing.lastText = text;
    existing.lastType = type;
    existing.lastSeen = now;
    existing.fade = 1;
  } else {
    agents.set(id, {
      id,
      lastText: text,
      lastType: type,
      lastSeen: now,
      fade: 1,
      x: 50 + Math.random() * Math.max(40, w - 100),
      y: 50 + Math.random() * Math.max(40, h - 100),
      angle: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.7,
    });
  }

  const seq = msgSeq(msg);
  if (seq > lastSeq) lastSeq = seq;
}

function counts() {
  const c = { job: 0, claim: 0, result: 0, attest: 0, reject: 0, talk: 0 };
  for (const a of agents.values()) {
    if (a.fade > 0.05 && c[a.lastType] !== undefined) c[a.lastType] += 1;
  }
  c.all = Object.values(c).reduce((s, n) => s + n, 0);
  return c;
}

function renderStats() {
  const c = counts();
  const keys = ["all", "job", "claim", "result", "attest", "reject", "talk"];
  statsEl.innerHTML = keys
    .map((k) => {
      const color = k === "all" ? "#e2e8f0" : COLORS[k];
      const active = filter === k ? "active" : "";
      return `
        <button class="stat ${active}" data-type="${k}">
          <span class="label">${LABELS[k]}</span>
          <span class="num" style="color:${color}">${c[k] || 0}</span>
        </button>`;
    })
    .join("");
}

statsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".stat");
  if (!btn) return;
  const type = btn.dataset.type;
  filter = filter === type && type !== "all" ? "all" : type;
  renderStats();
});

async function poll() {
  try {
    const q = lastSeq ? `?since=${lastSeq}` : "";
    const res = await fetch(`/api/room/${room}${q}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const messages = Array.isArray(data.messages) ? data.messages : [];
    for (const msg of messages) upsert(msg);
    const c = counts();
    statusEl.textContent = `${room} · ${c.all} ships · seq ${lastSeq}`;
    renderStats();
  } catch (err) {
    statusEl.textContent = `error: ${err.message}`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderList() {
  const rows = [...agents.values()]
    .filter((a) => filter === "all" || a.lastType === filter)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 40);

  listEl.innerHTML = rows
    .map(
      (a) => `
      <div class="agent">
        <span class="dot" style="background:${COLORS[a.lastType]}"></span>
        <strong>${escapeHtml(a.id.slice(0, 28))}</strong>
        <div class="msg">${escapeHtml(a.lastText)}</div>
      </div>`
    )
    .join("");
}

function drawSpace() {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 20, w * 0.5, h * 0.5, Math.max(w, h));
  g.addColorStop(0, "#10182c");
  g.addColorStop(1, "#05070d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (const s of stars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = "#dbe7ff";
    ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function drawShip(a) {
  const color = COLORS[a.lastType] || COLORS.talk;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.angle);
  ctx.globalAlpha = a.fade;

  ctx.fillStyle = "rgba(125, 211, 252, 0.18)";
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-6, 5);
  ctx.lineTo(-6, -5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, -8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.arc(4, 0, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.globalAlpha = a.fade;
  ctx.fillStyle = "#dbe7f5";
  ctx.font = "11px sans-serif";
  ctx.fillText(a.id.slice(0, 16), a.x + 14, a.y - 10);
  if (filter !== "all" || a.fade > 0.7) {
    ctx.fillStyle = "#9fb0c6";
    ctx.fillText(a.lastText.slice(0, 36), a.x + 14, a.y + 6);
  }
  ctx.globalAlpha = 1;
}

function tick() {
  const now = Date.now();
  drawSpace();

  for (const a of agents.values()) {
    const age = now - a.lastSeen;
    a.fade = age < 15000 ? 1 : Math.max(0, 1 - (age - 15000) / 25000);
    if (a.fade <= 0) continue;
    if (filter !== "all" && a.lastType !== filter) continue;

    a.x += Math.cos(a.angle) * a.speed;
    a.y += Math.sin(a.angle) * a.speed;
    a.angle += (Math.random() - 0.5) * 0.04;

    if (a.x < 20) a.angle = 0;
    if (a.x > w - 20) a.angle = Math.PI;
    if (a.y < 20) a.angle = Math.PI / 2;
    if (a.y > h - 20) a.angle = -Math.PI / 2;

    drawShip(a);
  }

  renderList();
  requestAnimationFrame(tick);
}

roomEl.addEventListener("change", () => {
  room = roomEl.value;
  agents.clear();
  lastSeq = 0;
  filter = "all";
  statusEl.textContent = `switching to ${room}…`;
  poll();
});

poll();
setInterval(poll, 4000);
tick();