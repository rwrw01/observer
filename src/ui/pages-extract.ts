import { renderLayout, escapeHtml } from './layout.js';
import type { Session } from '../types.js';

/** Render the extraction page — session picker */
export function renderExtractPage(port: number, sessions?: Session[]): string {
  if (!sessions || sessions.length === 0) {
    const body = `<div class="empty-state">
  <h3>Data Extractie</h3>
  <p>Geen sessies beschikbaar. Start eerst een observatie of importeer een HAR bestand.</p>
</div>`;
    return renderLayout('Extractie', body, 'extract', port);
  }

  const options = sessions.map((s) =>
    `<a href="/extract/${s.id}" class="session-card">
      <h3>${escapeHtml(s.name)}</h3>
      <div class="meta">${escapeHtml(s.targetUrl)}</div>
    </a>`
  ).join('\n');

  const body = `<h3 class="mb-16">Selecteer een sessie voor extractie</h3>
<div class="session-grid">${options}</div>`;
  return renderLayout('Extractie', body, 'extract', port);
}

/** Render the extraction config page for a session */
export function renderExtractConfigPage(
  session: Session,
  endpoints: Array<{ pattern: string; methods: string[] }>,
  port: number,
): string {
  const body = buildExtractBody(session, endpoints);
  return renderLayout(`Extractie: ${session.name}`, body, 'extract', port);
}

function buildExtractBody(
  session: Session,
  endpoints: Array<{ pattern: string; methods: string[] }>,
): string {
  if (endpoints.length === 0) {
    return `
<div class="empty-state">
  <h3>Geen extracteerbare endpoints</h3>
  <p>Analyseer eerst de sessie om endpoints te ontdekken.</p>
  <a href="/analysis/${session.id}" class="btn btn-primary mt-16">Naar analyse</a>
</div>`;
  }

  const checkboxes = endpoints.map((ep, i) =>
    `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
      <input type="checkbox" name="endpoint" value="${escapeHtml(ep.pattern)}" ${i < 5 ? 'checked' : ''}>
      <span class="mono">${escapeHtml(ep.pattern)}</span>
      <span class="text-dim">${ep.methods.join(', ')}</span>
    </label>`
  ).join('\n');

  return `
<div class="card mb-16">
  <div class="card-header">Sessie: ${escapeHtml(session.name)}</div>
  <div class="card-body">
    <strong>Doel:</strong> ${escapeHtml(session.targetUrl)}
  </div>
</div>

<div class="card mb-16">
  <div class="card-header">Extractie configuratie</div>
  <div class="card-body">
    <form id="extractForm">
      <input type="hidden" name="sessionId" value="${session.id}">
      <input type="hidden" name="baseUrl" value="${escapeHtml(session.targetUrl)}">

      <div class="form-group">
        <label>Endpoints (alleen GET)</label>
        <div style="max-height:200px;overflow-y:auto;padding:8px;background:var(--bg-dark);border-radius:var(--radius)">
          ${checkboxes}
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="delayMs">Vertraging (ms)</label>
          <input type="number" id="delayMs" name="delayMs" value="3000" min="500" max="30000">
        </div>
        <div class="form-group">
          <label for="jitterPercent">Jitter (%)</label>
          <input type="number" id="jitterPercent" name="jitterPercent" value="30" min="0" max="50">
        </div>
        <div class="form-group">
          <label for="maxErrorRate">Max foutenpercentage (%)</label>
          <input type="number" id="maxErrorRate" name="maxErrorRate" value="20" min="5" max="100">
        </div>
      </div>

      <div class="flex gap-8 mt-8">
        <button type="submit" class="btn btn-primary" id="startExtractBtn">Extractie starten</button>
        <button type="button" class="btn btn-danger" id="stopExtractBtn" disabled>Stoppen</button>
      </div>
    </form>
  </div>
</div>

<div class="card" id="extractResults" style="display:none">
  <div class="card-header flex-between">
    <span>Resultaten</span>
    <span class="text-dim"><span id="extractProgress">0</span> / <span id="extractTotal">0</span></span>
  </div>
  <div class="request-log" id="extractLog"></div>
</div>

<script>
(function() {
  var form = document.getElementById('extractForm');
  var startBtn = document.getElementById('startExtractBtn');
  var stopBtn = document.getElementById('stopExtractBtn');
  var results = document.getElementById('extractResults');
  var log = document.getElementById('extractLog');
  var progressEl = document.getElementById('extractProgress');
  var totalEl = document.getElementById('extractTotal');

  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var checked = form.querySelectorAll('input[name="endpoint"]:checked');
    var endpoints = [];
    checked.forEach(function(cb) { endpoints.push(cb.value); });
    if (endpoints.length === 0) { alert('Selecteer minstens 1 endpoint'); return; }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    results.style.display = '';
    log.innerHTML = '';
    totalEl.textContent = endpoints.length;

    fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: parseInt(form.querySelector('[name=sessionId]').value),
        baseUrl: form.querySelector('[name=baseUrl]').value,
        endpoints: endpoints,
        delayMs: parseInt(document.getElementById('delayMs').value),
        jitterPercent: parseInt(document.getElementById('jitterPercent').value),
        maxErrorRate: parseInt(document.getElementById('maxErrorRate').value),
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      progressEl.textContent = data.completed;
      data.results.forEach(function(r) {
        var row = document.createElement('div');
        row.className = 'request-row';
        row.innerHTML = '<span class="request-time">' + r.durationMs + 'ms</span>' +
          '<span class="method method-GET">GET</span>' +
          '<span class="request-path">' + r.endpoint + '</span>' +
          '<span class="request-status ' + (r.status >= 200 && r.status < 300 ? 'status-2xx' : 'status-5xx') + '">' + r.status + '</span>';
        log.appendChild(row);
      });
      startBtn.disabled = false;
      stopBtn.disabled = true;
    })
    .catch(function(err) {
      alert('Fout: ' + err.message);
      startBtn.disabled = false;
      stopBtn.disabled = true;
    });
  });

  stopBtn.addEventListener('click', function() {
    fetch('/api/extract/stop', { method: 'POST' });
    stopBtn.disabled = true;
  });
})();
</script>`;
}
