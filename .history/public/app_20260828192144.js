const COLORS = {
  job: "#8a8f7a",
  claim: "#3b82f6",
  result: "#22d3ee",
  attest: "#62c46b",
  reject: "#e05656",
  talk: "#d7b15a",
};

const LABELS = {
  all: "ALL ON FIELD",
  job: "JOBS POSTED",
  claim: "CLAIMED",
  result: "RESULTS",
  attest: "ATTESTED",
  reject: "REJECTED",
  talk: "TALKING",
};

const BODY = ["#5b8a4a", "#6e9b56", "#4e7a3f", "#7aa35c", "#3f6b38"];
const SKIN = ["#f0c7a0", "#e2b48a", "#c48a62", "#f5d0b0"];

const agents = new Map();
const history = [];
const MAX_POINTS = 36;

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const chart = document.getElementById("chart");
const cctx = chart.getContext("2d");
const statsEl = document.getElementById("stats");
const statusEl = document.getElementById("status");
const roomEl = document.getElementById("room");
const headlineEl = document.getElementById("headline");

let room = "kibble";
let lastSeq = 0;
let filter = "all";
let lastBucket = -1;
let w = 0, h = 0, cw = 0, ch = 0;
let bubbles = [];

function resize() {
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = w * devicePixelRatio;
  canvas.height = h * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  cw = chart.clientWidth;
  ch = chart.clientHeight;
  chart.width = cw * devicePixelRatio;
  chart.height = ch * devicePixelRatio;
  cctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
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
  return msg.did || msg.did_key || msg.key || msg.from || msg.nick || msg.author || "unknown";
}
function msgText(msg) {
  return msg.text || msg.body || msg.message || msg.content || "";
}
function msgSeq(msg) {
  return Number(msg.seq ?? msg.id ?? msg.n ?? 0);
}
function hash(s) {
  let n = 0;
  for (const ch of String(s)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n;
}

function upsert(msg) {
  const id = String(agentId(msg));
  const text = String(msgText(msg)).slice(0, 140);
  const type = classify(text);
  const now = Date.now();
  const existing = agents.get(id);

  if (existing) {
    existing.lastText = text;
    existing.lastType = type;
    existing.lastSeen = now;
    existing.fade = 1;
  } else {
    const n = hash(id);
    agents.set(id, {
      id,
      lastText: text,
      lastType: type,
      lastSeen: now,
      fade: 1,
      x: 30 + (n % Math.max(40, w - 60)),
      y: 40 + ((n >> 8) % Math.max(40, h - 80)),
      vx: ((n % 7) - 3) * 0.12,
      vy: (((n >> 3) % 7) - 3) * 0.12,
      body: BODY[n % BODY.length],
      skin: SKIN[(n >> 4) % SKIN.length],
    });
  }

  if (text) {
    bubbles.unshift({ id, text, until: now + 8000 });
    bubbles = bubbles.slice(0, 8);
  }
  const seq = msgSeq(msg);
  if (seq > lastSeq) lastSeq = seq;
}

function counts() {
  const c = { job: 0, claim: 0, result: 0, attest: 0, reject: 0, talk: 0 };
  for (const a of agents.values()) {
    if (a.fade > 0.08 && c[a.lastType] !== undefined) c[a.lastType] += 1;
  }
  c.all = Object.values(c).reduce((s, n) => s + n, 0);
  return c;
}

function recordHistory() {
  const minute = Math.floor(Date.now() / 60000);
  const c = counts();
  if (lastBucket === minute && history.length) history[history.length - 1] = { t: minute, ...c };
  else {
    history.push({ t: minute, ...c });
    lastBucket = minute;
    if (history.length > MAX_POINTS) history.shift();
  }
}

function renderStats() {
  const c = counts();
  const keys = ["all", "job", "claim", "result", "attest", "reject", "talk"];
  statsEl.innerHTML = keys.map((k) => {
    const active = filter === k ? "active" : "";
    const color = k === "all" ? "#efe7c8" : COLORS[k];
    return `<button class="stat ${active}" data-type="${k}">${LABELS[k]} <b style="color:${color}">${c[k] || 0}</b></button>`;
  }).join("");
  headlineEl.textContent = `${c.all} AGENTS ON THE ${room.toUpperCase()} FIELD`;
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
    statusEl.textContent = `${room} · ${c.all} figures · seq ${lastSeq} · click a chip to isolate`;
    renderStats();
    recordHistory();
  } catch (err) {
    statusEl.textContent = `error: ${err.message}`;
  }
}

function drawField() {
  ctx.fillStyle = "#4f7a3b";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(30,50,22,0.18)";
  for (let y = 0; y < h; y += 28) {
    for (let x = 0; x < w; x += 34) {
      ctx.fillRect(x + ((y / 28) % 2) * 8, y, 18, 14);
    }
  }
}

function drawPerson(a) {
  const shirt = COLORS[a.lastType] || a.body;
  ctx.globalAlpha = a.fade;

  ctx.fillStyle = a.skin;
  ctx.beginPath();
  ctx.arc(a.x, a.y - 10, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shirt;
  ctx.fillRect(a.x - 4.5, a.y - 6, 9, 9);

  ctx.fillStyle = "#2b2a24";
  ctx.fillRect(a.x - 3.6, a.y + 3, 3, 6);
  ctx.fillRect(a.x + 0.6, a.y + 3, 3, 6);

  ctx.globalAlpha = 1;
}

function wrapText(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (next.length > max) {
      if (line) lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function drawBubbles() {
  const now = Date.now();
  bubbles = bubbles.filter((b) => b.until > now);
  const shown = bubbles.filter((b) => {
    const a = agents.get(b.id);
    return a && a.fade > 0.4 && (filter === "all" || a.lastType === filter);
  }).slice(0, 6);

  shown.forEach((b, i) => {
    const a = agents.get(b.id);
    const lines = wrapText(b.text, 28);
    const bw = 190;
    const bh = 16 + lines.length * 13;
    const bx = Math.min(w - bw - 8, Math.max(8, a.x - 40 + (i % 3) * 12));
    const by = Math.max(8, a.y - 58 - (i % 2) * 10);

    ctx.fillStyle = "#f4efe0";
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#222";
    ctx.font = "11px sans-serif";
    lines.forEach((ln, n) => ctx.fillText(ln, bx + 8, by + 16 + n * 13));
  });
}

function drawChart() {
  cctx.fillStyle = "#14160f";
  cctx.fillRect(0, 0, cw, ch);

  const keys = filter === "all"
    ? ["talk", "job", "claim", "result", "attest", "reject"]
    : [filter];

  const points = history.length
    ? history
    : [{ job: 0, claim: 0, result: 0, attest: 0, reject: 0, talk: 0, all: 0 }];

  let max = 1;
  for (const p of points) {
    const sum = keys.reduce((s, k) => s + (p[k] || 0), 0);
    max = Math.max(max, filter === "all" ? sum : (p[keys[0]] || 0));
  }

  const pad = { l: 10, r: 10, t: 10, b: 10 };
  const innerW = cw - pad.l - pad.r;
  const innerH = ch - pad.t - pad.b;

  function xAt(i) {
    return points.length === 1 ? pad.l : pad.l + (innerW * i) / (points.length - 1);
  }

  if (filter === "all") {
    const acc = points.map(() => 0);
    for (const k of keys) {
      cctx.beginPath();
      points.forEach((p, i) => {
        acc[i] += p[k] || 0;
        const y = pad.t + innerH - (innerH * acc[i]) / max;
        if (i === 0) cctx.moveTo(xAt(i), y);
        else cctx.lineTo(xAt(i), y);
      });
      for (let i = points.length - 1; i >= 0; i--) {
        const below = acc[i] - (points[i][k] || 0);
        const y = pad.t + innerH - (innerH * below) / max;
        cctx.lineTo(xAt(i), y);
      }
      cctx.closePath();
      cctx.globalAlpha = 0.85;
      cctx.fillStyle = COLORS[k];
      cctx.fill();
      cctx.globalAlpha = 1;
    }
  } else {
    const k = keys[0];
    cctx.beginPath();
    points.forEach((p, i) => {
      const y = pad.t + innerH - (innerH * (p[k] || 0)) / max;
      if (i === 0) cctx.moveTo(xAt(i), y);
      else cctx.lineTo(xAt(i), y);
    });
    cctx.lineTo(xAt(points.length - 1), pad.t + innerH);
    cctx.lineTo(xAt(0), pad.t + innerH);
    cctx.closePath();
    cctx.fillStyle = COLORS[k];
    cctx.globalAlpha = 0.8;
    cctx.fill();
    cctx.globalAlpha = 1;
  }

  cctx.fillStyle = "#cbbf8f";
  cctx.font = "11px sans-serif";
  cctx.fillText("agents / minute", 12, 16);
}

function tick() {
  const now = Date.now();
  drawField();

  for (const a of agents.values()) {
    const age = now - a.lastSeen;
    a.fade = age < 20000 ? 1 : Math.max(0, 1 - (age - 20000) / 25000);
    if (a.fade <= 0) continue;
    if (filter !== "all" && a.lastType !== filter) continue;

    a.x += a.vx;
    a.y += a.vy;
    if (Math.random() < 0.02) {
      a.vx = (Math.random() - 0.5) * 0.5;
      a.vy = (Math.random() - 0.5) * 0.5;
    }
    if (a.x < 12 || a.x > w - 12) a.vx *= -1;
    if (a.y < 18 || a.y > h - 12) a.vy *= -1;
    drawPerson(a);
  }

  drawBubbles();
  drawChart();
  requestAnimationFrame(tick);
}

roomEl.addEventListener("change", () => {
  room = roomEl.value;
  agents.clear();
  bubbles = [];
  history.length = 0;
  lastSeq = 0;
  lastBucket = -1;
  filter = "all";
  poll();
});

poll();
setInterval(poll, 4000);
tick();