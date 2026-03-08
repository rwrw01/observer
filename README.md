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

- Node.js 22+ (LTS)
- npm

## Installatie

```bash
npm install
npx playwright install chromium
```

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
    public/
      observer.css          # Dark theme stylesheet
      observer.js           # Client-side WebSocket + canvas
```

## Beveiliging

- Server bindt uitsluitend op `127.0.0.1` (nooit `0.0.0.0`)
- Security headers op alle responses (CSP, X-Frame-Options, nosniff, Referrer-Policy)
- Cookie-waarden versleuteld met AES-256-GCM (scrypt key derivation)
- Sensitive headers (Authorization, Cookie, API keys) geredacteerd in UI
- Input validatie via Zod op alle API endpoints
- Request body limiet: 1MB
- Response body truncatie: 50KB per request
- Path traversal bescherming op statische bestanden
- Geen `eval()`, geen dynamic `require()`

## Data extractie waarborgen

- Rate limiting: configureerbare vertraging (500ms-30s) met random jitter
- Sequentieel: 1 concurrent request
- robots.txt controle voor eerste request
- Auto-pauze bij >20% error rate
- Alleen GET requests (geen write operaties)
- Human-like User-Agent header

## Dependencies

| Dependency | Versie | Licentie |
|------------|--------|----------|
| playwright | 1.58.2 | Apache-2.0 |
| better-sqlite3 | 12.6.2 | MIT |
| ws | 8.18.0 | MIT |
| zod | 3.24.2 | MIT |
| yaml | 2.7.1 | ISC |

### Dev dependencies

| Dependency | Versie | Licentie |
|------------|--------|----------|
| typescript | 5.7.3 | Apache-2.0 |
| tsx | 4.19.3 | MIT |
| @types/better-sqlite3 | 7.6.13 | MIT |
| @types/ws | 8.18.0 | MIT |
| @types/node | 22.13.10 | MIT |

## Licentie

EUPL-1.2 — zie [LICENSE](LICENSE)
