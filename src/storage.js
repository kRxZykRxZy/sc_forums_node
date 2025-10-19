const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use a local .db file
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening database:", err.message);
    } else {
        console.log("Connected to SQLite database at", dbPath);
    }
});

// Setup tables
function setup() {
    const createTables = `
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY,
            author TEXT,
            topic_id INTEGER,
            source TEXT,
            isdustbinned BOOLEAN NOT NULL,
            is404 BOOLEAN NOT NULL
        );
        CREATE TABLE IF NOT EXISTS claimed (
            n INTEGER NOT NULL
        );
        DELETE FROM claimed;
    `;
    db.exec(createTables, (err) => {
        if (err) throw err;
    });
}
setup();

// Helper to parse integer or null
function parseIntOrNull(i) {
    return i == null ? null : parseInt(i);
}

// Get from cache
function getfromcache(id) {
    return new Promise((resolve, _reject) => {
        db.get("SELECT * FROM posts WHERE id = ?", [id], (err, row) => {
            if (err) throw err;
            if (!row) resolve(false);
            else resolve({
                topic_id: row.topic_id,
                author: row.author,
                bbcodesource: row.source,
                is404: !!row.is404,
                isdustbinned: !!row.isdustbinned
            });
        });
    });
}

// Check if exists in cache
async function isincache(id) {
    return Boolean(await getfromcache(id));
}

// Set in cache
function setincache(id, data) {
    return new Promise((resolve, _reject) => {
        db.run(
            `INSERT OR REPLACE INTO posts (id, author, topic_id, source, isdustbinned, is404)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [parseInt(id), data.author, parseIntOrNull(data.topic_id), data.bbcodesource, data.isdustbinned ? 1 : 0, data.is404 ? 1 : 0],
            function (err) {
                if (err) throw err;
                resolve();
            }
        );
    });
}

// Get next free id
function getnext(claim = false) {
    return new Promise((resolve, _reject) => {
        // Find all ids used in posts or claimed
        db.all("SELECT id as val FROM posts UNION SELECT n as val FROM claimed", [], (err, rows) => {
            if (err) throw err;

            const ids = rows.map(r => r.val).sort((a, b) => a - b);
            let next = 0;

            for (let i = 0; i < ids.length; i++) {
                if (ids[i] !== next) break;
                next++;
            }

            if (claim) {
                db.run("INSERT INTO claimed (n) VALUES (?)", [next], (err2) => {
                    if (err2) throw err2;
                    resolve(next);
                });
            } else {
                resolve(next);
            }
        });
    });
}

// Leaderboard
function leaderboard() {
    return new Promise((resolve, _reject) => {
        db.all(
            `SELECT author, COUNT(author) AS post_count 
             FROM posts 
             GROUP BY author 
             ORDER BY post_count DESC 
             LIMIT 50`,
            [],
            (err, rows) => {
                if (err) throw err;
                const result = rows.map(r => [r.author, r.post_count]);
                resolve(result);
            }
        );
    });
}

module.exports = { isincache, getfromcache, setincache, leaderboard, getnext };
