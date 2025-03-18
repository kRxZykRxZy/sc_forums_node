const { getfromcache, setincache, isincache } = require("./storage.js");
const fs = require("fs");

(async()=>{
fs.readdirSync('cache/post').forEach(async (i)=>{
    if (i%100==0)console.log(i);
    await setincache(i,JSON.parse(fs.readFileSync("cache/post/"+i)));
    //fs.unlinkSync("cache/post/"+i);
})})();