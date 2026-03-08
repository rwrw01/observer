/* API Observer — Client-side WebSocket, screencast, and request log */
(function () {
  'use strict';

  var wsUrl = 'ws://' + location.hostname + ':' + location.port;
  var ws = null;
  var reconnectTimer = null;
  var RECONNECT_DELAY = 2000;

  // Connection indicator
  var dot = document.querySelector('.connection-dot');

  function setConnected(connected) {
    if (dot) {
      dot.classList.toggle('connected', connected);
      dot.title = connected ? 'Verbonden' : 'Niet verbonden';
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

  function appendRequest(data) {
    if (!requestLog) return;
    count++;
    if (requestCount) requestCount.textContent = count;

    var row = document.createElement('div');
    row.className = 'request-row';
    row.setAttribute('data-id', data.id || '');

    var time = new Date(data.timestamp).toLocaleTimeString('nl-NL');
    var duration = data.durationMs != null ? data.durationMs + 'ms' : '-';
    var status = data.responseStatus || '-';
    var sClass = typeof status === 'number' ? statusClass(status) : '';

    row.innerHTML =
      '<span class="request-time">' + escapeHtml(time) + '</span>' +
      '<span class="method method-' + escapeHtml(data.method) + '">' + escapeHtml(data.method) + '</span>' +
      '<span class="request-path" title="' + escapeHtml(data.url) + '">' + escapeHtml(data.path) + '</span>' +
      '<span class="request-status ' + sClass + '">' + escapeHtml(String(status)) + '</span>' +
      '<span class="request-duration">' + escapeHtml(duration) + '</span>';

    row.addEventListener('click', function () { showRequestDetail(data); });
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

    detailPanel.innerHTML =
      '<div class="detail-header">' + escapeHtml(data.method) + ' ' + escapeHtml(data.url) + '</div>' +
      '<div class="tabs">' +
        '<button class="tab active" data-tab="response">Response</button>' +
        '<button class="tab" data-tab="reqHeaders">Req Headers</button>' +
        '<button class="tab" data-tab="resHeaders">Res Headers</button>' +
        '<button class="tab" data-tab="reqBody">Req Body</button>' +
      '</div>' +
      '<div class="tab-content" id="tab-response"><pre>' + escapeHtml(resBody) + '</pre></div>' +
      '<div class="tab-content" id="tab-reqHeaders" style="display:none"><pre>' + escapeHtml(headers) + '</pre></div>' +
      '<div class="tab-content" id="tab-resHeaders" style="display:none"><pre>' + escapeHtml(respHeaders) + '</pre></div>' +
      '<div class="tab-content" id="tab-reqBody" style="display:none"><pre>' + escapeHtml(reqBody) + '</pre></div>';

    detailPanel.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        detailPanel.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        detailPanel.querySelectorAll('.tab-content').forEach(function (c) { c.style.display = 'none'; });
        tab.classList.add('active');
        var target = document.getElementById('tab-' + tab.getAttribute('data-tab'));
        if (target) target.style.display = '';
      });
    });

    detailPanel.style.display = '';
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
      if (!name || !url) return;

      startBtn.disabled = true;
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.value || 'Nieuwe sessie',
          targetUrl: url.value,
          apiFilter: (filter && filter.value) || '/api/'
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

  // Connect on load
  connect();
})();
