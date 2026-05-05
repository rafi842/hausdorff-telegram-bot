// ═══════════════════════════════════════════════════════════════════════════════
// webhook.js — שרת HTTP לקבלת ווב-הוקים מה-CRM Backend
// POST /webhook/lead  → ליד חדש
// ═══════════════════════════════════════════════════════════════════════════════

const http = require('http');
const config = require('./config');

function start(bot, leadsModule) {
  const PORT   = config.WEBHOOK_PORT   || 3001;
  const SECRET = config.WEBHOOK_SECRET || '';

  const server = http.createServer((req, res) => {

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'hausdorff-bot-webhook' }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405); res.end('Method Not Allowed');
      return;
    }

    if (SECRET && req.headers['x-webhook-secret'] !== SECRET) {
      console.warn(`Webhook: unauthorized from ${req.socket.remoteAddress}`);
      res.writeHead(401); res.end('Unauthorized');
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        console.log(`📥 Webhook [${req.url}]`, JSON.stringify(payload).slice(0, 120));
        _route(bot, leadsModule, req.url, payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('Webhook parse error:', e.message);
        res.writeHead(400); res.end('Bad Request');
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`🔔 Webhook server listening on port ${PORT}`);
    console.log(`   POST http://0.0.0.0:${PORT}/webhook/lead`);
  });

  server.on('error', e => console.error('Webhook server error:', e.message));
}

function _route(bot, leadsModule, url, payload) {
  const path = url.split('?')[0];

  if (path === '/webhook/lead' || path === '/webhook/leads') {
    const lead = payload.lead || payload.data || payload;
    if (lead && (lead.id || lead.first_name)) {
      leadsModule.handleNewLead(bot, lead).catch(e =>
        console.error('handleNewLead error:', e.message)
      );
    } else {
      console.warn('Webhook /lead: לא זוהה שדה lead תקין', payload);
    }
    return;
  }

  console.log(`Webhook: נתיב לא מוכר ${url}`);
}

module.exports = { start };
