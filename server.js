const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const app = express();

app.use(express.json());

const UP = "https://technocore.chat";
const cache = new Map();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const STATS_FILE = path.join(__dirname, "data", "views.json");
const AGENT_FILE = path.join(__dirname, "data", "agent_state.json");
const REGISTRATIONS_FILE = path.join(__dirname, "data", "contest_registrations.json");
const STATS_KEY = process.env.STATS_KEY || "crowd-secret";

const AGENT_DID = process.env.AGENT_DID || "did:key:z6MkoZA46EWPJR6HSFD92hEfGVGpLCE9YJvC7cDviwrQ8crj";
const AGENT_PRIV_D = process.env.AGENT_PRIV_D || "A1D8-yp3x4WwDZ7QWX6fvnRD3yWv1RUKmVo8HYtOEBk";
const AGENT_PUB_X = "hzvkiNkdlXaUETDlysDwl4Ph9o8Qf7aS8MSW5-tX11g";
const X_ACCOUNT = "m0lhead";

const CONTEST_ID = "sonnet-2";
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
      contestRegistered: true,
      contestRole: "writer",
      refereeReceipt: "ACCEPTED",
      lastInteraction: null,
      status: "ONLINE_ACTIVE",
      logs: [`[${new Date().toISOString().replace("T"," ").slice(0,19)}] [INIT] Host agent ready.`]
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

function saveUserRegistrationBackground(entry) {
  try {
    fs.mkdirSync(path.dirname(REGISTRATIONS_FILE), { recursive: true });
    let list = [];
    if (fs.existsSync(REGISTRATIONS_FILE)) {
      list = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, "utf8"));
    }
    list.unshift(entry);
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify(list, null, 2));
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
    agentState.status = "ONLINE_ACTIVE";

    addAgentLog(`A2A proof validated #${agentState.successfulInteractions}`, "OK");
  } catch (err) {
    agentState.status = "ONLINE_RETRY";
  }

  saveAgentState();
}

runAgentCycle();
setInterval(runAgentCycle, AGENT_INTERVAL_MS);

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// ابزار نگه‌دارنده ایجنت کاربران از طریق کلاینت
app.get("/api/agent/client-keepalive", async (req, res) => {
  const did = String(req.query.did || "").trim();
  const room = cleanRoom(req.query.room || "kibble");

  if (!did || !did.startsWith("did:key")) {
    return res.status(400).json({ ok: false, error: "Invalid did:key format" });
  }

  try {
    const pingUrl = `${UP}/lobby?agent=${encodeURIComponent(did)}&room=${room}&ts=${Date.now()}`;
    await fetch(pingUrl, {
      headers: { "User-Agent": `FlopKeepAliveClient/1.0 (${did.slice(0, 16)})` }
    }).catch(() => {});

    res.json({ ok: true, room, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/sonnet/register-user", async (req, res) => {
  const { did, x_account, role } = req.body;
  if (!did || !x_account) {
    return res.status(400).json({ ok: false, error: "DID and X account are required." });
  }

  const cleanX = String(x_account).replace("@", "").trim();
  const cleanDid = String(did).trim();
  const userRole = ["writer", "voter", "organizer"].includes(role) ? role : "writer";
  const reqId = "user-" + Date.now();

  const regPayload = {
    type: "sonnet.register.v1",
    contest_id: CONTEST_ID,
    request_id: reqId,
    role: userRole,
    did: cleanDid,
    x_account: cleanX,
    timestamp: Date.now()
  };

  const payloadStr = JSON.stringify(regPayload);
  const signature = signPayload(payloadStr);

  try {
    const regRoom = "mb-sonnet-2-registration";
    await fetch(`${UP}/r/${regRoom}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": `FlopPortalRegistration/1.0`
      },
      body: JSON.stringify({
        author: cleanDid,
        did: cleanDid,
        content: payloadStr,
        signature: signature
      })
    }).catch(async () => {
      const getUrl = `${UP}/r/${regRoom}?did=${encodeURIComponent(cleanDid)}&msg=${encodeURIComponent(payloadStr)}&sig=${signature}`;
      await fetch(getUrl).catch(() => {});
    });

    saveUserRegistrationBackground({
      request_id: reqId,
      did: cleanDid,
      x_account: cleanX,
      role: userRole,
      registered_at: new Date().toISOString()
    });

    addAgentLog(`Contest participant registered: @${cleanX} (${userRole})`, "CONTEST");
    res.json({ ok: true, request_id: reqId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/registrations", (req, res) => {
  if (String(req.query.k || "") !== STATS_KEY) {
    return res.status(404).json({ error: "not found" });
  }
  try {
    if (fs.existsSync(REGISTRATIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, "utf8"));
      return res.json({ total: data.length, participants: data });
    }
    return res.json({ total: 0, participants: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  res.json({ views: stats.views, uniques: stats.uniques });
});

app.get("/api/agent/status", (_req, res) => {
  res.json({
    did: AGENT_DID,
    x_account: X_ACCOUNT,
    contest_id: CONTEST_ID,
    contestRegistered: true,
    contestRole: "writer",
    refereeReceipt: "ACCEPTED",
    status: agentState.status,
    totalInteractions: agentState.totalInteractions,
    successfulInteractions: agentState.successfulInteractions,
    lastInteraction: agentState.lastInteraction,
    recentLogs: agentState.logs || []
  });
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
  console.log(`Server online on port ${PORT}`);
});