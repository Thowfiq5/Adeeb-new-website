const http = require('http');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const PORT = 3000;
const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const JWT_SECRET = 'adeeb-secret-123';

const db = new sqlite3.Database(DB_PATH);

// Helper for Promisified DB calls
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function verifyToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // --- STATIC FILES ---
    if (!url.pathname.startsWith('/api')) {
      let filePath = '.' + url.pathname;
      if (filePath === './') filePath = './Index.html';

      const extname = String(path.extname(filePath)).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
      };

      const contentType = mimeTypes[extname] || 'application/octet-stream';

      fs.readFile(filePath, (error, content) => {
        if (error) {
          if (error.code == 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found: ' + filePath }));
          } else {
            res.writeHead(500);
            res.end('Server error: ' + error.code);
          }
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
      return;
    }

    // --- AUTH API ---
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      const user = await dbGet("SELECT * FROM users WHERE username = ?", [username]);

      if (user && await bcrypt.compare(password, user.password_hash)) {
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ token }));
      }
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid credentials' }));
    }

    // --- CONTENT API ---
    if (url.pathname === '/api/content' && req.method === 'GET') {
      const rows = await dbAll(`
                SELECT p.slug, c.key, c.value 
                FROM content c 
                JOIN pages p ON c.page_id = p.id
            `);
      const content = {};
      rows.forEach(row => {
        if (!content[row.slug]) content[row.slug] = {};
        content[row.slug][row.key] = row.value;
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(content));
    }

    if (url.pathname === '/api/content' && req.method === 'POST') {
      const user = verifyToken(req);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      const body = await readBody(req);
      for (const pageSlug in body) {
        const page = await dbGet("SELECT id FROM pages WHERE slug = ?", [pageSlug]);
        if (page) {
          for (const key in body[pageSlug]) {
            await dbRun(
              "INSERT OR REPLACE INTO content (page_id, key, value) VALUES (?, ?, ?)",
              [page.id, key, body[pageSlug][key]]
            );
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // --- PAGES/SEO API ---
    if (url.pathname === '/api/pages' && req.method === 'GET') {
      const pages = await dbAll("SELECT * FROM pages");
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(pages));
    }

    if (url.pathname.startsWith('/api/pages/') && req.method === 'PATCH') {
      const user = verifyToken(req);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      const slug = url.pathname.split('/').pop();
      const { title, meta_description } = await readBody(req);
      await dbRun(
        "UPDATE pages SET title = ?, meta_description = ? WHERE slug = ?",
        [title, meta_description, slug]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // --- VENDOR APPLICATIONS API ---
    if (url.pathname === '/api/vendor-applications' && req.method === 'GET') {
      const apps = await dbAll("SELECT * FROM applications ORDER BY date DESC");
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(apps));
    }

    if (url.pathname === '/api/vendor-applications' && req.method === 'POST') {
      const body = await readBody(req);
      const date = new Date().toISOString().slice(0, 10);
      const result = await dbRun(
        "INSERT INTO applications (date, company, contact, email, phone, status) VALUES (?, ?, ?, ?, ?, ?)",
        [date, body.company, body.contact, body.email, body.phone, 'pending']
      );
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ id: result.lastID, date, status: 'pending' }));
    }

    // --- MEDIA API ---
    if (url.pathname === '/api/media' && req.method === 'GET') {
      const mediaDir = path.join(__dirname, 'images', 'uploads');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      const files = fs.readdirSync(mediaDir).map(file => ({
        name: file,
        url: `/images/uploads/${file}`
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(files));
    }

    if (url.pathname === '/api/media' && req.method === 'POST') {
      const user = verifyToken(req);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      const formidable = require('formidable');
      const form = new formidable.IncomingForm();
      const uploadDir = path.join(__dirname, 'images', 'uploads');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      form.uploadDir = uploadDir;
      form.keepExtensions = true;

      form.parse(req, (err, fields, files) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Upload failed' }));
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        // detailed response for client-side use
        const uploadedFile = files.image || files.file; // standard key might vary
        const fileName = path.basename(uploadedFile.filepath);
        res.end(JSON.stringify({ success: true, file: fileName, url: `/images/uploads/${fileName}` }));
      });
      return;
    }

    if (url.pathname.startsWith('/api/media/') && req.method === 'DELETE') {
      const user = verifyToken(req);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      const filename = url.pathname.split('/').pop();
      const filePath = path.join(__dirname, 'images', 'uploads', filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'File not found' }));
      }
    }

    // --- SETTINGS API ---
    if (url.pathname === '/api/admin/change-password' && req.method === 'POST') {
      const user = verifyToken(req);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      const { currentPassword, newPassword } = await readBody(req);
      const adminUser = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);

      if (!adminUser || !(await bcrypt.compare(currentPassword, adminUser.password_hash))) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Incorrect current password' }));
      }

      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(newPassword, salt);
      await dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // --- VENDOR APPLICATIONS API --- (existing code follows)
    if (url.pathname.startsWith('/api/vendor-applications/') && req.method === 'PATCH') {
      const user = verifyToken(req);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      const id = url.pathname.split('/').pop();
      const { status } = await readBody(req);
      await dbRun("UPDATE applications SET status = ? WHERE id = ?", [status, id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));

  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Enterprise Server listening on http://localhost:${PORT}`);
});
