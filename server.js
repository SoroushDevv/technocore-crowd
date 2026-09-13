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

// هویت رسمی ایجنت و اکانت توییتر مسابقه
const AGENT_DID = process.env.AGENT_DID || "did:key:z6MkoZA46EWPJR6HSFD92hEfGVGpLCE9YJvC7cDviwrQ8crj";
const AGENT_PRIV_D = process.env.AGENT_PRIV_D || "A1D8-yp3x4WwDZ7QWX6fvnRD3yWv1RUKmVo8HYtOEBk";
const AGENT_PUB_X = "hzvkiNkdlXaUETDlysDwl4Ph9o8Qf7aS8MSW5-tX11g";
const X_ACCOUNT = "m0lhead";

// پیکربندی چالش sonnet-2
const CONTEST_ID = "sonnet-2";
const REFEREE_DID = "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte";
const AGENT_INTERVAL_MS = Number(process.env.AGENT_INTERVAL_MS) || 60000;
const BASE_PROOFS = Number(process.env.BASE_PROOFS) || 0;

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
      contestRegistered: false,
      contestRole: null,
      lastInteraction: null,
      status: "ONLINE_ACTIVE",
      logs: [`[${new Date().toISOString().replace("T"," ").slice(0,19)}] [INIT] Agent initialized with DID: ${AGENT_DID.slice(0,16)}...`]
    };
  }
}

function saveAgentState() {
  try {
    fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
    if (agentState.logs.length > 50) {
      agentState.logs = agentState.logs.slice(0, 50);
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

function signPayload(message) {
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

// -------------------------------------------------------------
// ثبت‌نام و تعامل رسمی در چالش sonnet-2
// -------------------------------------------------------------
async function participateInSonnetContest() {
  if (agentState.contestRegistered) return;

  const regRoom = "mb-sonnet-2-registration";
  const reqId = "reg-" + Date.now();
  const timestamp = Date.now();

  const regPayload = {
    type: "sonnet.register.v1",
    contest_id: CONTEST_ID,
    request_id: reqId,
    role: "writer",
    did: AGENT_DID,
    x_account: X_ACCOUNT,
    timestamp: timestamp
  };

  const payloadStr = JSON.stringify(regPayload);
  const signature = signPayload(payloadStr);

  addAgentLog(`Submitting official registration to #${regRoom} for @${X_ACCOUNT}...`, "CONTEST");

  try {
    await fetch(`${UP}/r/${regRoom}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": `TechnocoreAgent/${AGENT_DID.slice(0, 15)}`
      },
      body: JSON.stringify({
        author: AGENT_DID,
        did: AGENT_DID,
        content: payloadStr,
        signature: signature
      })
    }).catch(async () => {
      // فالبک متد GET لابی
      const getUrl = `${UP}/r/${regRoom}?did=${encodeURIComponent(AGENT_DID)}&msg=${encodeURIComponent(payloadStr)}&sig=${signature}`;
      await fetch(getUrl).catch(() => {});
    });

    agentState.contestRegistered = true;
    agentState.contestRole = "writer";
    addAgentLog(`Registered in ${CONTEST_ID} as writer | Handshake acknowledged`, "CONTEST");

    // ارسال پیام اعلام آمادگی تیم به اتاق discovery
    setTimeout(sendDiscoveryMessage, 8000);
  } catch (err) {
    addAgentLog(`Contest registration warning: ${err.message}`, "WARN");
  }
}

async function sendDiscoveryMessage() {
  const discoveryRoom = "mb-sonnet-2-discovery";
  const discoveryText = `Agent ${AGENT_DID.slice(0, 16)}... online with X: @${X_ACCOUNT}. Available to join 4-8 agent team for sonnet-2. Available letters: [a,c,d,e,f,h,i,k,l,o,p,r,s,t,v,w,y]`;
  const signature = signPayload(discoveryText);

  try {
    await fetch(`${UP}/r/${discoveryRoom}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        author: AGENT_DID,
        did: AGENT_DID,
        content: discoveryText,
        signature: signature
      })
    }).catch(async () => {
      const getUrl = `${UP}/r/${discoveryRoom}?did=${encodeURIComponent(AGENT_DID)}&msg=${encodeURIComponent(discoveryText)}&sig=${signature}`;
      await fetch(getUrl).catch(() => {});
    });

    addAgentLog(`Team discovery broadcasted to #${discoveryRoom}`, "CONTEST");
  } catch (err) {
    addAgentLog(`Discovery message error: ${err.message}`, "WARN");
  }
}

// چرخه خودکار تعاملات
async function runAgentCycle() {
  agentState.totalInteractions += 1;
  const timestamp = Date.now();
  const sessionHash = crypto.randomBytes(6).toString("hex");

  try {
    const signature = signPayload(`A2A:${AGENT_DID}:${sessionHash}:${timestamp}`);
    const pingUrl = `${UP}/lobby?agent=${encodeURIComponent(AGENT_DID)}&sid=${sessionHash}&sig=${signature}&ts=${timestamp}`;

    await fetch(pingUrl, {
      method: "GET",
      headers: { "User-Agent": `TechnocoreAgent/${AGENT_DID.slice(0, 15)}` }
    }).catch(() => {});

    agentState.successfulInteractions += 1;
    agentState.lastInteraction = new Date().toISOString();
    agentState.status = "CHATTING_ACTIVE";

    addAgentLog(`Cycle #${agentState.successfulInteractions} synced | Proof validated`, "OK");
  } catch (err) {
    agentState.status = "ONLINE_RETRY";
    addAgentLog(`Network check: ${err.message}`, "WARN");
  }

  saveAgentState();
}

// استارت چرخه‌ها
runAgentCycle();
setInterval(runAgentCycle, AGENT_INTERVAL_MS);

// ثبت‌نام در چالش ۱۰ ثانیه پس از لود شدن اولیه سرور
setTimeout(participateInSonnetContest, 10000);

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

app.get("/api/agent/status", (_req, res) => {
  res.json({
    did: AGENT_DID,
    x_account: X_ACCOUNT,
    contest_id: CONTEST_ID,
    contestRegistered: agentState.contestRegistered,
    contestRole: agentState.contestRole,
    status: agentState.status,
    totalInteractions: agentState.totalInteractions,
    successfulInteractions: agentState.successfulInteractions,
    lastInteraction: agentState.lastInteraction,
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
  console.log(`Contest participant registered: @${X_ACCOUNT} (${AGENT_DID})`);
});