import type { CapturedRequest } from './types.js';
import { parameterizePath } from './pattern-analyzer.js';

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, PathItem>>;
  components: { schemas: Record<string, JsonSchema> };
}

interface PathItem {
  summary: string;
  operationId: string;
  responses: Record<string, { description: string; content?: Record<string, { schema: JsonSchema }> }>;
  requestBody?: { content: Record<string, { schema: JsonSchema }> };
  parameters?: Array<{ name: string; in: string; required: boolean; schema: JsonSchema }>;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  example?: unknown;
  additionalProperties?: boolean;
}

/** Infer a JSON Schema from a sample value */
export function inferSchema(value: unknown): JsonSchema {
  if (value === null || value === undefined) return { type: 'string' };
  if (Array.isArray(value)) {
    return { type: 'array', items: value.length > 0 ? inferSchema(value[0]) : { type: 'string' } };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      properties[key] = inferSchema(val);
      if (val !== null && val !== undefined) required.push(key);
    }
    return { type: 'object', properties, required: required.length > 0 ? required : undefined };
  }
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

/** Merge two JSON schemas (union of properties) */
export function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  if (a.type !== b.type) return { type: 'string' };
  if (a.type === 'object' && b.type === 'object') {
    const props = { ...(a.properties ?? {}) };
    for (const [key, schema] of Object.entries(b.properties ?? {})) {
      if (props[key]) {
        props[key] = mergeSchemas(props[key], schema);
      } else {
        props[key] = schema;
      }
    }
    const aReq = new Set(a.required ?? []);
    const bReq = new Set(b.required ?? []);
    const required = [...aReq].filter((k) => bReq.has(k));
    return { type: 'object', properties: props, required: required.length > 0 ? required : undefined };
  }
  if (a.type === 'array' && b.type === 'array' && a.items && b.items) {
    return { type: 'array', items: mergeSchemas(a.items, b.items) };
  }
  return a;
}

/** Extract path parameters from a parameterized pattern */
function extractPathParams(pattern: string): Array<{ name: string; in: string; required: boolean; schema: JsonSchema }> {
  const params: Array<{ name: string; in: string; required: boolean; schema: JsonSchema }> = [];
  const matches = pattern.matchAll(/\{(\w+)\}/g);
  for (const match of matches) {
    const name = match[1];
    const schema: JsonSchema = name === 'id' ? { type: 'integer' } : { type: 'string' };
    params.push({ name, in: 'path', required: true, schema });
  }
  return params;
}

/** Generate a safe operationId from method + path */
function operationId(method: string, pattern: string): string {
  const parts = pattern
    .replace(/\{[^}]+\}/g, 'ById')
    .split('/')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  const verb = method.toLowerCase();
  return verb + parts.join('');
}

/** Infer schema from response bodies of requests with the same method+pattern */
function inferResponseSchema(requests: CapturedRequest[]): JsonSchema | null {
  let merged: JsonSchema | null = null;
  for (const req of requests) {
    if (!req.responseBody) continue;
    try {
      const parsed: unknown = JSON.parse(req.responseBody);
      const schema = inferSchema(parsed);
      merged = merged ? mergeSchemas(merged, schema) : schema;
    } catch { /* skip non-JSON */ }
  }
  return merged;
}

/** Infer schema from request bodies */
function inferRequestSchema(requests: CapturedRequest[]): JsonSchema | null {
  let merged: JsonSchema | null = null;
  for (const req of requests) {
    if (!req.requestBody || req.method === 'GET' || req.method === 'DELETE') continue;
    try {
      const parsed: unknown = JSON.parse(req.requestBody);
      const schema = inferSchema(parsed);
      merged = merged ? mergeSchemas(merged, schema) : schema;
    } catch { /* skip non-JSON */ }
  }
  return merged;
}

/** Generate an OpenAPI 3.0.3 spec from captured requests */
export function generateOpenApiSpec(
  requests: CapturedRequest[],
  title: string,
  serverUrl: string,
): OpenApiSpec {
  // Group by parameterized pattern + method
  const groups = new Map<string, Map<string, CapturedRequest[]>>();

  for (const req of requests) {
    const pattern = parameterizePath(req.path);
    if (!groups.has(pattern)) groups.set(pattern, new Map());
    const methods = groups.get(pattern)!;
    if (!methods.has(req.method)) methods.set(req.method, []);
    methods.get(req.method)!.push(req);
  }

  const paths: Record<string, Record<string, PathItem>> = {};
  const schemas: Record<string, JsonSchema> = {};

  for (const [pattern, methods] of groups) {
    const pathObj: Record<string, PathItem> = {};
    const params = extractPathParams(pattern);

    for (const [method, reqs] of methods) {
      const opId = operationId(method, pattern);
      const successReqs = reqs.filter((r) => r.responseStatus != null && r.responseStatus >= 200 && r.responseStatus < 300);
      const responseSchema = inferResponseSchema(successReqs.length > 0 ? successReqs : reqs);
      const requestSchema = inferRequestSchema(reqs);

      const responses: Record<string, { description: string; content?: Record<string, { schema: JsonSchema }> }> = {};

      // Collect observed status codes
      const statusSet = new Set<number>();
      for (const r of reqs) { if (r.responseStatus != null) statusSet.add(r.responseStatus); }

      if (statusSet.size === 0) {
        responses['200'] = { description: 'Successful response' };
      } else {
        for (const status of [...statusSet].sort()) {
          const desc = status >= 200 && status < 300 ? 'Successful response'
            : status >= 400 && status < 500 ? 'Client error'
            : status >= 500 ? 'Server error'
            : 'Response';
          responses[String(status)] = { description: desc };
        }
      }

      // Add response schema to the primary success code
      if (responseSchema) {
        const schemaName = opId.charAt(0).toUpperCase() + opId.slice(1) + 'Response';
        schemas[schemaName] = responseSchema;
        const successCode = [...statusSet].find((s) => s >= 200 && s < 300) ?? 200;
        const codeStr = String(successCode);
        if (!responses[codeStr]) responses[codeStr] = { description: 'Successful response' };
        responses[codeStr].content = { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } as unknown as JsonSchema } };
      }

      const item: PathItem = {
        summary: `${method} ${pattern}`,
        operationId: opId,
        responses,
      };

      if (requestSchema) {
        const schemaName = opId.charAt(0).toUpperCase() + opId.slice(1) + 'Request';
        schemas[schemaName] = requestSchema;
        item.requestBody = {
          content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } as unknown as JsonSchema } },
        };
      }

      if (params.length > 0) item.parameters = params;

      pathObj[method.toLowerCase()] = item;
    }

    paths[pattern] = pathObj;
  }

  return {
    openapi: '3.0.3',
    info: { title, version: '1.0.0', description: `Auto-generated from ${requests.length} observed API requests` },
    servers: [{ url: serverUrl }],
    paths,
    components: { schemas },
  };
}
