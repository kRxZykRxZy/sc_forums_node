const { leaderboard, getnext } = require("./storage.js");
const fs = require("fs");
const http = require("http");
const ws = require("ws");

async function serve() {
    const server = http.createServer({}, async (req, res) => {
        console.log(req.url);
        if (/\/post\/(\d*)/.test(req.url)) {
            res.end(JSON.stringify(await getpostcaching(req.url.match(/\/post\/(\d*)/)[1])));
        } else if (/\/status\/?/.test(req.url)) {
            res.setHeader("content-type", "text/html");
            res.end(fs.readFileSync("static/status.html"));
        } else if (/\/leaderboard\/?/.test(req.url)) {
            res.setHeader("content-type", "text/json");
            res.setHeader("refresh", "1");
            res.end(JSON.stringify(await leaderboard(), null, 2));
        } else {
            res.end("404 Not Found")
        }
    });
    const wss = new ws.WebSocketServer({ server });

    wss.on('connection', async function (ws, req) {
        console.log(req.url);
        if (req.url == "/status/ws") {
            setInterval(async function () {
                let content = await getnext();
                ws.send(content);
            }, 1000);
        } else if (req.url == "/leaderboard/ws") {
            setInterval(async () => {
                let lb = await leaderboard();
                ws.send(JSON.stringify(lb, null, 2));
            }, 1000);
        }
    });
    console.log("Starting to listen...");
    server.listen(3000, "");
}

serve();