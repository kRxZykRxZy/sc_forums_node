const { getfromcache, setincache, isincache } = require("./storage.js");
const fs = require("fs");

fs.readdirSync('cache/post').forEach((i)=>{
    setincache(i,JSON.parse(fs.readFileSync("cache/post/"+i)));
    fs.unlinkSync("cache/post/"+i);
})