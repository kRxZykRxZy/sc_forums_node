const jsdom = require("jsdom");
const worker = require('worker_threads');
const { getfromcache, setincache, leaderboard, getnext } = require("./storage.js");

async function getsource(id) {
    let theid = id;
    console.log(theid);
    let sourcerequest = fetch("https://scratch.mit.edu/discuss/post/" + id + "/source", {
        headers: {
            'Accept-Encoding': 'utf-8',
            "signal": AbortSignal.timeout(5000)
        }
    });
    let x = await (await sourcerequest).text();
    return x;
}

async function getpost(id, page = null) {
    id = id.toString();
    console.log("Getting post " + id);
    let sourcerequest = getsource(id);
    let response;
    try {
        response = await fetch("https://scratch.mit.edu/discuss/post/" + id, {
            headers: {
                'Accept-Encoding': 'utf-8'
            },
            signal: AbortSignal.timeout(5000)
        });
    } catch (e) {
        throw (e);
        return await getpost(id);
    }
    if (response.status == 404) {
        return { "topic_id": null, "author": null, "bbcodesource": null, "is404": true, "isdustbinned": false };
    }
    let topicid = parseInt(response.url.match(/https:\/\/scratch\.mit\.edu\/discuss\/topic\/(\d*)\/(\?page=\d*)?(\#post-\d*)?\/?/)[1]);
    let pagen = parseInt(response.url.match(/https:\/\/scratch\.mit\.edu\/discuss\/topic\/\d*\/(\?page=(\d*))?(\#post-\d*)?\/?/)[2]);
    if (page) {
        response = await fetch("https://scratch.mit.edu/discuss/topic/" + topicid.toString() + "?page=" + (pagen + page).toString(), { signal: AbortSignal.timeout(5000) });
    }
    if (response.status == 403) {
        return { "topic_id": topicid, "author": null, "bbcodesource": null, "is404": false, "isdustbinned": true };
    }
    let resptext = await response.text();
    let parsed = new jsdom.JSDOM(resptext);
    let author;
    try {
        author = parsed.window.document.getElementById("p" + id.toString()).querySelector("div .box-content .postleft dl dt a").textContent;
    } catch {
        console.log("New page");
        return await getpost(id, 1);
    }
    let source;
    source = await sourcerequest;
    return { "topic_id": topicid, "author": author, "bbcodesource": source, "is404": false, "isdustbinned": false }
}

async function getpostcaching(id) {
    cacheresult = await getfromcache(id);
    if (cacheresult) {
        return cacheresult;
    } else {
        let result = await getpost(id);
        setincache(id, result);
        return result;
    }
}
function sleeppromise(ms) {
    return new Promise((resolve, _reject) => {
        setTimeout(resolve, ms);
    })
}
async function getnextparent() {
    let x = await new Promise((rs,rj)=>{
        worker.parentPort.postMessage("next");
        worker.parentPort.on("message",rs);
    });
    worker.parentPort.off("message");
    return x;
}
async function cacheforever() {
    while (true) {
        let cached = await getnextparent();
        await getpostcaching(cached);
        await sleeppromise(500);
    }
}
async function cache() {
    for (let i = 0; i < 10; i++) {
        console.log("Starting fetch thread #" + i.toString());
        let w = new worker.Worker(__filename);
        w.on("message",async()=>{
            w.postMessage(await getnext(true));
        })
        await sleeppromise(1000);
    }
}
async function main() {
    console.log("Starting caching all posts");
    await cache();
}
(async () => {
    if (worker.isMainThread) {
        await main();
    } else {
        await cacheforever();
    }
})();