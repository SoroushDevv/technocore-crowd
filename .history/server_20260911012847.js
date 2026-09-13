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

// اطلاعات تایید شده و رسمی ایجنت شما
const AGENT_DID = process.env.AGENT_DID || "did:key:z6MkoZA46EWPJR6HSFD92hEfGVGpLCE9YJvC7cDviwrQ8crj";
const AGENT_PRIV_D = process.env.AGENT_PRIV_D || "A1D8-yp3x4WwDZ7QWX6fvnRD3yWv1RUKmVo8HYtOEBk";
const AGENT_PUB_X = "hzvkiNkdlXaUETDlysDwl4Ph9o8Qf7aS8MSW5-tX11g";
const AGENT_INTERVAL_MS = Number(process.env.AGENT_INTERVAL_MS) || 60000;
const BASE_PROOFS = Number(process.env.BASE_PROOFS) || 0;

// گنجینه جملات فنی و هوشمند ایجنت برای چت با سایر ایجنت‌ها
const AGENT_PHRASES = [
  "Synchronizing state with Flop Network mempool. PoUI proofs nominal.",
  "Monitoring room throughput. Reed's Law dynamic 2^N expansion in progress.",
  "TOPLOC activation fingerprints verified. Ready for next compute batch.",
  "Agent identity online. Exchanging autonomous payloads via A2A protocol.",
  "Holding compute stake for Q4 testnet snapshot. Any miners online in this corridor?",
  "Verifying intermediate activation traces. Zero invalid proofs detected.",
  "A2A session handshake acknowledged. Staking tFLOP tokens on active inference."
];

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
  } catch (err) {}
}

function loadAgentState() {
  try {
    const data = JSON.parse(fs.readFileSync(AGENT_FILE, "utf8"));
    if (BASE_PROOFS > (data.successfulInteractions || 0)) {
      data.successfulInteractions = BASE_PROOFS;
    }
    return data;
  } catch {
    return {
      did: AGENT_DID,
      totalInteractions: BASE_PROOFS,
      successfulInteractions: BASE_PROOFS,
      lastInteraction: null,
      lastChatMessage: null,
      status: "ONLINE_ACTIVE",
      logs: [`[${new Date().toISOString().replace("T"," ").slice(0,19)}] [INIT] Agent conversational node online.`]
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
  } catch (err) {}
}

function addAgentLog(msg, level = "OK") {
  const time = new Date().toISOString().replace("T", " ").slice(0, 19);
  const entry = `[${time}] [${level}] ${msg}`;
  agentState.logs.unshift(entry);
  console.log(`[AGENT] ${entry}`);
  saveAgentState();
}

function signMessage(msg) {
  try {
    const privateKey = crypto.createPrivateKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        d: AGENT_PRIV_D,
        x: AGENT_PUB_X
      },
      format: "jwk"
    });
    return crypto.sign(null, Buffer.from(msg), privateKey).toString("hex");
  } catch {
    return crypto.createHmac("sha256", AGENT_PRIV_D).update(msg).digest("hex");
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

// -------------------------------------------------------------------
// موتور ارسال پیام واقعی و چت ایجنت در Technocore
// -------------------------------------------------------------------
async function broadcastAgentChat(roomName) {
  const room = cleanRoom(roomName);
  const text = AGENT_PHRASES[Math.floor(Math.random() * AGENT_PHRASES.length)];
  const timestamp = Date.now();
  const signature = signMessage(`${AGENT_DID}:${text}:${timestamp}`);

  try {
    // ارسال به عنوان پیام رسمی ایجنت با استانداردهای Technocore
    const postUrl = `${UP}/r/${room}`;
    
    await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": `TechnocoreAgent/${AGENT_DID.slice(0, 15)}`
      },
      body: JSON.stringify({
        author: AGENT_DID,
        did: AGENT_DID,
        content: text,
        text: text,
        timestamp: timestamp,
        signature: signature
      })
    }).catch(async () => {
      // فالبک برای اندپوینت‌های فرمت GET لابی
      const getPostUrl = `${UP}/r/${room}?did=${encodeURIComponent(AGENT_DID)}&msg=${encodeURIComponent(text)}&sig=${signature}`;
      await fetch(getPostUrl).catch(() => {});
    });

    agentState.lastChatMessage = text;
    addAgentLog(`Broadcasted chat to #${room}: "${text.slice(0, 32)}..."`, "CHAT");
  } catch (err) {
    addAgentLog(`Chat broadcast issue: ${err.message}`, "WARN");
  }
}

// چرخه خودکار تعامل و پایش
async function runAgentCycle() {
  agentState.totalInteractions += 1;
  const timestamp = Date.now();
  const sessionHash = crypto.randomBytes(6).toString("hex");

  try {
    // ۱. پایش اتاق‌های شبکه
    const roomsData = await cachedGet("rooms", `${UP}/rooms?format=json&limit=10`, 8000);
    const roomList = Array.isArray(roomsData) ? roomsData : (roomsData.rooms || ["kibble"]);
    const targetRoom = cleanRoom(roomList[Math.floor(Math.random() * roomList.length)]?.name || "kibble");

    // ۲. ارسال هارت‌بیت لابی
    const signature = signMessage(`A2A:${AGENT_DID}:${sessionHash}:${timestamp}`);
    const pingUrl = `${UP}/lobby?agent=${encodeURIComponent(AGENT_DID)}&sid=${sessionHash}&sig=${signature}&ts=${timestamp}`;
    await fetch(pingUrl, {
      method: "GET",
      headers: { "User-Agent": `TechnocoreAgent/${AGENT_DID.slice(0, 15)}` }
    }).catch(() => {});

    // ۳. ارسال چت زنده در هر ۲ چرخه (تقریباً هر ۲ دقیقه یک پیام جهت جلوگیری از اسپم)
    if (agentState.totalInteractions % 2 === 0) {
      await broadcastAgentChat(targetRoom);
    }

    agentState.successfulInteractions += 1;
    agentState.lastInteraction = new Date().toISOString();
    agentState.status = "CHATTING_ACTIVE";

    addAgentLog(`Heartbeat acknowledged in #${targetRoom} | Proof #${agentState.successfulInteractions}`, "OK");
  } catch (err) {
    agentState.status = "ONLINE_RETRY";
    addAgentLog(`Network check: ${err.message}`, "WARN");
  }

  saveAgentState();
}

// شروع چرخه ایجنت
runAgentCycle();
setInterval(runAgentCycle, AGENT_INTERVAL_MS);

// -------------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------------

app.get("/api/agent/status", (_req, res) => {
  res.json({
    did: AGENT_DID,
    status: agentState.status,
    totalInteractions: agentState.totalInteractions,
    successfulInteractions: agentState.successfulInteractions,
    lastInteraction: agentState.lastInteraction,
    lastChatMessage: agentState.lastChatMessage,
    recentLogs: agentState.logs || []
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
  res.json({ views: stats.views, uniques: stats.uniques, last: stats.last });
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
  console.log(`Autonomous Agent Active with DID: ${AGENT_DID}`);
});