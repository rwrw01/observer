/* API Observer — Client-side WebSocket, screencast, and request log */
(function () {
  'use strict';

  var wsUrl = 'ws://' + location.hostname + ':' + location.port;
  var ws = null;
  var reconnectTimer = null;
  var RECONNECT_DELAY = 2000;

  // Connection indicator
  var dot = document.querySelector('.connection-dot');
  var connectionLabel = document.getElementById('connectionLabel');

  function setConnected(connected) {
    if (dot) {
      dot.classList.toggle('connected', connected);
      dot.title = connected ? 'Verbonden' : 'Niet verbonden';
    }
    // E5 fix: update text label alongside color
    if (connectionLabel) {
      connectionLabel.textContent = connected ? 'Verbonden' : 'Niet verbonden';
    }
  }

  // WebSocket connection
  function connect() {
    if (ws && ws.readyState < 2) return;
    try { ws = new WebSocket(wsUrl); } catch (_e) { scheduleReconnect(); return; }

    ws.onopen = function () {
      setConnected(true);
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    ws.onclose = function () {
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = function () {
      setConnected(false);
    };

    ws.onmessage = function (evt) {
      var msg;
      try { msg = JSON.parse(evt.data); } catch (_e) { return; }
      handleMessage(msg);
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY);
  }

  // Message dispatcher
  function handleMessage(msg) {
    switch (msg.type) {
      case 'request':
        appendRequest(msg.data);
        break;
      case 'screencast-frame':
        renderFrame(msg.data);
        break;
      case 'session-started':
        onSessionStarted(msg.data);
        break;
      case 'session-stopped':
        onSessionStopped(msg.data);
        break;
    }
  }

  // Request log
  var requestLog = document.getElementById('requestLog');
  var requestCount = document.getElementById('requestCount');
  var count = 0;

  function statusClass(code) {
    if (code >= 200 && code < 300) return 'status-2xx';
    if (code >= 300 && code < 400) return 'status-3xx';
    if (code >= 400 && code < 500) return 'status-4xx';
    return 'status-5xx';
  }

  // E4 fix: status text prefix for color-blind users
  function statusPrefix(code) {
    if (code >= 200 && code < 300) return '';
    if (code >= 400 && code < 500) return '\u26A0 '; // warning triangle
    if (code >= 500) return '\u2716 '; // cross mark
    return '';
  }

  function appendRequest(data) {
    if (!requestLog) return;
    count++;
    if (requestCount) requestCount.textContent = count;

    var row = document.createElement('div');
    row.className = 'request-row';
    row.setAttribute('data-id', data.id || '');
    // E7 fix: make request rows keyboard-accessible
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', data.method + ' ' + data.path + ' - status ' + (data.responseStatus || 'onbekend'));

    var time = new Date(data.timestamp).toLocaleTimeString('nl-NL');
    var duration = data.durationMs != null ? data.durationMs + 'ms' : '-';
    var status = data.responseStatus || '-';
    var sClass = typeof status === 'number' ? statusClass(status) : '';
    var sPrefix = typeof status === 'number' ? statusPrefix(status) : '';

    row.innerHTML =
      '<span class="request-time">' + escapeHtml(time) + '</span>' +
      '<span class="method method-' + escapeHtml(data.method) + '">' + escapeHtml(data.method) + '</span>' +
      '<span class="request-path" title="' + escapeHtml(data.url) + '">' + escapeHtml(data.path) + '</span>' +
      '<span class="request-status ' + sClass + '">' + sPrefix + escapeHtml(String(status)) + '</span>' +
      '<span class="request-duration">' + escapeHtml(duration) + '</span>';

    row.addEventListener('click', function () { showRequestDetail(data); });
    // E7 fix: keyboard activation
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showRequestDetail(data);
      }
    });
    requestLog.appendChild(row);
    requestLog.scrollTop = requestLog.scrollHeight;
  }

  // Request detail panel
  var detailPanel = document.getElementById('detailPanel');

  function showRequestDetail(data) {
    if (!detailPanel) return;
    var headers = '';
    if (data.requestHeaders) {
      try {
        var h = typeof data.requestHeaders === 'string' ? JSON.parse(data.requestHeaders) : data.requestHeaders;
        headers = JSON.stringify(h, null, 2);
      } catch (_e) { headers = String(data.requestHeaders); }
    }

    var respHeaders = '';
    if (data.responseHeaders) {
      try {
        var rh = typeof data.responseHeaders === 'string' ? JSON.parse(data.responseHeaders) : data.responseHeaders;
        respHeaders = JSON.stringify(rh, null, 2);
      } catch (_e) { respHeaders = String(data.responseHeaders); }
    }

    var reqBody = formatBody(data.requestBody);
    var resBody = formatBody(data.responseBody);

    var tabs = [
      { id: 'response', label: 'Response', content: resBody },
      { id: 'reqHeaders', label: 'Req Headers', content: headers },
      { id: 'resHeaders', label: 'Res Headers', content: respHeaders },
      { id: 'reqBody', label: 'Req Body', content: reqBody },
    ];

    // E3 fix: proper ARIA tabs pattern
    var tablistHtml = '<div class="tabs" role="tablist" aria-label="Request details">';
    tabs.forEach(function (t, i) {
      var selected = i === 0;
      tablistHtml += '<button class="tab' + (selected ? ' active' : '') + '" role="tab" ' +
        'aria-selected="' + selected + '" ' +
        'aria-controls="tab-' + t.id + '" ' +
        'id="tab-' + t.id + '-tab" ' +
        'data-tab="' + t.id + '">' + escapeHtml(t.label) + '</button>';
    });
    tablistHtml += '</div>';

    var panelsHtml = '';
    tabs.forEach(function (t, i) {
      panelsHtml += '<div class="tab-content" role="tabpanel" id="tab-' + t.id + '" ' +
        'aria-labelledby="tab-' + t.id + '-tab"' +
        (i > 0 ? ' style="display:none"' : '') +
        '><pre>' + escapeHtml(t.content) + '</pre></div>';
    });

    detailPanel.innerHTML =
      '<div class="detail-header">' + escapeHtml(data.method) + ' ' + escapeHtml(data.url) + '</div>' +
      tablistHtml + panelsHtml;

    // Tab switching with ARIA updates
    detailPanel.querySelectorAll('[role="tab"]').forEach(function (tab) {
      tab.addEventListener('click', function () { activateTab(tab); });
      // Arrow key navigation per WAI-ARIA tabs pattern
      tab.addEventListener('keydown', function (e) {
        var allTabs = Array.from(detailPanel.querySelectorAll('[role="tab"]'));
        var idx = allTabs.indexOf(tab);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          var next = allTabs[(idx + 1) % allTabs.length];
          next.focus();
          activateTab(next);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          var prev = allTabs[(idx - 1 + allTabs.length) % allTabs.length];
          prev.focus();
          activateTab(prev);
        }
      });
    });

    detailPanel.style.display = '';
  }

  function activateTab(tab) {
    if (!detailPanel) return;
    detailPanel.querySelectorAll('[role="tab"]').forEach(function (t) {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
    });
    detailPanel.querySelectorAll('[role="tabpanel"]').forEach(function (c) { c.style.display = 'none'; });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');
    var target = document.getElementById('tab-' + tab.getAttribute('data-tab'));
    if (target) target.style.display = '';
  }

  function formatBody(body) {
    if (!body) return '(leeg)';
    try {
      var parsed = typeof body === 'string' ? JSON.parse(body) : body;
      return JSON.stringify(parsed, null, 2);
    } catch (_e) {
      return String(body);
    }
  }

  // Screencast
  var canvas = document.getElementById('screencastCanvas');
  var ctx = canvas ? canvas.getContext('2d') : null;

  function renderFrame(data) {
    if (!canvas || !ctx || !data.data) return;
    var img = new Image();
    img.onload = function () {
      if (canvas.width !== data.metadata.deviceWidth) canvas.width = data.metadata.deviceWidth;
      if (canvas.height !== data.metadata.deviceHeight) canvas.height = data.metadata.deviceHeight;
      ctx.drawImage(img, data.metadata.offsetTop || 0, 0);
    };
    img.src = 'data:image/jpeg;base64,' + data.data;
  }

  // Session events
  var startBtn = document.getElementById('startSessionBtn');
  var stopBtn = document.getElementById('stopSessionBtn');
  var sessionForm = document.getElementById('sessionForm');

  function onSessionStarted(data) {
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    if (sessionForm) sessionForm.classList.add('session-active');
    // Clear previous log
    if (requestLog) { requestLog.innerHTML = ''; count = 0; }
    if (requestCount) requestCount.textContent = '0';
  }

  function onSessionStopped(_data) {
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (sessionForm) sessionForm.classList.remove('session-active');
  }

  // Start session
  if (startBtn && sessionForm) {
    sessionForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('sessionName');
      var url = document.getElementById('targetUrl');
      var filter = document.getElementById('apiFilter');
      var authCheckbox = document.getElementById('captureAuthHeaders');
      if (!name || !url) return;

      startBtn.disabled = true;
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.value || 'Nieuwe sessie',
          targetUrl: url.value,
          apiFilter: (filter && filter.value) || '/api/',
          captureAuthHeaders: authCheckbox ? authCheckbox.checked : false
        })
      })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Fout'); });
        return r.json();
      })
      .catch(function (err) {
        alert('Fout bij starten: ' + err.message);
        startBtn.disabled = false;
      });
    });
  }

  // Stop session
  if (stopBtn) {
    stopBtn.addEventListener('click', function () {
      stopBtn.disabled = true;
      fetch('/api/sessions/active', { method: 'DELETE' })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Fout'); });
        })
        .catch(function (err) {
          alert('Fout bij stoppen: ' + err.message);
          stopBtn.disabled = false;
        });
    });
  }

  // HAR import
  var harForm = document.getElementById('harImportForm');
  if (harForm) {
    harForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var filePath = document.getElementById('harFilePath');
      var harName = document.getElementById('harName');
      var harFilter = document.getElementById('harFilter');
      if (!filePath || !filePath.value) return;

      var btn = harForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      fetch('/api/import-har', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: filePath.value,
          name: (harName && harName.value) || undefined,
          apiFilter: (harFilter && harFilter.value) || '/api/'
        })
      })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Fout'); });
        return r.json();
      })
      .then(function (data) {
        alert('HAR geimporteerd: ' + data.requestCount + ' requests in sessie ' + data.sessionId);
        location.reload();
      })
      .catch(function (err) {
        alert('Fout bij import: ' + err.message);
        if (btn) btn.disabled = false;
      });
    });
  }

  // Extraction form (moved from inline script in pages-extract.ts)
  var extractForm = document.getElementById('extractForm');
  if (extractForm) {
    var extractStartBtn = document.getElementById('startExtractBtn');
    var extractStopBtn = document.getElementById('stopExtractBtn');
    var extractResults = document.getElementById('extractResults');
    var extractLog = document.getElementById('extractLog');
    var extractProgressEl = document.getElementById('extractProgress');
    var extractTotalEl = document.getElementById('extractTotal');

    extractForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var checked = extractForm.querySelectorAll('input[name="endpoint"]:checked');
      var endpoints = [];
      checked.forEach(function (cb) { endpoints.push(cb.value); });
      if (endpoints.length === 0) { alert('Selecteer minstens 1 endpoint'); return; }

      extractStartBtn.disabled = true;
      extractStopBtn.disabled = false;
      extractResults.style.display = '';
      extractLog.innerHTML = '';
      extractTotalEl.textContent = endpoints.length;

      fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: parseInt(extractForm.querySelector('[name=sessionId]').value),
          baseUrl: extractForm.querySelector('[name=baseUrl]').value,
          endpoints: endpoints,
          delayMs: parseInt(document.getElementById('delayMs').value),
          jitterPercent: parseInt(document.getElementById('jitterPercent').value),
          maxErrorRate: parseInt(document.getElementById('maxErrorRate').value),
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        extractProgressEl.textContent = data.completed;
        data.results.forEach(function (r) {
          var row = document.createElement('div');
          row.className = 'request-row';
          // M-2 fix: use escapeHtml on all data values
          row.innerHTML = '<span class="request-time">' + escapeHtml(r.durationMs + 'ms') + '</span>' +
            '<span class="method method-GET">GET</span>' +
            '<span class="request-path">' + escapeHtml(r.endpoint) + '</span>' +
            '<span class="request-status ' + (r.status >= 200 && r.status < 300 ? 'status-2xx' : 'status-5xx') + '">' + escapeHtml(String(r.status)) + '</span>';
          extractLog.appendChild(row);
        });
        extractStartBtn.disabled = false;
        extractStopBtn.disabled = true;
      })
      .catch(function (err) {
        alert('Fout: ' + err.message);
        extractStartBtn.disabled = false;
        extractStopBtn.disabled = true;
      });
    });

    extractStopBtn.addEventListener('click', function () {
      fetch('/api/extract/stop', { method: 'POST' });
      extractStopBtn.disabled = true;
    });
  }

  // HTML escaping
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Session delete buttons
  document.querySelectorAll('.btn-delete').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var id = btn.getAttribute('data-session-id');
      if (!id) return;
      if (!confirm('Weet je zeker dat je deze sessie wilt verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
      fetch('/api/sessions/' + id, { method: 'DELETE' })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Fout'); });
          location.reload();
        })
        .catch(function (err) { alert('Fout bij verwijderen: ' + err.message); });
    });
  });

  // URL field: auto-prepend https:// if missing
  var urlFields = document.querySelectorAll('input[type="url"]');
  urlFields.forEach(function (field) {
    field.addEventListener('blur', function () {
      var val = field.value.trim();
      if (val && !/^https?:\/\//i.test(val)) {
        field.value = 'https://' + val;
      }
    });
  });

  // Sidebar toggle (moved from inline script in layout.ts)
  var panel = document.getElementById('sidebarPanel');
  var bar = document.querySelector('.activity-bar');
  var overlay = document.getElementById('mobileOverlay');

  if (panel && bar && overlay) {
    var isMobile = function () { return window.innerWidth <= 600; };
    var stored = localStorage.getItem('sidebarOpen');
    if (stored === 'false' && !isMobile()) panel.classList.remove('open');

    function closeMobile() {
      panel.classList.remove('mobile-open');
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }

    bar.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link) return;
      if (link.classList.contains('active')) {
        e.preventDefault();
        if (isMobile()) {
          panel.classList.toggle('mobile-open');
          overlay.classList.toggle('active');
          overlay.setAttribute('aria-hidden', String(!overlay.classList.contains('active')));
        } else {
          panel.classList.toggle('open');
          localStorage.setItem('sidebarOpen', panel.classList.contains('open'));
        }
      }
    });

    overlay.addEventListener('click', closeMobile);
    // L4 fix: close mobile overlay with Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('mobile-open')) {
        closeMobile();
      }
    });

    panel.querySelectorAll('.panel-nav a').forEach(function (a) {
      a.addEventListener('click', function () { if (isMobile()) closeMobile(); });
    });
  }

  // Connect on load
  connect();
})();
