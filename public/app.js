const COLORS = {
  job: "#9aa0a6",
  claim: "#3b82f6",
  result: "#22d3ee",
  attest: "#62c46b",
  reject: "#e05656",
  talk: "#f4d35e",
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

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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
const listEl = document.getElementById("list");

let room = "kibble";
let lastSeq = 0;
let filter = "all";
let lastBucket = -1;
let w = 0;
let h = 0;
let cw = 0;
let ch = 0;
let bubbles = [];
let maze = { cols: 0, rows: 0, cell: 22, walk: new Set(), dots: new Map() };

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

  buildMaze();
}
window.addEventListener("resize", resize);
resize();

function key(c, r) {
  return c + "," + r;
}

function buildMaze() {
  const cell = 22;
  const cols = Math.max(11, Math.floor(w / cell));
  const rows = Math.max(9, Math.floor(h / cell));
  const walk = new Set();
  const dots = new Map();

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const corridor = c % 2 === 1 || r % 2 === 1;
      const block = c % 4 === 0 && r % 4 === 0;
      if (corridor && !block) {
        walk.add(key(c, r));
        if ((c + r) % 2 === 0) dots.set(key(c, r), true);
      }
    }
  }

  maze = { cols, rows, cell, walk, dots };
}

function isWalk(c, r) {
  return maze.walk.has(key(c, r));
}

function cellCenter(c, r) {
  return {
    x: (c + 0.5) * maze.cell,
    y: (r + 0.5) * maze.cell,
  };
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

function randomWalkCell(n) {
  const cells = [...maze.walk];
  if (!cells.length) return { c: 1, r: 1 };
  const pick = cells[n % cells.length].split(",");
  return { c: Number(pick[0]), r: Number(pick[1]) };
}

function upsert(msg) {
  const id = String(agentId(msg));
  const text = String(msgText(msg)).slice(0, 140);
  const type = classify(text);
  const now = Date.now();
  const existing = agents.get(id);
  const n = hash(id);

  if (existing) {
    existing.lastText = text;
    existing.lastType = type;
    existing.lastSeen = now;
    existing.fade = 1;
  } else {
    const start = randomWalkCell(n);
    const pos = cellCenter(start.c, start.r);
    agents.set(id, {
      id,
      lastText: text,
      lastType: type,
      lastSeen: now,
      fade: 1,
      c: start.c,
      r: start.r,
      x: pos.x,
      y: pos.y,
      dir: DIRS[n % 4],
      mouth: 0,
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
  if (lastBucket === minute && history.length) {
    history[history.length - 1] = { t: minute, ...c };
  } else {
    history.push({ t: minute, ...c });
    lastBucket = minute;
    if (history.length > MAX_POINTS) history.shift();
  }
}

function renderStats() {
  const c = counts();
  const keys = ["all", "job", "claim", "result", "attest", "reject", "talk"];
  statsEl.innerHTML = keys
    .map((k) => {
      const active = filter === k ? "active" : "";
      const color = k === "all" ? "#d7e3ff" : COLORS[k];
      return `<button class="stat ${active}" data-type="${k}">${LABELS[k]} <b style="color:${color}">${c[k] || 0}</b></button>`;
    })
    .join("");
  if (headlineEl) headlineEl.textContent = `${c.all} AGENTS IN THE CORRIDORS`;
}

statsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".stat");
  if (!btn) return;
  const type = btn.dataset.type;
  filter = filter === type && type !== "all" ? "all" : type;
  renderStats();
  renderList();
});

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderList() {
  if (!listEl) return;
  const rows = [...agents.values()]
    .filter((a) => filter === "all" || a.lastType === filter)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 40);

  listEl.innerHTML = rows
    .map(
      (a) => `
      <div class="agent">
        <div class="agent-id">
          <span class="dot" style="background:${COLORS[a.lastType]}"></span>
          <strong>${escapeHtml(a.id.slice(0, 28))}</strong>
        </div>
        <div class="msg">${escapeHtml(a.lastText)}</div>
      </div>`
    )
    .join("");
}

function apiRoomUrl() {
  const useProxy =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname.endsWith(".onrender.com");
  const q = lastSeq ? `?since=${lastSeq}` : "";
  if (useProxy) return `/api/room/${encodeURIComponent(room)}${q}`;
  return `https://technocore.chat/r/${encodeURIComponent(room)}?format=json&limit=200${
    lastSeq ? `&since=${lastSeq}` : ""
  }`;
}

async function poll() {
  try {
    const res = await fetch(apiRoomUrl());
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const messages = Array.isArray(data)
      ? data
      : Array.isArray(data.messages)
        ? data.messages
        : [];
    for (const msg of messages) upsert(msg);
    const c = counts();
    statusEl.textContent = `${room} · ${c.all} runners · seq ${lastSeq}`;
    renderStats();
    recordHistory();
    renderList();
  } catch (err) {
    statusEl.textContent = `error: ${err.message}`;
  }
}

function drawMaze() {
  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, w, h);

  const { cell, cols, rows } = maze;
  ctx.fillStyle = "#0a1a6a";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isWalk(c, r)) continue;
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }

  ctx.strokeStyle = "#2d4bff";
  ctx.lineWidth = 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isWalk(c, r)) continue;
      const x = c * cell;
      const y = r * cell;
      if (!isWalk(c, r - 1)) {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 3);
        ctx.lineTo(x + cell - 3, y + 3);
        ctx.stroke();
      }
      if (!isWalk(c, r + 1)) {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + cell - 3);
        ctx.lineTo(x + cell - 3, y + cell - 3);
        ctx.stroke();
      }
      if (!isWalk(c - 1, r)) {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 3);
        ctx.lineTo(x + 3, y + cell - 3);
        ctx.stroke();
      }
      if (!isWalk(c + 1, r)) {
        ctx.beginPath();
        ctx.moveTo(x + cell - 3, y + 3);
        ctx.lineTo(x + cell - 3, y + cell - 3);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = "#f2d9a0";
  for (const [k, on] of maze.dots) {
    if (!on) continue;
    const [c, r] = k.split(",").map(Number);
    const p = cellCenter(c, r);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function turnIfNeeded(a) {
  const options = DIRS.filter(([dc, dr]) => isWalk(a.c + dc, a.r + dr));
  if (!options.length) return;
  const forward = isWalk(a.c + a.dir[0], a.r + a.dir[1]);
  if (forward && Math.random() > 0.18) return;
  a.dir = options[Math.floor(Math.random() * options.length)];
}

function moveAgent(a) {
  const target = cellCenter(a.c + a.dir[0], a.r + a.dir[1]);
  const speed = 1.35;
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  const dist = Math.hypot(dx, dy);

  if (!isWalk(a.c + a.dir[0], a.r + a.dir[1]) || dist < speed) {
    if (isWalk(a.c + a.dir[0], a.r + a.dir[1])) {
      a.c += a.dir[0];
      a.r += a.dir[1];
      const here = key(a.c, a.r);
      if (maze.dots.get(here)) maze.dots.set(here, false);
    }
    const pos = cellCenter(a.c, a.r);
    a.x = pos.x;
    a.y = pos.y;
    turnIfNeeded(a);
  } else {
    a.x += (dx / dist) * speed;
    a.y += (dy / dist) * speed;
  }
  a.mouth += 0.18;
}

function drawRunner(a) {
  const color = COLORS[a.lastType] || COLORS.talk;
  const open = 0.25 + Math.abs(Math.sin(a.mouth)) * 0.45;
  let start = open;
  let end = Math.PI * 2 - open;

  if (a.dir[0] === -1) {
    start += Math.PI;
    end += Math.PI;
  } else if (a.dir[1] === 1) {
    start += Math.PI / 2;
    end += Math.PI / 2;
  } else if (a.dir[1] === -1) {
    start -= Math.PI / 2;
    end -= Math.PI / 2;
  }

  ctx.globalAlpha = a.fade;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.arc(a.x, a.y, 7.2, start, end);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function wrapText(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function drawBubbles() {
  const now = Date.now();
  bubbles = bubbles.filter((b) => b.until > now);
  const shown = bubbles
    .filter((b) => {
      const a = agents.get(b.id);
      return a && a.fade > 0.4 && (filter === "all" || a.lastType === filter);
    })
    .slice(0, 6);

  shown.forEach((b, i) => {
    const a = agents.get(b.id);
    const lines = wrapText(b.text, 28);
    const bw = 190;
    const bh = 16 + lines.length * 13;
    const bx = Math.min(w - bw - 8, Math.max(8, a.x - 40 + (i % 3) * 12));
    const by = Math.max(8, a.y - 58 - (i % 2) * 10);

    ctx.fillStyle = "#f4efe0";
    ctx.strokeStyle = "#111";
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
  cctx.fillStyle = "#070914";
  cctx.fillRect(0, 0, cw, ch);

  const keys =
    filter === "all"
      ? ["talk", "job", "claim", "result", "attest", "reject"]
      : [filter];

  const points = history.length
    ? history
    : [{ job: 0, claim: 0, result: 0, attest: 0, reject: 0, talk: 0, all: 0 }];

  let max = 1;
  for (const p of points) {
    const sum = keys.reduce((s, k) => s + (p[k] || 0), 0);
    max = Math.max(max, filter === "all" ? sum : p[keys[0]] || 0);
  }

  const pad = { l: 10, r: 10, t: 10, b: 10 };
  const innerW = cw - pad.l - pad.r;
  const innerH = ch - pad.t - pad.b;
  const xAt = (i) => (points.length === 1 ? pad.l : pad.l + (innerW * i) / (points.length - 1));

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

  cctx.fillStyle = "#9bb0d6";
  cctx.font = "11px sans-serif";
  cctx.fillText("agents / minute", 12, 16);
}

function tick() {
  const now = Date.now();
  drawMaze();

  for (const a of agents.values()) {
    const age = now - a.lastSeen;
    a.fade = age < 20000 ? 1 : Math.max(0, 1 - (age - 20000) / 25000);
    if (a.fade <= 0) continue;
    if (filter !== "all" && a.lastType !== filter) continue;
    moveAgent(a);
    drawRunner(a);
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
  buildMaze();
  poll();
});

poll();
setInterval(poll, 4000);
tick();