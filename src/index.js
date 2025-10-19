const express = require("express");
const path = require("path");
const jsdom = require("jsdom");
const worker = require("worker_threads");
const fetch = require("node-fetch");
const { getfromcache, setincache, leaderboard, getnext } = require("./storage.js");

const app = express();
const port = 3000;

// Serve ../static at root
const staticPath = path.join(__dirname, "../static");
app.use("/", express.static(staticPath));

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

// --- Scratch post fetching ---
async function getsource(id) {
  console.log(id);
  const sourcerequest = fetch(`https://scratch.mit.edu/discuss/post/${id}/source`, {
    headers: { "Accept-Encoding": "utf-8" },
    signal: AbortSignal.timeout(5000),
  });
  return await (await sourcerequest).text();
}

async function getpost(id, page = null) {
  id = id.toString();
  console.log("Getting post " + id);

  const sourcerequest = getsource(id);
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

  if (response.status === 404) {
    return { topic_id: null, author: null, bbcodesource: null, is404: true, isdustbinned: false };
  }

  const match = response.url.match(/topic\/(\d+)(?:\/\?page=(\d+))?/);
  const topicid = parseInt(match?.[1] || 0);
  const pagen = parseInt(match?.[2] || 0);

  if (page) {
    response = await fetch(`https://scratch.mit.edu/discuss/topic/${topicid}?page=${pagen + page}`, {
      signal: AbortSignal.timeout(5000),
    });
  }

  if (response.status === 403) {
    return { topic_id: topicid, author: null, bbcodesource: null, is404: false, isdustbinned: true };
  }

  const resptext = await response.text();
  const parsed = new jsdom.JSDOM(resptext);
  let author;

  try {
    author = parsed.window.document
      .getElementById("p" + id)
      .querySelector("div .box-content .postleft dl dt a").textContent;
  } catch {
    console.log("New page");
    return await getpost(id, 1);
  }

  const source = await sourcerequest;
  return { topic_id: topicid, author, bbcodesource: source, is404: false, isdustbinned: false };
}

// --- Caching with retry ---
async function getpostcaching(id) {
  const cacheresult = await retryOnBusy(() => getfromcache(id));
  if (cacheresult) return cacheresult;

  const result = await getpost(id);
  await retryOnBusy(() => setincache(id, result));
  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Worker helper ---
async function getnextparent() {
  const x = await new Promise((resolve) => {
    worker.parentPort.postMessage("next");
    worker.parentPort.on("message", resolve);
  });
  worker.parentPort.off("message");
  return retryOnBusy(() => getnext(true));
}

// --- Caching loops ---
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

async function main() {
  console.log("Starting caching all posts");
  await cache();

  app.listen(port, () => {
    console.log(`✅ Server running at http://localhost:${port}`);
    console.log(`📁 Serving static files from: ${staticPath}`);
  });
}

(async () => {
  if (worker.isMainThread) {
    await main();
  } else {
    await cacheforever();
  }
})();
