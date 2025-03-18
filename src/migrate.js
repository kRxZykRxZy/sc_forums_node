const { getfromcache, setincache, isincache } = require("./storage.js");
const fs = require("fs");

(async()=>{
fs.readdirSync('cache/post').forEach(async (i)=>{
    let data;
    try {
        data=JSON.parse(fs.readFileSync("cache/post/"+i));
    } catch {
        return;
    }
    if (!(data==null || data.author==null)) {
        await setincache(i,data);
    }
})})();