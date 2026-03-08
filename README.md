# API Observer

Generieke tool voor het observeren, analyseren en documenteren van API-verkeer op willekeurige websites.

## Functies

- **Live observatie** — Playwright browser opent de doelwebsite; alle API-calls worden onderschept en gelogd
- **HAR import** — Importeer bestaande HAR-bestanden voor offline analyse
- **Patroon analyse** — Automatische detectie van REST/GraphQL endpoints, CRUD-patronen, paginatie en authenticatie
- **OpenAPI generatie** — Genereer OpenAPI 3.0.3 specificaties uit geobserveerd verkeer (JSON/YAML download)
- **Cookie management** — Session cookies veilig opgeslagen met AES-256-GCM encryptie, MFA-compatibel
- **Data extractie** — Verantwoorde API replay met rate limiting, jitter en robots.txt-controle
- **VS Code-stijl UI** — Dark theme webinterface met activity bar, sidebar en live request log
- **Browser screencast** — CDP-gebaseerde live mirror van de Playwright browser in de web UI

## Vereisten

| Software | Versie | Doel |
|----------|--------|------|
| [Node.js](https://nodejs.org/) | 22+ (LTS) | Runtime |
| npm | meegeleverd met Node.js | Package manager |
| Chromium | via Playwright | Browser voor live observatie |

### Systeemvereisten

- **OS**: Windows 10+, macOS 12+, of Linux (Ubuntu 20.04+, Debian 11+, Fedora 36+)
- **Geheugen**: minimaal 512 MB vrij (Chromium gebruikt ~200-400 MB per sessie)
- **Schijf**: ~500 MB voor Chromium browser binaries + ~50 MB voor dependencies

## Installatie

```bash
# 1. Clone de repository
git clone <repository-url>
cd observer

# 2. Installeer Node.js dependencies
npm install

# 3. Installeer Chromium browser (vereist voor live observatie)
npx playwright install chromium
```

> **Opmerking:** `npx playwright install chromium` downloadt een Chromium-binary (~200 MB) specifiek voor Playwright. Dit is een eenmalige stap. Gebruik `npx playwright install --with-deps chromium` op Linux om ook systeem-dependencies te installeren.

## Gebruik

### Development

```bash
npm run dev
```

### Productie

```bash
npm run build
npm start
```

De server start op `http://127.0.0.1:3300` (configureerbaar via `PORT` environment variable).

Open een browser naar `http://127.0.0.1:3300` om de webinterface te gebruiken.

### Snelstart

1. **Observeren**: ga naar `/observe`, vul een naam en URL in, klik "Sessie starten"
2. **Navigeer** door de website in het browservenster — API-calls worden automatisch vastgelegd
3. **Stop** de sessie wanneer klaar
4. **Analyseer**: ga naar `/analysis`, selecteer de sessie voor automatische patroonherkenning
5. **Download**: ga naar `/openapi` voor de gegenereerde OpenAPI-specificatie

### HAR importeren (CLI)

```bash
npm run import-har -- pad/naar/bestand.har [naam] [filter]
```

## Configuratie

Zie `.env.example` voor beschikbare environment variables:

| Variable | Standaard | Beschrijving |
|----------|-----------|-------------|
| `PORT` | `3300` | Server poort (1024-65535) |
| `COOKIE_PASSPHRASE` | Auto-gegenereerd | Passphrase voor cookie-encryptie |

## API Endpoints

| Methode | Pad | Beschrijving |
|---------|-----|-------------|
| `GET` | `/api/sessions` | Lijst alle sessies |
| `POST` | `/api/sessions` | Start nieuwe live sessie |
| `DELETE` | `/api/sessions/active` | Stop actieve sessie |
| `GET` | `/api/sessions/:id` | Sessie details |
| `DELETE` | `/api/sessions/:id` | Verwijder sessie |
| `GET` | `/api/sessions/:id/requests` | Requests van sessie |
| `POST` | `/api/sessions/:id/analyze` | Analyseer sessie en genereer spec |
| `POST` | `/api/import-har` | Importeer HAR bestand |
| `GET` | `/api/specs/:id/json` | Download OpenAPI spec (JSON) |
| `GET` | `/api/specs/:id/yaml` | Download OpenAPI spec (YAML) |
| `POST` | `/api/extract` | Start data extractie |
| `POST` | `/api/extract/stop` | Stop extractie |
| `GET` | `/api/extract/progress` | Extractie voortgang |
| `GET` | `/api/status` | Server status |
| `GET` | `/healthz` | Liveness check |
| `GET` | `/readyz` | Readiness check |
| `WS` | `ws://127.0.0.1:3300` | WebSocket (live events + screencast) |

## Architectuur

```
src/
  server.ts                 # HTTP + WebSocket server, entry point
  routes-api.ts             # API route handlers
  routes-pages.ts           # HTML page route handlers
  database.ts               # SQLite (WAL mode), schema, queries
  session-manager.ts        # Playwright browser lifecycle
  request-interceptor.ts    # Request/response capture
  screencast-bridge.ts      # CDP screencast → WebSocket relay
  cookie-extractor.ts       # AES-256-GCM cookie encryptie/decryptie
  pattern-analyzer.ts       # URL parameterizatie, endpoint groepering
  openapi-generator.ts      # OpenAPI 3.0.3 spec builder
  data-extractor.ts         # Verantwoorde API replay
  har-importer.ts           # HAR bestand import
  types.ts                  # Gedeelde TypeScript types
  validation.ts             # Zod input validatie schemas
  ui/
    layout.ts               # VS Code-stijl HTML shell
    pages-sessions.ts       # Sessie-overzicht
    pages-observe.ts        # Live observatie
    pages-analysis.ts       # Analyse rapport
    pages-openapi.ts        # OpenAPI spec viewer
    pages-extract.ts        # Data extractie configuratie
    pages-help.ts           # In-app helppage
    public/
      observer.css          # Dark theme stylesheet (WCAG 2.2 AA)
      observer.js           # Client-side WebSocket + canvas + UI logic
```

## Beveiliging

- Server bindt uitsluitend op `127.0.0.1` (nooit `0.0.0.0`)
- Security headers op alle responses (CSP, X-Frame-Options, nosniff, Referrer-Policy)
- CSP: `script-src 'self'` (geen `unsafe-inline`), alle scripts in extern `.js` bestand
- CSRF-bescherming via Origin-header validatie op muterende endpoints
- WebSocket origin-validatie (`verifyClient`)
- Cookie-waarden versleuteld met AES-256-GCM (scrypt key derivation)
- Sensitive headers (Authorization, Cookie, API keys) geredacteerd in UI
- Input validatie via Zod op alle API endpoints (inclusief HAR-import en extractie)
- SSRF-bescherming: extractie naar private/localhost adressen geblokkeerd
- Request body limiet: 1MB
- Response body truncatie: 50KB per request
- Path traversal bescherming via `path.resolve()` + prefix-check
- Geen `eval()`, geen dynamic `require()`

## Data extractie waarborgen

- Rate limiting: configureerbare vertraging (500ms-60s) met random jitter
- Sequentieel: 1 concurrent request
- robots.txt controle voor eerste request
- Auto-pauze bij >20% error rate
- Alleen GET requests (geen write operaties)
- Eerlijke User-Agent: `APIObserver/1.0` (geen browser-spoofing)

## Toegankelijkheid (WCAG 2.2 AA)

- Skip-link naar hoofdinhoud
- Semantische landmarks (`<nav>`, `<aside>`, `<main>`)
- Kleurcontrast: minimaal 4.5:1 ratio
- Toetsenbord-navigeerbare request log en tabs (pijltjestoetsen)
- ARIA: `role="log"`, `aria-live`, `role="tablist/tab/tabpanel"`
- Focusindicatoren op alle interactieve elementen
- Status-informatie niet alleen via kleur (tekst-iconen)

## Dependencies

| Dependency | Versie | Licentie | Doel |
|------------|--------|----------|------|
| [playwright](https://playwright.dev/) | 1.58.2 | Apache-2.0 | Browser automatisering + Chromium |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 12.6.2 | MIT | SQLite database (WAL mode) |
| [ws](https://github.com/websockets/ws) | 8.18.0 | MIT | WebSocket server |
| [zod](https://zod.dev/) | 3.24.2 | MIT | Input validatie |
| [yaml](https://eemeli.org/yaml/) | 2.7.1 | ISC | YAML serialisatie |

### Dev dependencies

| Dependency | Versie | Licentie | Doel |
|------------|--------|----------|------|
| [typescript](https://www.typescriptlang.org/) | 5.7.3 | Apache-2.0 | TypeScript compiler |
| [tsx](https://tsx.is/) | 4.19.3 | MIT | TypeScript uitvoeren (dev mode) |
| [@types/better-sqlite3](https://www.npmjs.com/package/@types/better-sqlite3) | 7.6.13 | MIT | Type definities |
| [@types/ws](https://www.npmjs.com/package/@types/ws) | 8.18.0 | MIT | Type definities |
| [@types/node](https://www.npmjs.com/package/@types/node) | 22.13.10 | MIT | Type definities |

## Licentie

EUPL-1.2 — zie [LICENSE](LICENSE)
