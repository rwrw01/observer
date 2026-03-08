import { renderLayout } from './layout.js';

/** Render the live observation page */
export function renderObservePage(port: number): string {
  const body = buildObserveBody(port);
  return renderLayout('Observeren', body, 'observe', port);
}

function buildObserveBody(port: number): string {
  return `
<div class="card mb-16">
  <div class="card-header">Nieuwe live sessie</div>
  <div class="card-body">
    <form id="sessionForm" action="/api/sessions" method="POST">
      <div class="form-row">
        <div class="form-group">
          <label for="sessionName">Naam</label>
          <input type="text" id="sessionName" name="sessionName" placeholder="Mijn observatie" required>
        </div>
        <div class="form-group">
          <label for="targetUrl">Doel-URL</label>
          <input type="url" id="targetUrl" name="targetUrl" placeholder="https://example.com" autocomplete="url" required>
        </div>
        <div class="form-group">
          <label for="apiFilter">API filter</label>
          <input type="text" id="apiFilter" name="apiFilter" value="/api/" placeholder="/api/">
        </div>
      </div>
      <div class="flex gap-8">
        <button type="submit" class="btn btn-primary" id="startSessionBtn">Sessie starten</button>
        <button type="button" class="btn btn-danger" id="stopSessionBtn" disabled>Stoppen</button>
        <span class="connection-indicator" aria-live="polite"><span class="connection-dot"></span> <span id="connectionLabel">Niet verbonden</span></span>
      </div>
    </form>
  </div>
</div>

<div class="split-horizontal">
  <div class="split-left">
    <div class="card">
      <div class="card-header flex-between">
        <span>Browser</span>
        <span class="badge badge-live" id="screencastBadge" style="display:none">LIVE</span>
      </div>
      <div class="screencast-container">
        <canvas id="screencastCanvas" width="1280" height="720" role="img" aria-label="Live weergave van de geobserveerde browsersessie">Uw browser ondersteunt geen canvas.</canvas>
        <div class="screencast-overlay" id="screencastOverlay">Wacht op browser...</div>
      </div>
    </div>
  </div>

  <div class="split-right">
    <div class="card">
      <div class="card-header flex-between">
        <span>Requests</span>
        <span class="text-dim"><span id="requestCount" aria-live="polite">0</span> vastgelegd</span>
      </div>
      <div class="request-log" id="requestLog" role="log" aria-live="polite" aria-relevant="additions"></div>
    </div>

    <div class="detail-panel" id="detailPanel" style="display:none"></div>
  </div>
</div>`;
}
