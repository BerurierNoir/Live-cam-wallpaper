'use strict';
const http = require('http');

let _server = null;
const PORT  = 1985;

function start(onEvent) {
  if (_server) return;
  _server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        if (typeof onEvent === 'function') onEvent(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
  _server.listen(PORT, '0.0.0.0', () => console.log(`[webhook] port ${PORT}`));
  _server.on('error', e => console.error('[webhook]', e.message));
}

function stop() {
  if (_server) { try { _server.close(); } catch (_) {} _server = null; }
}

function isRunning() { return !!_server; }
function getPort()   { return PORT; }

module.exports = { start, stop, isRunning, getPort };
