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
    con.query("CREATE TABLE IF NOT EXISTS `posts` (`id` INT NOT NULL,`author` TINYTEXT, `topic_id` INT, `source` MEDIUMTEXT, `isdustbinned` BOOLEAN NOT NULL, `is404` BOOLEAN NOT NULL, PRIMARY KEY (`id`))", function (err, _result) {
        if (err) throw err;
    });
}
setup();

function getfromcache(id) {
    return new Promise((resolve, _reject) => {
        con.query("SELECT * FROM posts WHERE id = ?", [id], function (err, result) {
            if (err) throw err;
            if (result.length == 0) {
                resolve(false);
            } else {
                let i = result[0];
                resolve({ "topic_id": i.topic_id, "author": i.author, "bbcodesource": i.source, "is404": i.is404, "isdustbinned": i.isdustbinned });
            }
        });
    });
}

function parseIntOrNull(i) {
    return i == null ? null : parseInt(i);
}

async function setincache(id, data) {
    con.query("INSERT INTO posts (id,author,topic_id,source,isdustbinned,is404) VALUES (?,?,?,?,?,?);", [parseInt(id), data.author, parseIntOrNull(data.topic_id), data.bbcodesource, data.isdustbinned, data.is404])
}

async function isincache(id) {
    return Boolean(await getfromcache(id));
}

function getnext(claim=false) {
    return new Promise((resolve, _reject) => {
        con.query("SELECT MIN(a.id) + 1 AS firstfree FROM (SELECT id FROM posts UNION SELECT 0) a LEFT JOIN posts b ON b.id = a.id + 1 WHERE b.id IS NULL;", function (err, result) {
            if (err) throw err;
            if (result.length == 0) {
                resolve(false);
            } else {
                let i = result[0];
                resolve(i.firstfree);
            }
        });
    })

}

function leaderboard() {
    return new Promise((resolve, _reject) => {
        con.query("SELECT author, COUNT(author) AS post_count FROM posts GROUP BY author ORDER BY post_count DESC LIMIT 50;", function (err, result) {
            if (err) throw err;
            let new_arr = [];
            result.forEach((i) => {
                new_arr.push([i.author, i.post_count])
            });
            resolve(new_arr);
        });
    });
}

module.exports = { isincache, getfromcache, setincache, leaderboard, getnext };