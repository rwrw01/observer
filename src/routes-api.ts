import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type Database from 'better-sqlite3';

import {
  getReadDb,
  createSession,
  finishSession,
  getSession,
  listSessions,
  getRequestsBySession,
  getRequestCount,
  upsertEndpoint,
  getLatestSpec,
  saveSpec,
  deleteSession,
} from './database.js';
import { startBrowserSession, stopBrowserSession, hasBrowserSession, getActiveBrowserSession } from './session-manager.js';
import { extractAndStoreCookies } from './cookie-extractor.js';
import { attachInterceptor } from './request-interceptor.js';
import { startScreencast, stopScreencast } from './screencast-bridge.js';
import { importHarFile } from './har-importer.js';
import { analyzeRequests, toEndpointRecords } from './pattern-analyzer.js';
import { generateOpenApiSpec } from './openapi-generator.js';
import { startExtraction, stopExtraction, getExtractionProgress } from './data-extractor.js';
import { sessionConfigSchema, harImportSchema, extractConfigSchema } from './validation.js';
import type { RequestEvent, WsMessage } from './types.js';

interface RouteContext {
  db: Database.Database;
  broadcast: (msg: WsMessage) => void;
  getActiveSessionId: () => number | null;
  setActiveSessionId: (id: number | null) => void;
  sendJson: (res: ServerResponse, status: number, data: unknown) => void;
  sendError: (res: ServerResponse, status: number, message: string) => void;
  readBody: (req: IncomingMessage) => Promise<string>;
  securityHeaders: Record<string, string>;
}

export function createApiRouter(ctx: RouteContext) {
  return async function handleApiRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    method: string,
  ): Promise<boolean> {
    if (path === '/api/sessions' && method === 'GET') {
      const rdb = getReadDb();
      ctx.sendJson(res, 200, listSessions(rdb));
      rdb.close();
      return true;
    }

    if (path === '/api/sessions' && method === 'POST') {
      return handleCreateSession(req, res, ctx);
    }

    if (path === '/api/sessions/active' && method === 'DELETE') {
      return handleStopSession(res, ctx);
    }

    const sessionMatch = path.match(/^\/api\/sessions\/(\d+)$/);
    if (sessionMatch && method === 'GET') {
      const id = Number(sessionMatch[1]);
      const rdb = getReadDb();
      const session = getSession(rdb, id);
      if (!session) { rdb.close(); ctx.sendError(res, 404, 'Session not found'); return true; }
      const requestCount = getRequestCount(rdb, id);
      rdb.close();
      ctx.sendJson(res, 200, { ...session, requestCount });
      return true;
    }

    if (sessionMatch && method === 'DELETE') {
      const id = Number(sessionMatch[1]);
      if (ctx.getActiveSessionId() === id) { ctx.sendError(res, 409, 'Cannot delete active session'); return true; }
      const rdb = getReadDb();
      const session = getSession(rdb, id);
      rdb.close();
      if (!session) { ctx.sendError(res, 404, 'Session not found'); return true; }
      deleteSession(ctx.db, id);
      ctx.sendJson(res, 200, { deleted: true, id });
      return true;
    }

    const requestsMatch = path.match(/^\/api\/sessions\/(\d+)\/requests$/);
    if (requestsMatch && method === 'GET') {
      const rdb = getReadDb();
      ctx.sendJson(res, 200, getRequestsBySession(rdb, Number(requestsMatch[1])));
      rdb.close();
      return true;
    }

    if (path === '/api/import-har' && method === 'POST') {
      const body = JSON.parse(await ctx.readBody(req));
      const config = harImportSchema.parse(body);
      // H-1 fix: resolve path and verify it doesn't traverse outside cwd
      const resolvedPath = resolve(config.filePath);
      if (resolvedPath.includes('..') || resolvedPath.includes('\0')) {
        ctx.sendError(res, 400, 'Invalid file path');
        return true;
      }
      const result = importHarFile(ctx.db, resolvedPath, config.name, config.apiFilter);
      ctx.sendJson(res, 201, result);
      return true;
    }

    const analyzeMatch = path.match(/^\/api\/sessions\/(\d+)\/analyze$/);
    if (analyzeMatch && method === 'POST') {
      return handleAnalyze(res, Number(analyzeMatch[1]), ctx);
    }

    const specJsonMatch = path.match(/^\/api\/specs\/(\d+)\/json$/);
    if (specJsonMatch && method === 'GET') {
      return handleSpecDownload(res, Number(specJsonMatch[1]), 'json', ctx);
    }

    const specYamlMatch = path.match(/^\/api\/specs\/(\d+)\/yaml$/);
    if (specYamlMatch && method === 'GET') {
      return handleSpecDownload(res, Number(specYamlMatch[1]), 'yaml', ctx);
    }

    if (path === '/api/extract' && method === 'POST') {
      const body = JSON.parse(await ctx.readBody(req));
      const config = extractConfigSchema.parse(body);
      // H-2 fix: block requests to private/link-local IPs
      const targetHost = new URL(config.baseUrl).hostname;
      if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|localhost$)/i.test(targetHost)) {
        ctx.sendError(res, 400, 'Extraction to private/local addresses is not allowed');
        return true;
      }
      const result = await startExtraction(ctx.db, config);
      ctx.sendJson(res, 200, result);
      return true;
    }

    if (path === '/api/extract/stop' && method === 'POST') {
      stopExtraction();
      ctx.sendJson(res, 200, { stopped: true });
      return true;
    }

    if (path === '/api/extract/progress' && method === 'GET') {
      const progress = getExtractionProgress();
      ctx.sendJson(res, 200, progress ?? { status: 'idle' });
      return true;
    }

    if (path === '/api/status' && method === 'GET') {
      ctx.sendJson(res, 200, { activeSessionId: ctx.getActiveSessionId(), hasBrowser: hasBrowserSession() });
      return true;
    }

    return false;
  };
}

async function handleCreateSession(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<true> {
  const body = JSON.parse(await ctx.readBody(req));
  const config = sessionConfigSchema.parse(body);
  if (hasBrowserSession()) { ctx.sendError(res, 409, 'A browser session is already active'); return true; }

  const session = createSession(ctx.db, config.name, config.targetUrl, 'live');
  ctx.setActiveSessionId(session.id);
  const bs = await startBrowserSession(config.targetUrl);

  attachInterceptor(bs.page, ctx.db, session.id, config.apiFilter, (event: RequestEvent) =>
    ctx.broadcast({ type: 'request', data: event }),
  );

  startScreencast(bs.page, ctx.broadcast).catch((err: unknown) =>
    console.error('Screencast error:', err),
  );

  bs.browser.on('disconnected', () => {
    if (ctx.getActiveSessionId() === session.id) {
      stopScreencast().catch(() => {});
      // Cookies already extracted before disconnect if possible
      finishSession(ctx.db, session.id, 'completed');
      ctx.setActiveSessionId(null);
      ctx.broadcast({ type: 'session-stopped', data: { sessionId: session.id } });
    }
  });

  ctx.broadcast({ type: 'session-started', data: session });
  ctx.sendJson(res, 201, session);
  return true;
}

async function handleStopSession(res: ServerResponse, ctx: RouteContext): Promise<true> {
  const sid = ctx.getActiveSessionId();
  if (!hasBrowserSession() || sid === null) { ctx.sendError(res, 404, 'No active session'); return true; }

  // Extract cookies before closing browser
  const bs = getActiveBrowserSession();
  if (bs) {
    try {
      const count = await extractAndStoreCookies(bs.context, ctx.db, sid);
      console.log(`Extracted ${count} cookies from session ${sid}`);
    } catch (err) { console.error('Cookie extraction error:', err); }
  }

  await stopScreencast();
  await stopBrowserSession();
  finishSession(ctx.db, sid, 'completed');
  ctx.setActiveSessionId(null);
  ctx.broadcast({ type: 'session-stopped', data: { sessionId: sid } });
  ctx.sendJson(res, 200, { stopped: true });
  return true;
}

function handleAnalyze(res: ServerResponse, id: number, ctx: RouteContext): true {
  const rdb = getReadDb();
  const session = getSession(rdb, id);
  if (!session) { rdb.close(); ctx.sendError(res, 404, 'Session not found'); return true; }
  const requests = getRequestsBySession(rdb, id);
  rdb.close();
  const analysis = analyzeRequests(requests);
  for (const ep of toEndpointRecords(id, analysis)) upsertEndpoint(ctx.db, ep);
  const spec = generateOpenApiSpec(requests, session.name, session.targetUrl);
  saveSpec(ctx.db, id, JSON.stringify(spec));
  ctx.sendJson(res, 200, analysis);
  return true;
}

async function handleSpecDownload(res: ServerResponse, id: number, format: 'json' | 'yaml', ctx: RouteContext): Promise<true> {
  const rdb = getReadDb();
  const spec = getLatestSpec(rdb, id);
  rdb.close();
  if (!spec) { ctx.sendError(res, 404, 'No spec generated yet'); return true; }

  if (format === 'yaml') {
    const { stringify } = await import('yaml');
    const yamlContent = stringify(JSON.parse(spec.openapiJson));
    res.writeHead(200, { ...ctx.securityHeaders, 'Content-Type': 'text/yaml; charset=utf-8', 'Content-Disposition': 'attachment; filename="openapi.yaml"' });
    res.end(yamlContent);
  } else {
    res.writeHead(200, { ...ctx.securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="openapi.json"' });
    res.end(spec.openapiJson);
  }
  return true;
}
