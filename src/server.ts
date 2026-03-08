import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer, type WebSocket } from 'ws';

import { initDatabase, finishSession } from './database.js';
import { stopBrowserSession } from './session-manager.js';
import { stopScreencast } from './screencast-bridge.js';
import { portSchema } from './validation.js';
import { createApiRouter } from './routes-api.js';
import { createPageRouter } from './routes-pages.js';
import type { WsMessage } from './types.js';

const PORT = portSchema.parse(Number(process.env.PORT) || 3300);
const HOST = '127.0.0.1';
const ALLOWED_ORIGIN = `http://${HOST}:${PORT}`;

const __dirname = join(fileURLToPath(import.meta.url), '..');
const PUBLIC_DIR = resolve(join(__dirname, 'ui', 'public'));

const db = initDatabase();
const wsClients = new Set<WebSocket>();
let activeSessionId: number | null = null;

function broadcast(msg: WsMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of wsClients) {
    if (client.readyState === 1) client.send(payload);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:",
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
    if (chunks.reduce((s, c) => s + c.length, 0) > 1_048_576) {
      throw new Error('Request body too large');
    }
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** M-3 fix: validate Origin header on state-mutating requests */
function isOriginAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  // No origin header = same-origin request (not cross-origin)
  if (!origin) return true;
  return origin === ALLOWED_ORIGIN;
}

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(res: ServerResponse, filePath: string): boolean {
  const ext = extname(filePath);
  const mime = MIME_TYPES[ext];
  if (!mime) return false;
  // L-2 fix: normalize and verify path stays within PUBLIC_DIR
  const resolved = resolve(normalize(filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) return false;
  try {
    const content = readFileSync(resolved);
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

const handleApiRoutes = createApiRouter({
  db,
  broadcast,
  getActiveSessionId: () => activeSessionId,
  setActiveSessionId: (id) => { activeSessionId = id; },
  sendJson,
  sendError,
  readBody,
  securityHeaders: SECURITY_HEADERS,
});

const handlePageRoutes = createPageRouter({ db, port: PORT, sendHtml, sendError });

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  try {
    if (path === '/healthz') { sendJson(res, 200, { status: 'ok' }); return; }
    if (path === '/readyz') { sendJson(res, 200, { status: 'ok', db: true }); return; }

    // M-3 fix: CSRF origin check on state-mutating methods
    if ((method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') && !isOriginAllowed(req)) {
      sendError(res, 403, 'Forbidden: invalid origin');
      return;
    }

    if (await handleApiRoutes(req, res, path, method)) return;

    if (path.startsWith('/public/') && method === 'GET') {
      const fileName = path.slice(8);
      if (fileName.includes('..') || fileName.includes('\0')) { sendError(res, 400, 'Invalid path'); return; }
      if (serveStatic(res, join(PUBLIC_DIR, fileName))) return;
      sendError(res, 404, 'Not found');
      return;
    }

    if (handlePageRoutes(res, path)) return;
    sendError(res, 404, 'Not found');
  } catch (err) {
    // L-1 fix: log details server-side, send generic message to client
    console.error('Server error:', err);
    sendError(res, 500, 'Internal server error');
  }
});

// M-4 fix: WebSocket with origin validation
const wss = new WebSocketServer({
  server,
  verifyClient: ({ origin }: { origin: string | undefined }) => {
    // Allow connections without origin (non-browser clients) and from our own origin
    if (!origin) return true;
    return origin === ALLOWED_ORIGIN;
  },
});
wss.on('connection', (ws: WebSocket) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
  ws.send(JSON.stringify({
    type: activeSessionId ? 'session-started' : 'session-stopped',
    data: { sessionId: activeSessionId },
  }));
});

function shutdown(): void {
  console.log('Shutting down...');
  stopScreencast().catch(() => {});
  stopBrowserSession().catch(() => {});
  if (activeSessionId !== null) finishSession(db, activeSessionId, 'completed');
  wss.close();
  server.close();
  db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, HOST, () => {
  console.log(`API Observer: http://${HOST}:${PORT}`);
});
