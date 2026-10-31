const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../data/database.sqlite');
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Helper for Promisified DB calls
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});

async function initialize() {
    console.log('Initializing Database...');

    try {
        // Users Table
        await dbRun(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'admin'
        )`);

        // Pages Table
        await dbRun(`CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            title TEXT,
            meta_description TEXT
        )`);

        // Content Table
        await dbRun(`CREATE TABLE IF NOT EXISTS content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER,
            key TEXT,
            value TEXT,
            UNIQUE(page_id, key),
            FOREIGN KEY(page_id) REFERENCES pages(id)
        )`);

        // Applications Table (Vendors)
        await dbRun(`CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            company TEXT,
            contact TEXT,
            email TEXT,
            phone TEXT,
            status TEXT DEFAULT 'pending'
        )`);

        // Seed Admin User
        const adminPass = 'admin123';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(adminPass, salt);
        db.run("INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)", ['admin@adeeb.com', hash]);

        // Import from JSON if exists
        const contentJsonPath = path.join(__dirname, '../data/content.json');
        if (fs.existsSync(contentJsonPath)) {
            const contentData = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8'));
            for (const pageSlug in contentData) {
                let row = await dbGet("SELECT id FROM pages WHERE slug = ?", [pageSlug]);
                let pageId;
                if (!row) {
                    const result = await dbRun("INSERT INTO pages (slug, title) VALUES (?, ?)", [pageSlug, pageSlug.toUpperCase()]);
                    pageId = result.lastID;
                } else {
                    pageId = row.id;
                }

                const fields = contentData[pageSlug];
                for (const key in fields) {
                    await dbRun("INSERT OR REPLACE INTO content (page_id, key, value) VALUES (?, ?, ?)", [pageId, key, fields[key]]);
                }
            }
        }

        const appsJsonPath = path.join(__dirname, '../data/vendor-applications.json');
        if (fs.existsSync(appsJsonPath)) {
            const appsData = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
            for (const app of appsData) {
                await dbRun("INSERT OR IGNORE INTO applications (id, date, company, contact, email, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [app.id, app.date, app.company, app.contact, app.email, app.phone, app.status]);
            }
        }

        console.log('Database Initialized Successfully.');
    } catch (err) {
        console.error('Database Initialization Failed:', err);
    } finally {
        db.close();
    }
}

initialize();
