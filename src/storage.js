const fs = require("fs");

async function getfromcache(postid) {
    let content = fs.readFileSync("cache/post/" + id.toString());
    try {
        return JSON.parse(content);
    } catch {
        fs.unlinkSync("cache/post/" + id.toString());
    }
    return false;
}

async function writetocache(postid, content) {
    if (!fs.existsSync("cache/")) {
        fs.mkdirSync("cache/");
    }
    if (!fs.existsSync("cache/post")) {
        fs.mkdirSync("cache/post");
    }
    fs.writeFile("cache/post/" + id.toString(), JSON.stringify(content), () => { });
}