import { renderLayout, escapeHtml } from './layout.js';
import type { Session, Spec } from '../types.js';

/** Render the OpenAPI page — session picker when no session selected */
export function renderOpenApiPage(port: number, sessions?: Session[]): string {
  if (!sessions || sessions.length === 0) {
    const body = `<div class="empty-state">
  <h3>OpenAPI Specificatie</h3>
  <p>Geen sessies beschikbaar.</p>
</div>`;
    return renderLayout('OpenAPI', body, 'openapi', port);
  }

  const options = sessions.map((s) =>
    `<a href="/openapi/${s.id}" class="session-card">
      <h3>${escapeHtml(s.name)}</h3>
      <div class="meta">${escapeHtml(s.targetUrl)}</div>
    </a>`
  ).join('\n');

  const body = `<h3 class="mb-16">Selecteer een sessie</h3>
<div class="session-grid">${options}</div>`;
  return renderLayout('OpenAPI', body, 'openapi', port);
}

/** Render the OpenAPI spec for a session */
export function renderOpenApiSpecPage(
  session: Session,
  spec: Spec,
  port: number,
): string {
  const body = buildSpecBody(session, spec);
  return renderLayout(`OpenAPI: ${session.name}`, body, 'openapi', port);
}

function buildSpecBody(session: Session, spec: Spec): string {
  let formatted = '';
  try {
    formatted = JSON.stringify(JSON.parse(spec.openapiJson), null, 2);
  } catch {
    formatted = spec.openapiJson;
  }

  return `
<div class="flex-between mb-16">
  <div>
    <strong>Sessie:</strong> ${escapeHtml(session.name)}<br>
    <span class="text-dim">Gegenereerd: ${escapeHtml(new Date(spec.generatedAt).toLocaleString('nl-NL'))}</span>
  </div>
  <div class="flex gap-8">
    <a href="/api/specs/${session.id}/json" class="btn btn-primary" download="openapi.json">Download JSON</a>
    <a href="/api/specs/${session.id}/yaml" class="btn btn-secondary" download="openapi.yaml">Download YAML</a>
  </div>
</div>
<div class="card">
  <div class="card-header">OpenAPI 3.0.3 Specificatie</div>
  <div class="card-body">
    <pre class="mono" style="max-height:600px;overflow:auto;font-size:12px">${escapeHtml(formatted)}</pre>
  </div>
</div>`;
}
