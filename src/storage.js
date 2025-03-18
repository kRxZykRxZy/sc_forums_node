var mysql = require('mysql');
var dbconfig = require('../dbconfig.json');

var con = mysql.createConnection({
    host: dbconfig.host,
    port: dbconfig.port,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database
});
(async () => {
    await new Promise((resolve, _reject) => {
        con.connect(function (err) {
            if (err) throw err;
            resolve()
        });
    });
})()


async function setup() {
    con.query("CREATE TABLE IF NOT EXISTS `posts` (`id` INT NOT NULL,`author` TINYTEXT, `topic_id` INT NOT NULL, `source` MEDIUMTEXT, `isdustbinned` BOOLEAN NOT NULL, PRIMARY KEY (`id`))", function (err, _result) {
        if (err) throw err;
    });
}
setup();

async function getfromcache(id) {
    return new Promise((resolve, _reject) => {
        con.query("SELECT * FROM posts WHERE id = ?", [id], function (err, result) {
            if (err) throw err;
            if (result.length == 0) {
                resolve(false);
            } else {
                resolve(result[0]);
            }
        });
    });
}

function parseIntOrNull (i) {
    return null ? i == null : parseInt(i);
}

async function setincache(id, data) {
    if (data.is404) return;
    //console.log(data);  
    con.query("INSERT INTO posts (id,author,topic_id,source,isdustbinned) VALUES (?,?,?,?,?);", [parseIntOrNull(id), data.author, parseIntOrNull(data.topic_id), data.bbcodesource, data.isdustbinned])
}

async function isincache(id) {
    return Boolean(await getfromcache(id));
}

async function leaderboard() {
    con.query("SELECT author, COUNT(author) AS post_count FROM posts GROUP BY author HAVING COUNT(author) > 100 ORDER BY post_count DESC;",function (err, result) {
        if (err) throw err;
        resolve(result);
    });
}

module.exports={ isincache, getfromcache, setincache, leaderboard };