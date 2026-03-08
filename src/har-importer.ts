import { readFileSync } from 'node:fs';

import type Database from 'better-sqlite3';

import { createSession, initDatabase, insertRequest } from './database.js';
import type { CapturedRequest, HarEntry, HarFile, Session } from './types.js';

const MAX_REQUEST_BODY = 10_240;
const MAX_RESPONSE_BODY = 51_200;

function truncate(str: string | null | undefined, maxLen: number): string | null {
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function headersToRecord(headers: Array<{ name: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    result[h.name.toLowerCase()] = h.value;
  }
  return result;
}

function detectGraphql(body: string | null): { isGraphql: boolean; operation: string | null } {
  if (!body) return { isGraphql: false, operation: null };
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.query === 'string') {
      const match = parsed.query.match(/^\s*(query|mutation|subscription)\s+(\w+)/);
      return { isGraphql: true, operation: match ? `${match[1]} ${match[2]}` : null };
    }
  } catch { /* not JSON */ }
  return { isGraphql: false, operation: null };
}

/** Parse a HAR entry into a CapturedRequest (without id) */
function harEntryToRequest(entry: HarEntry, sessionId: number): Omit<CapturedRequest, 'id'> {
  const parsedUrl = new URL(entry.request.url);
  const requestBody = entry.request.postData?.text ?? null;
  const { isGraphql, operation } = detectGraphql(requestBody);

  return {
    sessionId,
    timestamp: entry.startedDateTime,
    method: entry.request.method,
    url: entry.request.url,
    path: parsedUrl.pathname,
    queryParams: parsedUrl.search
      ? JSON.stringify(Object.fromEntries(parsedUrl.searchParams))
      : null,
    requestHeaders: JSON.stringify(headersToRecord(entry.request.headers)),
    requestBody: truncate(requestBody, MAX_REQUEST_BODY),
    responseStatus: entry.response.status,
    responseHeaders: JSON.stringify(headersToRecord(entry.response.headers)),
    responseBody: truncate(entry.response.content.text ?? null, MAX_RESPONSE_BODY),
    contentType: entry.response.content.mimeType ?? null,
    durationMs: Math.round(entry.time),
    isGraphql: isGraphql ? 1 : 0,
    graphqlOperation: operation,
  };
}

/**
 * Import a HAR file into the database as a new session.
 * @param apiFilter - Only import entries whose URL contains this string
 * @returns The created session and number of imported requests
 */
export function importHarFile(
  db: Database.Database,
  filePath: string,
  name: string | undefined,
  apiFilter: string,
): { session: Session; importedCount: number } {
  const raw = readFileSync(filePath, 'utf-8');
  const har = JSON.parse(raw) as HarFile;

  if (!har.log?.entries?.length) {
    throw new Error('HAR file contains no entries');
  }

  // Derive target URL from first entry
  const firstUrl = new URL(har.log.entries[0].request.url);
  const targetUrl = `${firstUrl.protocol}//${firstUrl.host}`;
  const sessionName = name ?? `HAR import: ${firstUrl.host}`;

  const session = createSession(db, sessionName, targetUrl, 'har');

  const filtered = har.log.entries.filter(
    (e: HarEntry) => e.request.url.includes(apiFilter) || e.request.url.includes('/graphql')
  );

  for (const entry of filtered) {
    const req = harEntryToRequest(entry, session.id);
    insertRequest(db, req);
  }

  // Mark session as completed immediately (HAR is static data)
  db.prepare(
    "UPDATE sessions SET status = 'completed', finished_at = datetime('now') WHERE id = ?"
  ).run(session.id);

  return { session: { ...session, status: 'completed' }, importedCount: filtered.length };
}

// CLI mode: npx tsx src/har-importer.ts <path> [name] [filter]
const isCliMode = process.argv[1]?.includes('har-importer');
if (isCliMode) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx src/har-importer.ts <har-file> [session-name] [api-filter]');
    process.exit(1);
  }

  const cliDb = initDatabase();
  const cliName = process.argv[3];
  // Guard against MSYS/Git Bash path conversion (e.g. /api/ → C:/Program Files/Git/api/)
  let cliFilter = process.argv[4] ?? '/api/';
  if (cliFilter.includes('Program Files')) {
    cliFilter = '/api/';
  }

  const { session, importedCount } = importHarFile(cliDb, filePath, cliName, cliFilter);
  console.log(`Imported ${importedCount} requests into session "${session.name}" (id: ${session.id})`);
  cliDb.close();
}
