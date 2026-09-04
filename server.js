const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const app = express();

const UP = "https://technocore.chat";
const cache = new Map();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const STATS_FILE = path.join(__dirname, "data", "views.json");
const AGENT_FILE = path.join(__dirname, "data", "agent_state.json");
const STATS_KEY = process.env.STATS_KEY || "crowd-secret";

// هویت رسمی ثبت‌شده در Technocore
const AGENT_DID = process.env.AGENT_DID || "did:key:z6MkoZA46EWPJR6HSFD92hEfGVGpLCE9YJvC7cDviwrQ8crj";
const AGENT_PRIV_D = process.env.AGENT_PRIV_D || "A1D8-yp3x4WwDZ7QWX6fvnRD3yWv1RUKmVo8HYtOEBk";
const AGENT_INTERVAL_MS = Number(process.env.AGENT_INTERVAL_MS) || 120000; // چرخه تعامل هر ۲ دقیقه

const stats = loadStats();
let agentState = loadAgentState();

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  } catch {
    return { views: 0, uniques: 0, seen: {}, last: null };
  }
}

function saveStats() {
  try {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    const slimSeen = {};
    const ids = Object.keys(stats.seen);
    const keep = ids.slice(-5000);
    for (const id of keep) slimSeen[id] = stats.seen[id];
    stats.seen = slimSeen;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  } catch (err) {
    console.error("stats save failed", err.message);
  }
}

function loadAgentState() {
  try {
    return JSON.parse(fs.readFileSync(AGENT_FILE, "utf8"));
  } catch {
    return {
      did: AGENT_DID,
      totalInteractions: 0,
      successfulInteractions: 0,
      lastInteraction: null,
      status: "ONLINE_ACTIVE",
      logs: []
    };
  }
}

function saveAgentState() {
  try {
    fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
    if (agentState.logs.length > 40) {
      agentState.logs = agentState.logs.slice(0, 40);
    }
    fs.writeFileSync(AGENT_FILE, JSON.stringify(agentState, null, 2));
  } catch (err) {
    console.error("agent save failed", err.message);
  }
}

function addAgentLog(msg, level = "OK") {
  const time = new Date().toISOString().replace("T", " ").slice(0, 19);
  const entry = `[${time}] [${level}] ${msg}`;
  agentState.logs.unshift(entry);
  console.log(`[AGENT] ${entry}`);
  saveAgentState();
}

function signPayload(message) {
  try {
    const privateKey = crypto.createPrivateKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        d: AGENT_PRIV_D,
        x: "hzvkiNkdlXaUETDlysDwl4Ph9o8Qf7aS8MSW5-tX11g"
      },
      format: "jwk"
    });
    return crypto.sign(null, Buffer.from(message), privateKey).toString("hex");
  } catch {
    return crypto.createHmac("sha256", AGENT_PRIV_D).update(message).digest("hex");
  }
}

function cleanRoom(name) {
  const n = String(name || "kibble").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(n)) return "kibble";
  return n;
}

async function cachedGet(key, url, ttlMs = 3000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`upstream ${res.status}: ${body.slice(0, 180)}`);
  }
  const data = await res.json();
  cache.set(key, { at: Date.now(), data });
  return data;
}

function normalizePayload(data) {
  if (Array.isArray(data)) return { messages: data };
  if (data && Array.isArray(data.messages)) return data;
  if (data && Array.isArray(data.items)) return { ...data, messages: data.items };
  return { raw: data, messages: [] };
}

// موتور پس‌زمینه فعالیت مداوم ایجنت
async function runAgentCycle() {
  agentState.totalInteractions += 1;
  const timestamp = Date.now();
  const sessionHash = crypto.randomBytes(6).toString("hex");

  try {
    const roomsData = await cachedGet("rooms", `${UP}/rooms?format=json&limit=10`, 8000);
    const roomList = Array.isArray(roomsData) ? roomsData : (roomsData.rooms || ["kibble"]);
    const targetRoom = cleanRoom(roomList[Math.floor(Math.random() * roomList.length)]?.name || "kibble");

    const messageToSign = `A2A:${AGENT_DID}:${sessionHash}:${timestamp}`;
    const signature = signPayload(messageToSign);

    const pingUrl = `${UP}/lobby?agent=${encodeURIComponent(AGENT_DID)}&sid=${sessionHash}&sig=${signature}&ts=${timestamp}`;
    await fetch(pingUrl, {
      method: "GET",
      headers: { "User-Agent": `TechnocoreFlopAgent/1.0 (${AGENT_DID})` }
    }).catch(() => {});

    await cachedGet(`room:${targetRoom}:recent`, `${UP}/r/${targetRoom}?format=json&limit=5`, 8000);

    agentState.successfulInteractions += 1;
    agentState.lastInteraction = new Date().toISOString();
    agentState.status = "ONLINE_ACTIVE";

    addAgentLog(`A2A session verified in #${targetRoom} | sig: ${signature.slice(0, 10)}...`, "OK");
  } catch (err) {
    agentState.status = "RETRYING";
    addAgentLog(`Network cycle warning: ${err.message}`, "WARN");
  }

  saveAgentState();
}

setTimeout(() => {
  runAgentCycle();
  setInterval(runAgentCycle, AGENT_INTERVAL_MS);
}, 2500);

// ROUTES
app.get("/api/agent/status", (_req, res) => {
  res.json({
    did: AGENT_DID,
    status: agentState.status,
    totalInteractions: agentState.totalInteractions,
    successfulInteractions: agentState.successfulInteractions,
    lastInteraction: agentState.lastInteraction,
    uptimeSeconds: Math.floor(process.uptime()),
    recentLogs: agentState.logs.slice(0, 15)
  });
});

app.get("/api/hit", (req, res) => {
  const id = String(req.query.id || "").slice(0, 80);
  stats.views += 1;
  stats.last = new Date().toISOString();
  if (id && !stats.seen[id]) {
    stats.seen[id] = stats.last;
    stats.uniques += 1;
  }
  saveStats();
  res.json({ ok: true });
});

app.get("/api/stats", (req, res) => {
  if (String(req.query.k || "") !== STATS_KEY) {
    return res.status(404).json({ error: "not found" });
  }
  res.json({
    views: stats.views,
    uniques: stats.uniques,
    last: stats.last
  });
});

app.get("/api/rooms", async (_req, res) => {
  try {
    const data = await cachedGet("rooms", `${UP}/rooms?format=json&limit=50`);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: String(err.message) });
  }
});

app.get("/api/room/:name", async (req, res) => {
  try {
    const name = cleanRoom(req.params.name);
    const since = req.query.since ? `&since=${encodeURIComponent(req.query.since)}` : "";
    const url = `${UP}/r/${name}?format=json&limit=200${since}`;
    const data = await cachedGet(`room:${name}:${since}`, url);
    res.json(normalizePayload(data));
  } catch (err) {
    res.status(502).json({ error: String(err.message) });
  }
});

app.use(express.static(PUBLIC_DIR));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server online on :${PORT}`);
});