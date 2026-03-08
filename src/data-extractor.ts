import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type Database from 'better-sqlite3';

import { getCookieHeader } from './cookie-extractor.js';
import { getEndpointsBySession } from './database.js';

interface ExtractConfig {
  sessionId: number;
  endpoints: string[];
  baseUrl: string;
  delayMs: number;
  jitterPercent: number;
  maxRequests: number;
  maxErrorRate: number;
}

interface ExtractResult {
  endpoint: string;
  status: number;
  body: string;
  durationMs: number;
  timestamp: string;
}

interface ExtractProgress {
  completed: number;
  total: number;
  results: ExtractResult[];
  errors: number;
  status: 'running' | 'paused' | 'completed' | 'error' | 'stopped';
  errorRate: number;
}

let currentExtraction: {
  config: ExtractConfig;
  progress: ExtractProgress;
  abortController: AbortController;
} | null = null;

/** Check robots.txt for a base URL */
async function checkRobotsTxt(baseUrl: string): Promise<boolean> {
  const url = new URL('/robots.txt', baseUrl);
  try {
    const body = await fetchUrl(url.toString(), {});
    // Basic check: if robots.txt explicitly disallows our paths, warn
    if (body.includes('Disallow: /api/') || body.includes('Disallow: /')) {
      console.log('Warning: robots.txt may restrict API access');
      return false;
    }
    return true;
  } catch {
    return true; // No robots.txt = allowed
  }
}

/** Make an HTTP(S) request and return the response body */
function fetchUrl(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return; }

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const req = reqFn(url, { method: 'GET', headers, timeout: 30000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (signal) {
      signal.addEventListener('abort', () => { req.destroy(); reject(new Error('Aborted')); });
    }

    req.end();
  });
}

/** Add random jitter to a delay */
function addJitter(delayMs: number, jitterPercent: number): number {
  const jitter = delayMs * (jitterPercent / 100) * (Math.random() * 2 - 1);
  return Math.max(100, Math.round(delayMs + jitter));
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted')); });
  });
}

/** Start a data extraction run */
export async function startExtraction(
  db: Database.Database,
  config: ExtractConfig,
  onProgress?: (progress: ExtractProgress) => void,
): Promise<ExtractProgress> {
  if (currentExtraction) {
    throw new Error('An extraction is already running');
  }

  const abortController = new AbortController();
  const progress: ExtractProgress = {
    completed: 0,
    total: config.endpoints.length * config.maxRequests,
    results: [],
    errors: 0,
    status: 'running',
    errorRate: 0,
  };

  currentExtraction = { config, progress, abortController };

  // Check robots.txt first
  await checkRobotsTxt(config.baseUrl);

  // Build cookie header
  const domain = new URL(config.baseUrl).hostname;
  const cookieHeader = getCookieHeader(db, config.sessionId, domain);
  const headers: Record<string, string> = {
    'User-Agent': 'APIObserver/1.0 (automated; +https://github.com/rwrw01/observer)',
    'Accept': 'application/json',
  };
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  try {
    for (const endpoint of config.endpoints) {
      if (abortController.signal.aborted) break;

      const url = new URL(endpoint, config.baseUrl).toString();
      const start = Date.now();

      try {
        const body = await fetchUrl(url, headers, abortController.signal);
        const result: ExtractResult = {
          endpoint,
          status: 200,
          body: body.slice(0, 51200), // 50KB max
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        };
        progress.results.push(result);
      } catch (err) {
        progress.errors++;
        progress.results.push({
          endpoint,
          status: 0,
          body: err instanceof Error ? err.message : 'Unknown error',
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      }

      progress.completed++;
      progress.errorRate = progress.completed > 0
        ? Math.round((progress.errors / progress.completed) * 100)
        : 0;

      onProgress?.(progress);

      // Auto-pause on high error rate
      if (progress.errorRate > config.maxErrorRate && progress.completed > 5) {
        console.log(`Extraction paused: error rate ${progress.errorRate}% exceeds ${config.maxErrorRate}%`);
        progress.status = 'error';
        break;
      }

      // Rate limiting delay with jitter
      if (progress.completed < config.endpoints.length) {
        const delay = addJitter(config.delayMs, config.jitterPercent);
        await sleep(delay, abortController.signal);
      }
    }

    if (progress.status === 'running') progress.status = 'completed';
  } catch (err) {
    if ((err as Error).message !== 'Aborted') {
      progress.status = 'error';
      console.error('Extraction error:', err);
    } else {
      progress.status = 'stopped';
    }
  } finally {
    currentExtraction = null;
  }

  return progress;
}

/** Stop the current extraction */
export function stopExtraction(): void {
  if (currentExtraction) {
    currentExtraction.abortController.abort();
    currentExtraction.progress.status = 'stopped';
  }
}

/** Get current extraction progress */
export function getExtractionProgress(): ExtractProgress | null {
  return currentExtraction?.progress ?? null;
}

/** Get available endpoints for extraction from a session */
export function getExtractableEndpoints(
  db: Database.Database,
  sessionId: number,
): Array<{ pattern: string; methods: string[] }> {
  const endpoints = getEndpointsBySession(db, sessionId);
  return endpoints
    .filter((ep) => {
      const methods: string[] = JSON.parse(ep.methods);
      return methods.includes('GET'); // Only GET endpoints for extraction
    })
    .map((ep) => ({
      pattern: ep.pattern,
      methods: JSON.parse(ep.methods) as string[],
    }));
}
