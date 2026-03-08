import type { ServerResponse } from 'node:http';
import type Database from 'better-sqlite3';

import { getReadDb, getSession, getRequestsBySession, listSessions, upsertEndpoint, saveSpec } from './database.js';
import { analyzeRequests, toEndpointRecords } from './pattern-analyzer.js';
import { generateOpenApiSpec } from './openapi-generator.js';
import { renderSessionsPage, renderSessionDetailPage } from './ui/pages-sessions.js';
import { renderObservePage } from './ui/pages-observe.js';
import { renderAnalysisPage, renderAnalysisResultPage } from './ui/pages-analysis.js';
import { renderOpenApiPage, renderOpenApiSpecPage } from './ui/pages-openapi.js';
import { renderExtractPage, renderExtractConfigPage } from './ui/pages-extract.js';
import { renderHelpPage } from './ui/pages-help.js';
import { getExtractableEndpoints } from './data-extractor.js';

interface PageContext {
  db: Database.Database;
  port: number;
  sendHtml: (res: ServerResponse, html: string) => void;
  sendError: (res: ServerResponse, status: number, message: string) => void;
}

export function createPageRouter(ctx: PageContext) {
  return function handlePageRoutes(res: ServerResponse, path: string): boolean {
    if (path === '/' || path === '/index.html') {
      const rdb = getReadDb();
      const sessions = listSessions(rdb);
      rdb.close();
      ctx.sendHtml(res, renderSessionsPage(sessions, ctx.port));
      return true;
    }

    if (path === '/observe') {
      ctx.sendHtml(res, renderObservePage(ctx.port));
      return true;
    }

    if (path === '/analysis') {
      const rdb = getReadDb();
      const sessions = listSessions(rdb);
      rdb.close();
      ctx.sendHtml(res, renderAnalysisPage(ctx.port, sessions));
      return true;
    }

    const analysisMatch = path.match(/^\/analysis\/(\d+)$/);
    if (analysisMatch) {
      return handleAnalysisDetail(res, Number(analysisMatch[1]), ctx);
    }

    if (path === '/openapi') {
      const rdb = getReadDb();
      const sessions = listSessions(rdb);
      rdb.close();
      ctx.sendHtml(res, renderOpenApiPage(ctx.port, sessions));
      return true;
    }

    const openapiMatch = path.match(/^\/openapi\/(\d+)$/);
    if (openapiMatch) {
      return handleOpenApiDetail(res, Number(openapiMatch[1]), ctx);
    }

    if (path === '/help') {
      ctx.sendHtml(res, renderHelpPage(ctx.port));
      return true;
    }

    if (path === '/extract') {
      const rdb = getReadDb();
      const sessions = listSessions(rdb);
      rdb.close();
      ctx.sendHtml(res, renderExtractPage(ctx.port, sessions));
      return true;
    }

    const extractMatch = path.match(/^\/extract\/(\d+)$/);
    if (extractMatch) {
      return handleExtractDetail(res, Number(extractMatch[1]), ctx);
    }

    const sessionMatch = path.match(/^\/session\/(\d+)$/);
    if (sessionMatch) {
      return handleSessionDetail(res, Number(sessionMatch[1]), ctx);
    }

    return false;
  };
}

function handleAnalysisDetail(res: ServerResponse, id: number, ctx: PageContext): true {
  const rdb = getReadDb();
  const session = getSession(rdb, id);
  if (!session) { rdb.close(); ctx.sendError(res, 404, 'Session not found'); return true; }
  const requests = getRequestsBySession(rdb, id);
  rdb.close();
  const analysis = analyzeRequests(requests);
  for (const ep of toEndpointRecords(id, analysis)) upsertEndpoint(ctx.db, ep);
  ctx.sendHtml(res, renderAnalysisResultPage(session, analysis, ctx.port));
  return true;
}

function handleOpenApiDetail(res: ServerResponse, id: number, ctx: PageContext): true {
  const rdb = getReadDb();
  const session = getSession(rdb, id);
  if (!session) { rdb.close(); ctx.sendError(res, 404, 'Session not found'); return true; }
  const requests = getRequestsBySession(rdb, id);
  rdb.close();
  const spec = generateOpenApiSpec(requests, session.name, session.targetUrl);
  saveSpec(ctx.db, id, JSON.stringify(spec));
  ctx.sendHtml(res, renderOpenApiSpecPage(
    session,
    { id: 0, sessionId: id, openapiJson: JSON.stringify(spec), generatedAt: new Date().toISOString() },
    ctx.port,
  ));
  return true;
}

function handleExtractDetail(res: ServerResponse, id: number, ctx: PageContext): true {
  const rdb = getReadDb();
  const session = getSession(rdb, id);
  if (!session) { rdb.close(); ctx.sendError(res, 404, 'Session not found'); return true; }
  rdb.close();
  const endpoints = getExtractableEndpoints(ctx.db, id);
  ctx.sendHtml(res, renderExtractConfigPage(session, endpoints, ctx.port));
  return true;
}

function handleSessionDetail(res: ServerResponse, id: number, ctx: PageContext): true {
  const rdb = getReadDb();
  const session = getSession(rdb, id);
  if (!session) { rdb.close(); ctx.sendError(res, 404, 'Session not found'); return true; }
  const requests = getRequestsBySession(rdb, id);
  rdb.close();
  ctx.sendHtml(res, renderSessionDetailPage(session, requests, ctx.port));
  return true;
}
