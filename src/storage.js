var mysql = require('mysql');
var dbconfig = require('../dbconfig.json');

var con = mysql.createPool({
    host: dbconfig.host,
    port: dbconfig.port,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database,
    multipleStatements: true,
    connectionLimit: 100
});

async function setup() {
    con.query("CREATE TABLE IF NOT EXISTS `posts` (`id` INT NOT NULL,`author` TINYTEXT, `topic_id` INT, `source` MEDIUMTEXT, `isdustbinned` BOOLEAN NOT NULL, `is404` BOOLEAN NOT NULL, PRIMARY KEY (`id`));CREATE TABLE IF NOT EXISTS `claimed`(n INT NOT NULL);DELETE FROM claimed;", function (err, _result) {
        if (err) throw err;
    });
}
setup();

function getfromcache(id) {
    console.log("Getting from cache");
    return new Promise((resolve, _reject) => {
        con.query("SELECT * FROM posts WHERE id = ?", [id], function (err, result) {
            if (err) throw err;
            if (result.length == 0) {
                resolve(false);
            } else {
                let i = result[0];
                console.log("Done getting from cache");
                resolve({ "topic_id": i.topic_id, "author": i.author, "bbcodesource": i.source, "is404": i.is404, "isdustbinned": i.isdustbinned });
            }
        });
    });
}

function parseIntOrNull(i) {
    return i == null ? null : parseInt(i);
}

async function setincache(id, data) {
    console.log("Setting in cache");
    con.query("INSERT INTO posts (id,author,topic_id,source,isdustbinned,is404) VALUES (?,?,?,?,?,?);", [parseInt(id), data.author, parseIntOrNull(data.topic_id), data.bbcodesource, data.isdustbinned, data.is404])
}

async function isincache(id) {
    return Boolean(await getfromcache(id));
}

function getnext(claim=false) {
    console.log("Getting next");
    return new Promise((resolve, _reject) => {
        let query = claim ? "SELECT @a := id FROM (SELECT id FROM posts UNION SELECT n as id FROM claimed) p1 WHERE (SELECT count(id) FROM (SELECT id FROM posts UNION SELECT n as id FROM claimed) p2 WHERE p2.id=p1.id+1)=0; INSERT into claimed (n) values (@a); SELECT @a as firstfree;" : "SELECT id as firstfree FROM (SELECT id FROM posts UNION SELECT n as id FROM claimed) p1 WHERE (SELECT count(id) FROM (SELECT id FROM posts UNION SELECT n as id FROM claimed) p2 WHERE p2.id=p1.id+1)=0;";
        con.query(query, function (err, result) {
            if (err) throw err;
            if (result.length == 0) {
                resolve(false);
            } else {
                let i;
                if (claim) {
                    i = result[2][0];
                } else {
                    i = result[0];
                }
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