const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8088);
const ROOT = __dirname;
const LEADS_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'leads');
const LEADS_FILE = path.join(LEADS_DIR, 'registrations.jsonl');

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cache-Control': status === 200 && type.startsWith('text/html') ? 'no-cache' : 'no-store'
  });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload));
}

function clean(value, max) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function serveIndex(res) {
  fs.readFile(path.join(ROOT, 'index.html'), (error, data) => {
    if (error) return send(res, 500, 'שגיאה בטעינת הדף', 'text/plain; charset=utf-8');
    send(res, 200, data, 'text/html; charset=utf-8');
  });
}

function register(req, res) {
  let raw = '';
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 16 * 1024) req.destroy();
  });
  req.on('end', () => {
    let data;
    try { data = JSON.parse(raw || '{}'); }
    catch { return json(res, 400, { success: false, error: 'הבקשה אינה תקינה' }); }

    const website = clean(data.website, 200);
    if (website) return json(res, 200, { success: true, msg: 'ההרשמה התקבלה' });

    const name = clean(data.name, 100);
    const email = clean(data.email, 160).toLowerCase();
    const phone = clean(data.phone, 40);
    if (!name) return json(res, 400, { success: false, error: 'שם הוא שדה חובה' });
    if (!email && !phone) return json(res, 400, { success: false, error: 'יש להזין אימייל או טלפון' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { success: false, error: 'כתובת האימייל אינה תקינה' });
    }

    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name,
      email,
      phone,
      source: 'kavana-batfila'
    };

    try {
      fs.mkdirSync(LEADS_DIR, { recursive: true, mode: 0o700 });
      fs.appendFileSync(LEADS_FILE, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
      json(res, 200, { success: true, msg: 'הרשמתך התקבלה בהצלחה' });
    } catch (error) {
      console.error('Registration write failed:', error.message);
      json(res, 500, { success: false, error: 'לא הצלחנו לשמור את הפרטים. נסו שוב.' });
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return serveIndex(res);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'POST' && url.pathname === '/api/register') return register(req, res);
  send(res, 404, 'לא נמצא', 'text/plain; charset=utf-8');
});

server.listen(PORT, HOST, () => {
  console.log(`כוונה בתפילה: http://${HOST}:${PORT}`);
});
