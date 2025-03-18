const jsdom = require("jsdom");
const fs = require("fs");
const http = require("http");
const ws = require("ws");
const { getfromcache, setincache } = require("./storage.js");

async function getsource(id) {
    let theid = id;
    let sourcerequest = fetch("https://scratch.mit.edu/discuss/post/" + id + "/source", {
        headers: {
            'Accept-Encoding': 'utf-8'
        }
    });
    return sourcerequest.catch((e) => {
        return getsource(theid)
    });
}

async function getpost(id) {
    id = id.toString();
    let sourcerequest = getsource(id);
    let response;
    try {
        response = await fetch("https://scratch.mit.edu/discuss/post/" + id, {
            headers: {
                'Accept-Encoding': 'utf-8'
            }
        });
    } catch {
        return await getpost(id);
    }
    if (response.status == 404) {
        return { "topic_id": null, "author": null, "bbcodesource": null, "is404": true, "isdustbinned": false };
    }
    let topicid = parseInt(response.url.match(/https:\/\/scratch\.mit\.edu\/discuss\/topic\/(\d*)\/(\?page=\d*)?(\#post-\d*)?\/?/)[1]);
    if (response.status == 403) {
        return { "topic_id": topicid, "author": null, "bbcodesource": null, "is404": false, "isdustbinned": true };
    }
    let resptext = await response.text();
    let parsed = new jsdom.JSDOM(resptext);
    let author;
    try {
        author = parsed.window.document.getElementById("p" + id.toString()).querySelector("div .box-content .postleft dl dt a").textContent;
    } catch { return null; }
    let source;
    source = await sourcerequest;
    return { "topic_id": topicid, "author": author, "bbcodesource": source, "is404": false, "isdustbinned": false }
}

async function getpostcaching(id) {
    cacheresult = await getfromcache(id);
    if (cacheresult) { return cacheresult; } else {
        let result = await getpost(id);
        setincache(id, result);
        return result;
    }
}
async function cacheforever(state) {
    while (true) {
        state.cached++;
        await getpostcaching(state.cached);
    }
}
function cache(state) {
    for (let i = 0; i < 100; i++) {
        cacheforever(state);
    }
}
async function main() {
    let state = { cached: 0 }
    serve(state);
    cache(state);
}
async function serve(state) {
    const server = http.createServer({}, async (req, res) => {
        if (/\/post\/(\d*)/.test(req.url)) {
            res.end(JSON.stringify(await getpostcaching(req.url.match(/\/post\/(\d*)/)[1])));
        } else if (/\/status\/?/.test(req.url)) {
            res.setHeader("content-type", "text/html");
            res.end(fs.readFileSync("static/status.html"));
        }
    });
    const wss = new ws.WebSocketServer({ server });

    wss.on('connection', function (ws, req) {
        console.log(req.url);
        if (req.url == "/status/ws") {
            let old = state.cached;
            setInterval(() => {
                if (old != state.cached) {
                    old = state.cached;
                    ws.send(state.cached.toString());
                }
            }, 100);
        }
    });
    server.listen(3000, "");
}
main();