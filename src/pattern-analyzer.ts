import type { CapturedRequest, Endpoint } from './types.js';

/** Parameterize a URL path: replace dynamic segments with named placeholders */
export function parameterizePath(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      // UUID v4
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '{uuid}';
      // MongoDB ObjectId (24 hex chars)
      if (/^[0-9a-f]{24}$/i.test(seg)) return '{objectId}';
      // Pure numeric ID
      if (/^\d+$/.test(seg)) return '{id}';
      // Date-like (2024-01-15)
      if (/^\d{4}-\d{2}-\d{2}$/.test(seg)) return '{date}';
      // Hex hash (32+ chars)
      if (/^[0-9a-f]{32,}$/i.test(seg)) return '{hash}';
      return seg;
    })
    .join('/');
}

interface EndpointGroup {
  pattern: string;
  methods: Set<string>;
  requests: CapturedRequest[];
  responseTimes: number[];
  statusCodes: Map<number, number>;
}

/** Group captured requests by parameterized path pattern */
export function groupByPattern(requests: CapturedRequest[]): Map<string, EndpointGroup> {
  const groups = new Map<string, EndpointGroup>();

  for (const req of requests) {
    const pattern = parameterizePath(req.path);
    let group = groups.get(pattern);
    if (!group) {
      group = { pattern, methods: new Set(), requests: [], responseTimes: [], statusCodes: new Map() };
      groups.set(pattern, group);
    }
    group.methods.add(req.method);
    group.requests.push(req);
    if (req.durationMs != null) group.responseTimes.push(req.durationMs);
    if (req.responseStatus != null) {
      group.statusCodes.set(req.responseStatus, (group.statusCodes.get(req.responseStatus) ?? 0) + 1);
    }
  }

  return groups;
}

/** Detect CRUD operation from HTTP method */
export function detectCrud(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'Read';
    case 'POST': return 'Create';
    case 'PUT': return 'Replace';
    case 'PATCH': return 'Update';
    case 'DELETE': return 'Delete';
    default: return method;
  }
}

/** Detect pagination patterns from query parameters */
export function detectPagination(requests: CapturedRequest[]): string | null {
  const patterns = new Set<string>();
  for (const req of requests) {
    if (!req.queryParams) continue;
    try {
      const params = JSON.parse(req.queryParams) as Record<string, string>;
      const keys = Object.keys(params).map((k) => k.toLowerCase());
      if (keys.includes('offset') && keys.includes('limit')) patterns.add('offset/limit');
      if (keys.includes('page') && (keys.includes('size') || keys.includes('per_page') || keys.includes('pagesize'))) patterns.add('page/size');
      if (keys.includes('cursor') || keys.includes('after') || keys.includes('before')) patterns.add('cursor');
      if (keys.includes('skip') && keys.includes('take')) patterns.add('skip/take');
    } catch { /* skip malformed */ }
  }
  return patterns.size > 0 ? [...patterns].join(', ') : null;
}

/** Detect auth patterns from request headers */
export function detectAuthPattern(requests: CapturedRequest[]): string | null {
  const patterns = new Set<string>();
  for (const req of requests) {
    if (!req.requestHeaders) continue;
    try {
      const headers = JSON.parse(req.requestHeaders) as Record<string, string>;
      for (const [key, val] of Object.entries(headers)) {
        const lower = key.toLowerCase();
        if (lower === 'authorization') {
          if (val.startsWith('Bearer ')) patterns.add('Bearer token');
          else if (val.startsWith('Basic ')) patterns.add('Basic auth');
          else patterns.add('Authorization header');
        }
        if (lower === 'x-api-key' || lower === 'api-key') patterns.add('API key');
        if (lower === 'cookie' && val.length > 0) patterns.add('Session cookie');
      }
    } catch { /* skip */ }
  }
  return patterns.size > 0 ? [...patterns].join(', ') : null;
}

interface AnalysisResult {
  endpoints: AnalyzedEndpoint[];
  totalRequests: number;
  uniquePatterns: number;
  graphqlOperations: string[];
  paginationPattern: string | null;
  authPattern: string | null;
}

interface AnalyzedEndpoint {
  pattern: string;
  methods: string[];
  crudOps: string[];
  requestCount: number;
  avgResponseMs: number | null;
  statusCodes: Record<string, number>;
  isGraphql: boolean;
  graphqlOperations: string[];
  errorRate: number;
}

/** Run full analysis on captured requests */
export function analyzeRequests(requests: CapturedRequest[]): AnalysisResult {
  const groups = groupByPattern(requests);
  const endpoints: AnalyzedEndpoint[] = [];
  const allGraphqlOps: string[] = [];

  for (const group of groups.values()) {
    const methods = [...group.methods].sort();
    const crudOps = methods.map(detectCrud);

    const graphqlOps: string[] = [];
    for (const r of group.requests) {
      if (r.isGraphql && r.graphqlOperation) {
        if (!graphqlOps.includes(r.graphqlOperation)) graphqlOps.push(r.graphqlOperation);
      }
    }
    allGraphqlOps.push(...graphqlOps);

    const statusObj: Record<string, number> = {};
    for (const [code, count] of group.statusCodes) statusObj[String(code)] = count;

    const errorCount = group.requests.filter((r) => r.responseStatus != null && r.responseStatus >= 400).length;
    const errorRate = group.requests.length > 0 ? errorCount / group.requests.length : 0;

    const avgMs = group.responseTimes.length > 0
      ? Math.round(group.responseTimes.reduce((a, b) => a + b, 0) / group.responseTimes.length)
      : null;

    endpoints.push({
      pattern: group.pattern,
      methods,
      crudOps,
      requestCount: group.requests.length,
      avgResponseMs: avgMs,
      statusCodes: statusObj,
      isGraphql: group.requests.some((r) => r.isGraphql === 1),
      graphqlOperations: graphqlOps,
      errorRate: Math.round(errorRate * 100),
    });
  }

  endpoints.sort((a, b) => b.requestCount - a.requestCount);

  return {
    endpoints,
    totalRequests: requests.length,
    uniquePatterns: groups.size,
    graphqlOperations: allGraphqlOps,
    paginationPattern: detectPagination(requests),
    authPattern: detectAuthPattern(requests),
  };
}

/** Convert analysis results to endpoint DB records */
export function toEndpointRecords(sessionId: number, analysis: AnalysisResult): Omit<Endpoint, 'id'>[] {
  return analysis.endpoints.map((ep) => ({
    sessionId,
    pattern: ep.pattern,
    methods: JSON.stringify(ep.methods),
    requestCount: ep.requestCount,
    avgResponseMs: ep.avgResponseMs,
    requestSchema: null,
    responseSchema: null,
    isGraphql: ep.isGraphql ? 1 : 0,
  }));
}
