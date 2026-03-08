import { renderLayout, escapeHtml } from './layout.js';
import type { Session } from '../types.js';

interface AnalysisData {
  endpoints: Array<{
    pattern: string;
    methods: string[];
    crudOps: string[];
    requestCount: number;
    avgResponseMs: number | null;
    isGraphql: boolean;
    graphqlOperations: string[];
    errorRate: number;
  }>;
  totalRequests: number;
  uniquePatterns: number;
  graphqlOperations: string[];
  paginationPattern: string | null;
  authPattern: string | null;
}

/** Render the analysis page — session picker when no session selected */
export function renderAnalysisPage(port: number, sessions?: Session[]): string {
  if (!sessions || sessions.length === 0) {
    const body = `<div class="empty-state">
  <h3>Analyse</h3>
  <p>Geen sessies beschikbaar om te analyseren.</p>
</div>`;
    return renderLayout('Analyse', body, 'analysis', port);
  }

  const options = sessions.map((s) =>
    `<a href="/analysis/${s.id}" class="session-card">
      <h3>${escapeHtml(s.name)}</h3>
      <div class="meta">${escapeHtml(s.targetUrl)}<br>${escapeHtml(new Date(s.startedAt).toLocaleString('nl-NL'))}</div>
    </a>`
  ).join('\n');

  const body = `<h3 class="mb-16">Selecteer een sessie om te analyseren</h3>
<div class="session-grid">${options}</div>`;
  return renderLayout('Analyse', body, 'analysis', port);
}

/** Render analysis results for a specific session */
export function renderAnalysisResultPage(
  session: Session,
  analysis: AnalysisData,
  port: number,
): string {
  const body = buildAnalysisBody(session, analysis);
  return renderLayout(`Analyse: ${session.name}`, body, 'analysis', port);
}

function buildAnalysisBody(session: Session, a: AnalysisData): string {
  const summaryCards = `
<div class="form-row mb-16">
  <div class="card" style="flex:1"><div class="card-body" style="text-align:center">
    <div style="font-size:28px;color:var(--info)">${a.totalRequests}</div>
    <div class="text-dim">Totaal requests</div>
  </div></div>
  <div class="card" style="flex:1"><div class="card-body" style="text-align:center">
    <div style="font-size:28px;color:var(--success)">${a.uniquePatterns}</div>
    <div class="text-dim">Unieke endpoints</div>
  </div></div>
  <div class="card" style="flex:1"><div class="card-body" style="text-align:center">
    <div style="font-size:28px;color:var(--warning)">${escapeHtml(a.paginationPattern ?? 'Geen')}</div>
    <div class="text-dim">Paginatie</div>
  </div></div>
  <div class="card" style="flex:1"><div class="card-body" style="text-align:center">
    <div style="font-size:28px;color:var(--method-patch)">${escapeHtml(a.authPattern ?? 'Geen')}</div>
    <div class="text-dim">Authenticatie</div>
  </div></div>
</div>`;

  const rows = a.endpoints.map((ep) => {
    const methods = ep.methods.map((m) =>
      `<span class="method method-${escapeHtml(m)}">${escapeHtml(m)}</span>`
    ).join(' ');
    const crud = ep.crudOps.join(', ');
    const avgMs = ep.avgResponseMs != null ? `${ep.avgResponseMs}ms` : '-';
    const errClass = ep.errorRate > 20 ? 'text-error' : ep.errorRate > 5 ? 'text-dim' : '';

    return `<tr>
  <td class="mono">${escapeHtml(ep.pattern)}</td>
  <td>${methods}</td>
  <td>${escapeHtml(crud)}</td>
  <td>${ep.requestCount}</td>
  <td>${avgMs}</td>
  <td class="${errClass}">${ep.errorRate}%</td>
  <td>${ep.isGraphql ? 'GraphQL' : 'REST'}</td>
</tr>`;
  }).join('\n');

  const gqlSection = a.graphqlOperations.length > 0
    ? `<div class="card mb-16">
  <div class="card-header">GraphQL operaties</div>
  <div class="card-body mono">${a.graphqlOperations.map(escapeHtml).join(', ')}</div>
</div>`
    : '';

  return `
<div class="flex-between mb-16">
  <div><strong>Sessie:</strong> ${escapeHtml(session.name)} &mdash; ${escapeHtml(session.targetUrl)}</div>
  <a href="/openapi/${session.id}" class="btn btn-primary">OpenAPI genereren</a>
</div>
${summaryCards}
${gqlSection}
<div class="card">
  <div class="card-header">Endpoint patronen</div>
  <table>
    <thead><tr>
      <th scope="col">Patroon</th><th scope="col">Methoden</th><th scope="col">CRUD</th><th scope="col">Requests</th><th scope="col">Gem. tijd</th><th scope="col">Fouten</th><th scope="col">Type</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}
