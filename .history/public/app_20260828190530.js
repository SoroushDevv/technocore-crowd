const COLORS = {
  job: "#9aa0a6",
  claim: "#3b82f6",
  result: "#22d3ee",
  attest: "#22c55e",
  reject: "#ef4444",
  talk: "#64748b",
};

const agents = new Map();
const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const roomEl = document.getElementById("room");

let room = "kibble";
let lastSeq = 0;
let w = 0;
let h = 0;

function resize() {
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = w * devicePixelRatio;
  canvas.height = h * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

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
      x: 40 + Math.random() * Math.max(40, w - 80),
      y: 40 + Math.random() * Math.max(40, h - 80),
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
    });
  }

  const seq = msgSeq(msg);
  if (seq > lastSeq) lastSeq = seq;
}

async function poll() {
  try {
    const q = lastSeq ? `?since=${lastSeq}` : "";
    const res = await fetch(`/api/room/${room}${q}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const messages = Array.isArray(data.messages) ? data.messages : [];
    for (const msg of messages) upsert(msg);

    statusEl.textContent = `${room} · agents ${agents.size} · last seq ${lastSeq} · msgs ${messages.length}`;
  } catch (err) {
    statusEl.textContent = `error: ${err.message}`;
  }
}

function renderList() {
  const rows = [...agents.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 40);

  listEl.innerHTML = rows
    .map(
      (a) => `
      <div class="agent">
        <span class="dot" style="background:${COLORS[a.lastType]}"></span>
        <strong>${a.id.slice(0, 28)}</strong>
        <div class="msg">${escapeHtml(a.lastText)}</div>
      </div>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function tick() {
  const now = Date.now();
  ctx.clearRect(0, 0, w, h);

  for (const a of agents.values()) {
    const age = now - a.lastSeen;
    a.fade = age < 15000 ? 1 : Math.max(0, 1 - (age - 15000) / 25000);

    if (a.fade > 0.15) {
      a.x += a.vx;
      a.y += a.vy;
      if (a.x < 16 || a.x > w - 16) a.vx *= -1;
      if (a.y < 16 || a.y > h - 16) a.vy *= -1;
    }

    if (a.fade <= 0) continue;

    ctx.globalAlpha = a.fade;
    ctx.fillStyle = COLORS[a.lastType] || COLORS.talk;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#dbe7f5";
    ctx.font = "11px sans-serif";
    ctx.fillText(a.id.slice(0, 16), a.x + 10, a.y - 8);
    if (a.lastText) {
      ctx.fillStyle = "#9fb0c6";
      ctx.fillText(a.lastText.slice(0, 42), a.x + 10, a.y + 6);
    }
  }

  ctx.globalAlpha = 1;
  renderList();
  requestAnimationFrame(tick);
}

roomEl.addEventListener("change", () => {
  room = roomEl.value;
  agents.clear();
  lastSeq = 0;
  statusEl.textContent = `switching to ${room}…`;
  poll();
});

poll();
setInterval(poll, 4000);
tick();