const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const jsdom = require("jsdom");
const worker = require("worker_threads");
const { getfromcache, setincache, leaderboard, getnext } = require("./storage.js");

// --- SQLITE_BUSY retry ---
async function retryOnBusy(fn, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } 
    catch (err) { if (err.code === "SQLITE_BUSY") await new Promise(r => setTimeout(r, delay)); else throw err; }
  }
  throw new Error("SQLITE_BUSY: exceeded retry attempts");
}

// --- SCRAPING ---
async function getsource(id) {
  const res = await fetch(`https://scratch.mit.edu/discuss/post/${id}/source`, { headers: { "Accept-Encoding": "utf-8" }, signal: AbortSignal.timeout(5000) });
  return await res.text();
}

async function getpost(id, page = null) {
  id = id.toString();
  let sourcerequest = getsource(id), response;
  try { response = await fetch(`https://scratch.mit.edu/discuss/post/${id}`, { headers: { "Accept-Encoding": "utf-8" }, signal: AbortSignal.timeout(5000) }); }
  catch { return await getpost(id); }
  if (response.status === 404) return { topic_id: null, author: null, bbcodesource: null, is404: true, isdustbinned: false };
  const match = response.url.match(/topic\/(\d+)(?:\/\?page=(\d+))?/), topicid = parseInt(match?.[1]||0), pagen = parseInt(match?.[2]||0);
  if (page) response = await fetch(`https://scratch.mit.edu/discuss/topic/${topicid}?page=${pagen+page}`, { signal: AbortSignal.timeout(5000) });
  if (response.status === 403) return { topic_id, author: null, bbcodesource: null, is404: false, isdustbinned: true };
  const parsed = new jsdom.JSDOM(await response.text());
  let author;
  try { author = parsed.window.document.getElementById("p"+id).querySelector("div .box-content .postleft dl dt a").textContent; } 
  catch { return await getpost(id, 1); }
  return { topic_id, author, bbcodesource: await sourcerequest, is404: false, isdustbinned: false };
}

async function getpostcaching(id) {
  const cached = await retryOnBusy(() => getfromcache(id));
  if (cached) return cached;
  const result = await getpost(id);
  await retryOnBusy(() => setincache(id, result));
  return result;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- WORKER ---
async function getnextparent() {
  if (!worker.isMainThread) return await new Promise(res => { worker.parentPort.once("message", res); worker.parentPort.postMessage("next"); });
  return await getnext(true);
}

async function cacheforever() { while (true) { try { await getpostcaching(await getnextparent()); } catch(e){ console.error(e); await sleep(1000); } await sleep(500); } }

async function cache() {
  for (let i=0;i<10;i++) {
    const w = new worker.Worker(__filename);
    w.on("message", async () => { try { w.postMessage(await getnext(true)); } catch(e){ console.error(e); } });
    w.on("error", e=>console.error("Worker error:", e));
    w.on("exit", c=>{ if(c!==0) console.error(`Worker exited ${c}`); });
    await sleep(1000);
  }
}

// --- EXPRESS & WEBSOCKET ---
const app = express();
const staticPath = path.join(__dirname,"../static");
app.use("/", express.static(staticPath));

app.get("/post/:id", async (req,res)=>{ try{ res.json(await getpostcaching(req.params.id)); } catch(e){ res.status(500).json({error:e.message}); } });
app.get("/status", (req,res)=>res.sendFile(path.join(staticPath,"status.html")));
app.get("/leaderboard", async (req,res)=>{ try{ res.json(await leaderboard()); } catch(e){ res.status(500).json({error:e.message}); } });

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const intervals = new Map();

wss.on("connection", ws => {
  if(ws.url==="/status/ws") {
    const id=setInterval(async()=>{ if(ws.readyState===WebSocket.OPEN) ws.send((await getnext()).toString()); },1000);
    intervals.set(ws,id);
  } else if(ws.url==="/leaderboard/ws") {
    const id=setInterval(async()=>{ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(await leaderboard())); },1000);
    intervals.set(ws,id);
  }
  ws.on("close", ()=>{ const id=intervals.get(ws); if(id) clearInterval(id); intervals.delete(ws); });
  ws.on("error", e=>console.error("WS error:", e));
});

// --- START SERVER ---
(async()=>{
  if(worker.isMainThread){ await cache(); server.listen(3000,()=>console.log("Server running at http://localhost:3000")); }
  else await cacheforever();
})();
