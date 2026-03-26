import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CapturedRequest, Cookie, Endpoint, Session, Spec } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'observer.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'live',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  query_params TEXT,
  request_headers TEXT,
  request_body TEXT,
  response_status INTEGER,
  response_headers TEXT,
  response_body TEXT,
  content_type TEXT,
  duration_ms INTEGER,
  is_graphql INTEGER DEFAULT 0,
  graphql_operation TEXT
);

CREATE TABLE IF NOT EXISTS cookies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  domain TEXT NOT NULL,
  path TEXT DEFAULT '/',
  expires TEXT,
  http_only INTEGER DEFAULT 0,
  secure INTEGER DEFAULT 0,
  same_site TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  pattern TEXT NOT NULL,
  methods TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  avg_response_ms INTEGER,
  request_schema TEXT,
  response_schema TEXT,
  is_graphql INTEGER DEFAULT 0,
  UNIQUE(session_id, pattern)
);

CREATE TABLE IF NOT EXISTS specs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  openapi_json TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_headers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  domain TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, name, domain)
);

CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(session_id);
CREATE INDEX IF NOT EXISTS idx_cookies_session ON cookies(session_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_session ON endpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_auth_headers_session ON auth_headers(session_id);
`;

/** Open database with WAL mode, create schema if needed */
export function initDatabase(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  return db;
}

/** Safe migrations for existing databases */
function runMigrations(db: Database.Database): void {
  const columns = db.pragma('table_info(sessions)') as Array<{ name: string }>;
  const hasColumn = columns.some((c) => c.name === 'capture_auth_headers');
  if (!hasColumn) {
    db.exec('ALTER TABLE sessions ADD COLUMN capture_auth_headers INTEGER NOT NULL DEFAULT 0');
  }
}

/** Open read-only database connection */
export function getReadDb(): Database.Database {
  return new Database(DB_PATH, { readonly: true });
}

// -- Session queries --

export function createSession(
  db: Database.Database,
  name: string,
  targetUrl: string,
  source: 'live' | 'har' = 'live',
  captureAuthHeaders = false,
): Session {
  const stmt = db.prepare(
    'INSERT INTO sessions (name, target_url, source, capture_auth_headers) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(name, targetUrl, source, captureAuthHeaders ? 1 : 0);
  return getSession(db, Number(result.lastInsertRowid))!;
}

export function getSession(db: Database.Database, id: number): Session | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapSession(row) : undefined;
}

export function listSessions(db: Database.Database): Session[] {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as Record<string, unknown>[];
  return rows.map(mapSession);
}

export function finishSession(db: Database.Database, id: number, status: 'completed' | 'failed'): void {
  db.prepare(
    "UPDATE sessions SET status = ?, finished_at = datetime('now') WHERE id = ?"
  ).run(status, id);
}

export function deleteSession(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM specs WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM endpoints WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM auth_headers WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM cookies WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM requests WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// -- Request queries --

const INSERT_REQUEST_SQL = `INSERT INTO requests
  (session_id, timestamp, method, url, path, query_params, request_headers,
   request_body, response_status, response_headers, response_body,
   content_type, duration_ms, is_graphql, graphql_operation)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function insertRequest(
  db: Database.Database,
  r: Omit<CapturedRequest, 'id'>
): number {
  const result = db.prepare(INSERT_REQUEST_SQL).run(
    r.sessionId, r.timestamp, r.method, r.url, r.path,
    r.queryParams, r.requestHeaders, r.requestBody,
    r.responseStatus, r.responseHeaders, r.responseBody,
    r.contentType, r.durationMs, r.isGraphql, r.graphqlOperation
  );
  return Number(result.lastInsertRowid);
}

export function getRequestsBySession(db: Database.Database, sessionId: number): CapturedRequest[] {
  const rows = db.prepare(
    'SELECT * FROM requests WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId) as Record<string, unknown>[];
  return rows.map(mapRequest);
}

export function getRequestCount(db: Database.Database, sessionId: number): number {
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM requests WHERE session_id = ?'
  ).get(sessionId) as { cnt: number };
  return row.cnt;
}

// -- Auth header queries --

const UPSERT_AUTH_HEADER_SQL = `INSERT INTO auth_headers
  (session_id, name, value, domain)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(session_id, name, domain) DO UPDATE SET value = excluded.value, captured_at = datetime('now')`;

export function upsertAuthHeader(
  db: Database.Database,
  sessionId: number,
  name: string,
  encryptedValue: string,
  domain: string,
): void {
  db.prepare(UPSERT_AUTH_HEADER_SQL).run(sessionId, name, encryptedValue, domain);
}

export function getAuthHeadersBySession(
  db: Database.Database,
  sessionId: number,
  domain: string,
): Array<{ name: string; value: string }> {
  const escapedDomain = domain.replace(/%/g, '\\%').replace(/_/g, '\\_');
  return db.prepare(
    "SELECT name, value FROM auth_headers WHERE session_id = ? AND domain LIKE ? ESCAPE '\\'"
  ).all(sessionId, `%${escapedDomain}`) as Array<{ name: string; value: string }>;
}

// -- Endpoint queries --

const INSERT_ENDPOINT_SQL = `INSERT OR REPLACE INTO endpoints
  (session_id, pattern, methods, request_count, avg_response_ms,
   request_schema, response_schema, is_graphql)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

export function upsertEndpoint(db: Database.Database, e: Omit<Endpoint, 'id'>): void {
  db.prepare(INSERT_ENDPOINT_SQL).run(
    e.sessionId, e.pattern, e.methods, e.requestCount,
    e.avgResponseMs, e.requestSchema, e.responseSchema, e.isGraphql,
  );
}

export function getEndpointsBySession(db: Database.Database, sessionId: number): Endpoint[] {
  const rows = db.prepare(
    'SELECT * FROM endpoints WHERE session_id = ? ORDER BY request_count DESC'
  ).all(sessionId) as Record<string, unknown>[];
  return rows.map(mapEndpoint);
}

// -- Spec queries --

export function saveSpec(db: Database.Database, sessionId: number, openapiJson: string): number {
  const result = db.prepare(
    'INSERT INTO specs (session_id, openapi_json) VALUES (?, ?)'
  ).run(sessionId, openapiJson);
  return Number(result.lastInsertRowid);
}

export function getLatestSpec(db: Database.Database, sessionId: number): Spec | undefined {
  const row = db.prepare(
    'SELECT * FROM specs WHERE session_id = ? ORDER BY generated_at DESC LIMIT 1'
  ).get(sessionId) as Record<string, unknown> | undefined;
  return row ? mapSpec(row) : undefined;
}

// -- Row mappers (snake_case → camelCase) --

function mapSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as number,
    name: row.name as string,
    targetUrl: row.target_url as string,
    source: row.source as 'live' | 'har',
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) || null,
    status: row.status as Session['status'],
    captureAuthHeaders: (row.capture_auth_headers as number) === 1,
  };
}

function mapEndpoint(row: Record<string, unknown>): Endpoint {
  return {
    id: row.id as number,
    sessionId: row.session_id as number,
    pattern: row.pattern as string,
    methods: row.methods as string,
    requestCount: row.request_count as number,
    avgResponseMs: (row.avg_response_ms as number) ?? null,
    requestSchema: (row.request_schema as string) || null,
    responseSchema: (row.response_schema as string) || null,
    isGraphql: (row.is_graphql as number) || 0,
  };
}

function mapSpec(row: Record<string, unknown>): Spec {
  return {
    id: row.id as number,
    sessionId: row.session_id as number,
    openapiJson: row.openapi_json as string,
    generatedAt: row.generated_at as string,
  };
}

function mapRequest(row: Record<string, unknown>): CapturedRequest {
  return {
    id: row.id as number,
    sessionId: row.session_id as number,
    timestamp: row.timestamp as string,
    method: row.method as string,
    url: row.url as string,
    path: row.path as string,
    queryParams: (row.query_params as string) || null,
    requestHeaders: (row.request_headers as string) || null,
    requestBody: (row.request_body as string) || null,
    responseStatus: (row.response_status as number) ?? null,
    responseHeaders: (row.response_headers as string) || null,
    responseBody: (row.response_body as string) || null,
    contentType: (row.content_type as string) || null,
    durationMs: (row.duration_ms as number) ?? null,
    isGraphql: (row.is_graphql as number) || 0,
    graphqlOperation: (row.graphql_operation as string) || null,
  };
}
