// The HTTP wrapper around the pure dispatch (dispatch.mjs). Binds localhost
// only, reads the body, answers JSON, and fails loudly on a busy port. Never
// makes an outbound request and never proxies to the live API.
import http from 'node:http';
import { dispatch } from './dispatch.mjs';

const PORT = 8787;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, X-Turnstile-Token',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let answer;
    try {
      // The client appends ?locale= to reads; route on the pathname alone.
      const { pathname } = new URL(req.url, 'http://localhost');
      answer = dispatch(req.method, pathname, rawBody, req.headers);
    } catch {
      answer = { status: 400, body: { error: 'malformed request url' } };
    }
    const { status, body, cors } = answer;
    res.writeHead(status, {
      ...CORS,
      ...(cors ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[mock] port ${PORT} is busy. Close whatever is using it, then run 'npm run dev:mock' again.`);
    process.exitCode = 1;
    return;
  }
  console.error('[mock] server failed:', err);
});

server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, 'localhost', () => {
  console.log(`[mock] answering on http://localhost:${PORT} (fake data, nothing real sent anywhere)`);
});
