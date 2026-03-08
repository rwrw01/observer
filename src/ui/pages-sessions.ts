import { renderLayout, escapeHtml } from './layout.js';
import type { Session } from '../types.js';

/** Render the sessions overview page */
export function renderSessionsPage(sessions: Session[], port: number): string {
  const body = buildSessionsBody(sessions);
  return renderLayout('Sessies', body, 'sessions', port);
}

function buildSessionsBody(sessions: Session[]): string {
  const newSessionForm = `
<div class="card mb-16">
  <div class="card-header">Nieuwe live sessie</div>
  <div class="card-body">
    <form id="sessionForm" action="/api/sessions" method="POST">
      <div class="form-row">
        <div class="form-group">
          <label for="sessionName">Naam</label>
          <input type="text" id="sessionName" placeholder="Mijn observatie" required>
        </div>
        <div class="form-group">
          <label for="targetUrl">Doel-URL</label>
          <input type="url" id="targetUrl" placeholder="https://example.com" required>
        </div>
        <div class="form-group">
          <label for="apiFilter">API filter</label>
          <input type="text" id="apiFilter" value="/api/" placeholder="/api/">
        </div>
      </div>
      <div class="flex gap-8">
        <button type="submit" class="btn btn-primary" id="startSessionBtn">Sessie starten</button>
        <button type="button" class="btn btn-danger" id="stopSessionBtn" disabled>Stoppen</button>
      </div>
    </form>
  </div>
</div>`;

  const harImportForm = `
<div class="card mb-16">
  <div class="card-header">HAR bestand importeren</div>
  <div class="card-body">
    <form id="harImportForm">
      <div class="form-row">
        <div class="form-group">
          <label for="harFilePath">Bestandspad</label>
          <input type="text" id="harFilePath" placeholder="C:\\pad\\naar\\bestand.har" required>
        </div>
        <div class="form-group">
          <label for="harName">Naam (optioneel)</label>
          <input type="text" id="harName" placeholder="Automatisch uit HAR">
        </div>
        <div class="form-group">
          <label for="harFilter">API filter</label>
          <input type="text" id="harFilter" value="/api/" placeholder="/api/">
        </div>
      </div>
      <button type="submit" class="btn btn-secondary">Importeren</button>
    </form>
  </div>
</div>`;

  if (sessions.length === 0) {
    return `${newSessionForm}${harImportForm}
<div class="empty-state">
  <h3>Nog geen sessies</h3>
  <p>Start een live observatie of importeer een HAR bestand om te beginnen.</p>
</div>`;
  }

  const cards = sessions.map((s) => renderSessionCard(s)).join('\n');

  return `${newSessionForm}${harImportForm}
<div class="flex-between mb-8">
  <h3>${sessions.length} sessie${sessions.length !== 1 ? 's' : ''}</h3>
</div>
<div class="session-grid">${cards}</div>`;
}

function renderSessionCard(session: Session): string {
  const statusBadge = session.status === 'active'
    ? '<span class="badge badge-active">Actief</span>'
    : session.status === 'failed'
      ? '<span class="badge badge-failed">Mislukt</span>'
      : '<span class="badge badge-completed">Voltooid</span>';

  const source = session.source === 'har' ? ' (HAR import)' : '';
  const started = new Date(session.startedAt).toLocaleString('nl-NL');
  const finished = session.finishedAt
    ? new Date(session.finishedAt).toLocaleString('nl-NL')
    : 'Lopend';

  const deleteBtn = session.status !== 'active'
    ? `<button class="btn-delete" data-session-id="${session.id}" title="Sessie verwijderen" aria-label="Verwijder ${escapeHtml(session.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`
    : '';

  return `
<div class="session-card-wrapper">
  ${deleteBtn}
  <a href="/session/${session.id}" class="session-card">
    <div class="flex-between mb-8">
      <h3>${escapeHtml(session.name)}</h3>
      ${statusBadge}
    </div>
    <div class="meta">
      ${escapeHtml(session.targetUrl)}${escapeHtml(source)}<br>
      Gestart: ${escapeHtml(started)}<br>
      Einde: ${escapeHtml(finished)}
    </div>
  </a>
</div>`;
}

/** Render a single session detail page */
export function renderSessionDetailPage(
  session: Session,
  requests: Array<{ id: number; method: string; path: string; responseStatus: number | null; durationMs: number | null; timestamp: string }>,
  port: number,
): string {
  const body = buildSessionDetailBody(session, requests);
  return renderLayout(session.name, body, 'sessions', port);
}

function buildSessionDetailBody(
  session: Session,
  requests: Array<{ id: number; method: string; path: string; responseStatus: number | null; durationMs: number | null; timestamp: string }>,
): string {
  const statusBadge = session.status === 'active'
    ? '<span class="badge badge-active">Actief</span>'
    : session.status === 'failed'
      ? '<span class="badge badge-failed">Mislukt</span>'
      : '<span class="badge badge-completed">Voltooid</span>';

  const meta = `
<div class="card mb-16">
  <div class="card-header">Sessie-informatie</div>
  <div class="card-body">
    <div class="flex-between">
      <div>
        <strong>Doel:</strong> ${escapeHtml(session.targetUrl)}<br>
        <strong>Gestart:</strong> ${escapeHtml(new Date(session.startedAt).toLocaleString('nl-NL'))}<br>
        <strong>Einde:</strong> ${escapeHtml(session.finishedAt ? new Date(session.finishedAt).toLocaleString('nl-NL') : 'Lopend')}
      </div>
      <div>${statusBadge}</div>
    </div>
  </div>
</div>`;

  if (requests.length === 0) {
    return `${meta}
<div class="empty-state">
  <h3>Geen requests</h3>
  <p>Er zijn nog geen API-requests vastgelegd voor deze sessie.</p>
</div>`;
  }

  const rows = requests.map((r) => {
    const sClass = r.responseStatus != null ? statusClass(r.responseStatus) : '';
    return `<tr>
  <td><span class="method method-${escapeHtml(r.method)}">${escapeHtml(r.method)}</span></td>
  <td class="mono">${escapeHtml(r.path)}</td>
  <td class="${sClass}">${r.responseStatus ?? '-'}</td>
  <td class="text-dim">${r.durationMs != null ? r.durationMs + 'ms' : '-'}</td>
  <td class="text-dim">${escapeHtml(new Date(r.timestamp).toLocaleTimeString('nl-NL'))}</td>
</tr>`;
  }).join('\n');

  return `${meta}
<div class="card">
  <div class="card-header">${requests.length} request${requests.length !== 1 ? 's' : ''}</div>
  <table>
    <thead><tr><th>Methode</th><th>Pad</th><th>Status</th><th>Duur</th><th>Tijd</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function statusClass(code: number): string {
  if (code >= 200 && code < 300) return 'status-2xx';
  if (code >= 300 && code < 400) return 'status-3xx';
  if (code >= 400 && code < 500) return 'status-4xx';
  return 'status-5xx';
}
