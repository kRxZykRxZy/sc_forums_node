const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const jsdom = require("jsdom");
const worker = require("worker_threads");
const { getfromcache, setincache, leaderboard, getnext } = require("./storage.js");

// --- SQLITE_BUSY retry helper ---
async function retryOnBusy(fn, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.code === "SQLITE_BUSY") {
        console.warn(`⚠️ SQLITE_BUSY — retrying (${i + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("SQLITE_BUSY: exceeded retry attempts");
}

// --- SCRAPING FUNCTIONS ---
async function getsource(id) {
  const res = await fetch(`https://scratch.mit.edu/discuss/post/${id}/source`, {
    headers: { "Accept-Encoding": "utf-8" },
    signal: AbortSignal.timeout(5000),
  });
  return await res.text();
}

async function getpost(id, page = null) {
  id = id.toString();
  let sourcerequest = getsource(id);
  let response;
  try {
    response = await fetch(`https://scratch.mit.edu/discuss/post/${id}`, {
      headers: { "Accept-Encoding": "utf-8" },
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error("Fetch error:", e);
    return await getpost(id);
  }

  if (response.status === 404) return { topic_id: null, author: null, bbcodesource: null, is404: true, isdustbinned: false };

  const match = response.url.match(/topic\/(\d+)(?:\/\?page=(\d+))?/);
  const topicid = parseInt(match?.[1] || 0);
  const pagen = parseInt(match?.[2] || 0);

  if (page) {
    response = await fetch(`https://scratch.mit.edu/discuss/topic/${topicid}?page=${pagen + page}`, {
      signal: AbortSignal.timeout(5000),
    });
  }

  if (response.status === 403) return { topic_id, author: null, bbcodesource: null, is404: false, isdustbinned: true };

  const text = await response.text();
  const parsed = new jsdom.JSDOM(text);
  let author;
  try {
    author = parsed.window.document.getElementById("p" + id).querySelector("div .box-content .postleft dl dt a").textContent;
  } catch {
    return await getpost(id, 1);
  }

  const source = await sourcerequest;
  return { topic_id, author, bbcodesource: source, is404: false, isdustbinned: false };
}

async function getpostcaching(id) {
  const cached = await retryOnBusy(() => getfromcache(id));
  if (cached) return cached;
  const result = await getpost(id);
  await retryOnBusy(() => setincache(id, result));
  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- WORKER THREADS FOR CACHING ---
async function getnextparent() {
  const x = await new Promise((resolve) => {
    worker.parentPort.postMessage("next");
    worker.parentPort.on("message", resolve);
  });
  worker.parentPort.off("message");
  return retryOnBusy(() => getnext(true));
}

async function cacheforever() {
  while (true) {
    const cached = await getnextparent();
    await getpostcaching(cached);
    await sleep(500);
  }
}

async function cache() {
  for (let i = 0; i < 10; i++) {
    console.log(`Starting fetch thread #${i}`);
    const w = new worker.Worker(__filename);
    w.on("message", async () => {
      w.postMessage(await getnext(true));
    });
    await sleep(1000);
  }
}

// --- EXPRESS & HTTP SERVER ---
const app = express();
const staticPath = path.join(__dirname, "../static");
app.use("/", express.static(staticPath));

app.get("/post/:id", async (req, res) => {
  try {
    const data = await getpostcaching(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/status", (req, res) => res.sendFile(path.join(staticPath, "status.html")));

app.get("/leaderboard", async (req, res) => {
  try {
    const lb = await leaderboard();
    res.json(lb);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- WEBSOCKET SERVER ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const intervals = new Map();

wss.on("connection", (ws, req) => {
  if (req.url === "/status/ws") {
    const id = setInterval(async () => {
      const content = await getnext();
      if (ws.readyState === WebSocket.OPEN) ws.send(content.toString());
    }, 1000);
    intervals.set(ws, id);
  } else if (req.url === "/leaderboard/ws") {
    const id = setInterval(async () => {
      const lb = await leaderboard();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(lb));
    }, 1000);
    intervals.set(ws, id);
  }

  ws.on("close", () => {
    const id = intervals.get(ws);
    if (id) clearInterval(id);
    intervals.delete(ws);
  });
});

// --- START SERVER / WORKER THREADS ---
(async () => {
  if (worker.isMainThread) {
    await cache(); // start caching threads
    const PORT = 3000;
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Serving static files from ${staticPath}`);
    });
  } else {
    await cacheforever(); // worker threads
  }
})();
