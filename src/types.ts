/** Session status lifecycle */
export type SessionStatus = 'active' | 'completed' | 'failed';

/** Source of the session data */
export type SessionSource = 'live' | 'har';

/** Database entity: observation session */
export interface Session {
  id: number;
  name: string;
  targetUrl: string;
  source: SessionSource;
  startedAt: string;
  finishedAt: string | null;
  status: SessionStatus;
  captureAuthHeaders: boolean;
}

/** Database entity: captured HTTP request/response */
export interface CapturedRequest {
  id: number;
  sessionId: number;
  timestamp: string;
  method: string;
  url: string;
  path: string;
  queryParams: string | null;
  requestHeaders: string | null;
  requestBody: string | null;
  responseStatus: number | null;
  responseHeaders: string | null;
  responseBody: string | null;
  contentType: string | null;
  durationMs: number | null;
  isGraphql: number;
  graphqlOperation: string | null;
}

/** Database entity: analyzed endpoint pattern */
export interface Endpoint {
  id: number;
  sessionId: number;
  pattern: string;
  methods: string;
  requestCount: number;
  avgResponseMs: number | null;
  requestSchema: string | null;
  responseSchema: string | null;
  isGraphql: number;
}

/** Database entity: captured cookie */
export interface Cookie {
  id: number;
  sessionId: number;
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: string | null;
  httpOnly: number;
  secure: number;
  sameSite: string | null;
  capturedAt: string;
}

/** Database entity: generated OpenAPI spec */
export interface Spec {
  id: number;
  sessionId: number;
  openapiJson: string;
  generatedAt: string;
}

/** WebSocket event types sent to UI clients */
export type WsEventType =
  | 'request'
  | 'session-started'
  | 'session-stopped'
  | 'screencast-frame'
  | 'error';

/** WebSocket message envelope */
export interface WsMessage {
  type: WsEventType;
  data: unknown;
}

/** Request data as sent over WebSocket (UI-safe, headers redacted) */
export interface RequestEvent {
  id: number;
  method: string;
  url: string;
  path: string;
  responseStatus: number | null;
  contentType: string | null;
  durationMs: number | null;
  isGraphql: boolean;
  timestamp: string;
}

/** HAR 1.2 entry (subset of fields we use) */
export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    postData?: { text?: string; mimeType?: string };
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
    content: { text?: string; mimeType?: string; size?: number };
  };
}

/** HAR 1.2 root structure */
export interface HarFile {
  log: {
    version: string;
    entries: HarEntry[];
    pages?: unknown[];
  };
}

/** Configuration for an observation session */
export interface SessionConfig {
  name: string;
  targetUrl: string;
  apiFilter: string;
  captureAuthHeaders: boolean;
}
