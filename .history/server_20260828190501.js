const express = require("express");
const app = express();

const UP = "https://technocore.chat";
const cache = new Map();
const PORT = Number(process.env.PORT) || 3000;

function cleanRoom(name) {
  const n = String(name || "kibble").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(n)) return "kibble";
  return n;
}

async function cachedGet(key, url, ttlMs = 3000) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
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

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log(`Local: http://localhost:${PORT}`);
});