/** Escape HTML to prevent XSS */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** SVG icons used in the UI */
const ICONS = {
  observe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
  sessions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  analysis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  openapi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  extract: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
} as const;

interface NavItem {
  href: string;
  page: string;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', page: 'sessions', icon: ICONS.sessions, label: 'Sessies' },
  { href: '/observe', page: 'observe', icon: ICONS.observe, label: 'Observeren' },
  { href: '/analysis', page: 'analysis', icon: ICONS.analysis, label: 'Analyse' },
  { href: '/openapi', page: 'openapi', icon: ICONS.openapi, label: 'OpenAPI' },
  { href: '/extract', page: 'extract', icon: ICONS.extract, label: 'Extractie' },
  { href: '/help', page: 'help', icon: ICONS.help, label: 'Help' },
];

/** Render the VS Code-style layout shell with dark theme */
export function renderLayout(title: string, body: string, activePage: string, port: number): string {
  const activityBarHtml = NAV_ITEMS.map((item) =>
    `<a href="${item.href}" data-page="${item.page}" class="${activePage === item.page ? 'active' : ''}" aria-label="${item.label}" title="${item.label}">${item.icon}</a>`
  ).join('\n  ');

  const sidebarNavHtml = NAV_ITEMS.map((item) =>
    `<a href="${item.href}" class="${activePage === item.page ? 'active' : ''}">${item.icon} ${item.label}</a>`
  ).join('\n    ');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - API Observer</title>
<link rel="stylesheet" href="/public/observer.css">
</head>
<body>
<nav class="activity-bar" aria-label="Hoofdnavigatie">
  ${activityBarHtml}
</nav>
<aside class="sidebar-panel open" id="sidebarPanel" aria-label="Zijbalk">
  <div class="panel-header">API Observer</div>
  <div class="panel-nav">
    ${sidebarNavHtml}
  </div>
</aside>
<main class="main" role="main">
<div class="titlebar">
  <span class="page-title">${escapeHtml(title)}</span>
</div>
<div class="container">
${body}
</div>
</main>
<script src="/public/observer.js"></script>
<div class="mobile-overlay" id="mobileOverlay"></div>
<script>
(function() {
  var panel = document.getElementById('sidebarPanel');
  var bar = document.querySelector('.activity-bar');
  var overlay = document.getElementById('mobileOverlay');
  var isMobile = function() { return window.innerWidth <= 600; };
  var stored = localStorage.getItem('sidebarOpen');
  if (stored === 'false' && !isMobile()) panel.classList.remove('open');
  function closeMobile() {
    panel.classList.remove('mobile-open');
    overlay.classList.remove('active');
  }
  bar.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (!link) return;
    if (link.classList.contains('active')) {
      e.preventDefault();
      if (isMobile()) {
        panel.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
      } else {
        panel.classList.toggle('open');
        localStorage.setItem('sidebarOpen', panel.classList.contains('open'));
      }
    }
  });
  overlay.addEventListener('click', closeMobile);
  panel.querySelectorAll('.panel-nav a').forEach(function(a) {
    a.addEventListener('click', function() { if (isMobile()) closeMobile(); });
  });
})();
</script>
</body>
</html>`;
}
