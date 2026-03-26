import type { Page, Request, Response } from 'playwright';
import type Database from 'better-sqlite3';

import { insertRequest, upsertAuthHeader } from './database.js';
import { encryptValue } from './cookie-extractor.js';
import type { CapturedRequest, RequestEvent } from './types.js';

const MAX_REQUEST_BODY = 10_240;   // 10 KB
const MAX_RESPONSE_BODY = 51_200;  // 50 KB

/** Headers that are always redacted (session/cookie data) */
const ALWAYS_REDACTED = new Set([
  'cookie', 'set-cookie',
]);

/** Auth headers that can be captured with opt-in */
const AUTH_HEADERS = new Set([
  'authorization', 'x-api-key', 'proxy-authorization',
  'b2cauthorization', 'x-csrf-token',
]);

/** All sensitive headers (union of both sets) */
const SENSITIVE_HEADERS = new Set([...ALWAYS_REDACTED, ...AUTH_HEADERS]);

/** Redact sensitive header values for UI display */
function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? '***REDACTED***'
      : value;
  }
  return redacted;
}

/** Truncate string to maxLen bytes */
function truncate(str: string | null | undefined, maxLen: number): string | null {
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

/** Detect if a request is GraphQL based on body content */
function detectGraphql(body: string | null): { isGraphql: boolean; operation: string | null } {
  if (!body) return { isGraphql: false, operation: null };
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.query === 'string') {
      const match = parsed.query.match(/^\s*(query|mutation|subscription)\s+(\w+)/);
      return {
        isGraphql: true,
        operation: match ? `${match[1]} ${match[2]}` : null,
      };
    }
  } catch {
    // Not JSON, not GraphQL
  }
  return { isGraphql: false, operation: null };
}

/** Track pending requests for duration calculation */
const pendingRequests = new Map<string, { startTime: number; request: Request }>();

/**
 * Attach request/response interceptors to a Playwright page.
 * Captured requests are stored in SQLite and broadcast via onCapture callback.
 *
 * @param captureAuthHeaders When true, auth headers (authorization, b2cauthorization, etc.)
 *   are encrypted and stored in the auth_headers table instead of being redacted.
 *   Cookie/set-cookie headers are always redacted regardless of this flag.
 */
export function attachInterceptor(
  page: Page,
  db: Database.Database,
  sessionId: number,
  apiFilter: string,
  onCapture: (event: RequestEvent) => void,
  captureAuthHeaders = false,
): void {
  page.on('request', (request: Request) => {
    const url = request.url();
    if (!url.includes(apiFilter) && !url.includes('/graphql')) return;
    pendingRequests.set(url + request.method(), {
      startTime: Date.now(),
      request,
    });
  });

  page.on('response', async (response: Response) => {
    const request = response.request();
    const url = request.url();
    const key = url + request.method();

    if (!pendingRequests.has(key)) return;
    const pending = pendingRequests.get(key)!;
    pendingRequests.delete(key);

    const durationMs = Date.now() - pending.startTime;
    const parsedUrl = new URL(url);

    let requestBody: string | null = null;
    try {
      requestBody = request.postData() ?? null;
    } catch {
      // Some requests don't have post data
    }

    let responseBody: string | null = null;
    try {
      const contentType = response.headers()['content-type'] ?? '';
      if (contentType.includes('json') || contentType.includes('text') || contentType.includes('xml')) {
        responseBody = await response.text();
      }
    } catch {
      // Response body may not be available
    }

    const { isGraphql, operation } = detectGraphql(requestBody);

    const captured: Omit<CapturedRequest, 'id'> = {
      sessionId,
      timestamp: new Date().toISOString(),
      method: request.method(),
      url,
      path: parsedUrl.pathname,
      queryParams: parsedUrl.search ? JSON.stringify(Object.fromEntries(parsedUrl.searchParams)) : null,
      requestHeaders: JSON.stringify(redactHeaders(request.headers())),
      requestBody: truncate(requestBody, MAX_REQUEST_BODY),
      responseStatus: response.status(),
      responseHeaders: JSON.stringify(redactHeaders(response.headers())),
      responseBody: truncate(responseBody, MAX_RESPONSE_BODY),
      contentType: response.headers()['content-type'] ?? null,
      durationMs,
      isGraphql: isGraphql ? 1 : 0,
      graphqlOperation: operation,
    };

    // Store auth headers encrypted when opt-in is enabled
    if (captureAuthHeaders) {
      const reqHeaders = request.headers();
      const domain = parsedUrl.hostname;
      for (const [key, value] of Object.entries(reqHeaders)) {
        if (AUTH_HEADERS.has(key.toLowerCase()) && value) {
          upsertAuthHeader(db, sessionId, key.toLowerCase(), encryptValue(value), domain);
        }
      }
    }

    const id = insertRequest(db, captured);

    onCapture({
      id,
      method: captured.method,
      url: captured.url,
      path: captured.path,
      responseStatus: captured.responseStatus,
      contentType: captured.contentType,
      durationMs: captured.durationMs,
      isGraphql,
      timestamp: captured.timestamp,
    });
  });
}
