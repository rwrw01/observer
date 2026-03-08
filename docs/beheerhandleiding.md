# Beheerhandleiding — API Observer

**Versie**: 1.0
**Datum**: 2026-03-08

---

## 1. Architectuuroverzicht

### Systeemarchitectuur

```
+---------------------------------------------+
|            Web Browser (UI)                  |
|   HTTP GET (pagina's, CSS, JS)               |
|   WebSocket (live events, screencast)        |
+---------------------------------------------+
              |
              v
+---------------------------------------------+
|         Node.js Server (server.ts)           |
|   native http + ws library                   |
|   Port: 3300 (configureerbaar)               |
|   Host: 127.0.0.1 (alleen lokaal)            |
+-----+-------+--------+-------+--------------+
      |       |        |       |
      v       v        v       v
+--------+ +------+ +------+ +--------+
|Playwright| |SQLite| |Cookie| |Pattern |
|Chromium  | |WAL   | |AES   | |Analyzer|
|Headful   | |mode  | |256   | |OpenAPI |
+--------+ +------+ +------+ +--------+
```

### Componenten

| Component | Bestand | Functie |
|-----------|---------|---------|
| HTTP/WS Server | `src/server.ts` | Entry point, routing, WebSocket, statische bestanden |
| API Routes | `src/routes-api.ts` | REST API handlers (sessies, analyse, extractie) |
| Pagina Routes | `src/routes-pages.ts` | HTML pagina handlers (server-side rendered) |
| Database | `src/database.ts` | SQLite initialisatie, queries, migraties |
| Session Manager | `src/session-manager.ts` | Playwright browser lifecycle |
| Request Interceptor | `src/request-interceptor.ts` | HTTP request/response capture |
| Screencast Bridge | `src/screencast-bridge.ts` | CDP screencast naar WebSocket relay |
| Cookie Extractor | `src/cookie-extractor.ts` | AES-256-GCM cookie encryptie/decryptie |
| Pattern Analyzer | `src/pattern-analyzer.ts` | URL parameterisatie, endpoint groepering |
| OpenAPI Generator | `src/openapi-generator.ts` | OpenAPI 3.0.3 spec builder |
| Data Extractor | `src/data-extractor.ts` | Verantwoorde API replay |
| HAR Importer | `src/har-importer.ts` | HAR 1.2 bestandsparser |
| Validatie | `src/validation.ts` | Zod input validatie schemas |
| Types | `src/types.ts` | TypeScript type-definities |
| UI Layout | `src/ui/layout.ts` | HTML shell (activity bar, sidebar, dark theme) |
| UI Pagina's | `src/ui/pages-*.ts` | Server-rendered HTML per pagina |
| Client JS | `src/ui/public/observer.js` | WebSocket, screencast canvas, formulieren |
| Client CSS | `src/ui/public/observer.css` | Dark theme stylesheet |

### Gebruikte technologieen

| Technologie | Versie | Licentie | Doel |
|-------------|--------|----------|------|
| Node.js | 22+ LTS | MIT | Runtime |
| TypeScript | 5.7.3 | Apache-2.0 | Taalcompiler |
| Playwright | 1.58.2 | Apache-2.0 | Browser automatisering |
| better-sqlite3 | 12.6.2 | MIT | SQLite database |
| ws | 8.18.0 | MIT | WebSocket server |
| zod | 3.24.2 | MIT | Input validatie |
| yaml | 2.7.1 | ISC | YAML export |
| tsx | 4.19.3 | MIT | TypeScript runner (dev) |

### Infrastructuurvereisten

| Resource | Minimum | Aanbevolen |
|----------|---------|------------|
| CPU | 1 core | 2 cores |
| Geheugen | 512 MB | 1 GB (Chromium gebruikt ~200-400 MB) |
| Opslag | 100 MB + data | 500 MB |
| OS | Windows 10+, macOS 12+, Ubuntu 20.04+ | |
| Node.js | 22.0.0 | 22 LTS (laatste patch) |

### Netwerkpoorten

| Poort | Protocol | Richting | Doel |
|-------|----------|----------|------|
| 3300 (standaard) | HTTP + WS | Inbound (alleen localhost) | Web UI en API |

---

## 2. Installatie en configuratie

### Systeemvereisten

- Node.js 22+ (LTS)
- npm (meegeleverd met Node.js)
- Git (voor broncode ophalen)

### Installatie

```bash
# 1. Broncode ophalen
git clone <repository-url> observer
cd observer

# 2. Dependencies installeren
npm install

# 3. Playwright browser installeren
npx playwright install chromium

# 4. (Optioneel) TypeScript compileren voor productie
npm run build
```

### Configuratie

Alle configuratie gaat via omgevingsvariabelen. Kopieer `.env.example` naar `.env` voor development:

```bash
cp .env.example .env
```

| Variabele | Type | Standaard | Verplicht | Beschrijving |
|-----------|------|-----------|-----------|-------------|
| `PORT` | Integer (1024-65535) | `3300` | Nee | Poort waarop de server luistert |
| `COOKIE_PASSPHRASE` | String | Auto-gegenereerd | Nee | Passphrase voor AES-256-GCM cookie-encryptie |

**Over COOKIE_PASSPHRASE:**
- Als niet ingesteld, genereert de server automatisch een passphrase en slaat deze op in `data/.cookie-passphrase`
- Voor productie: stel een eigen passphrase in via de omgevingsvariabele
- De passphrase wordt gebruikt met scrypt key derivation (N=16384, r=8, p=1)

### Database

De SQLite database wordt automatisch aangemaakt bij eerste start in `data/observer.db`. Er zijn geen handmatige migraties nodig — het schema wordt bij startup gecontroleerd en aangemaakt.

**Tabellen:**
- `sessions` — Observatiesessies (naam, URL, status, tijden)
- `requests` — Vastgelegde HTTP requests/responses
- `cookies` — Versleutelde session cookies
- `endpoints` — Geanalyseerde endpoint-patronen
- `specs` — Gegenereerde OpenAPI specificaties

**WAL mode:** De database gebruikt Write-Ahead Logging voor betere concurrency (lezen terwijl geschreven wordt).

---

## 3. Deployment

### Development

```bash
npm run dev
```

Gebruikt `tsx` om TypeScript direct uit te voeren. Hot reload is niet ingebouwd — herstart de server na codewijzigingen.

### Productie

```bash
npm run build    # Compileert TypeScript naar dist/
npm start        # Start vanuit dist/
```

**Let op:** Bij productie-build worden CSS en JS bestanden niet gekopieerd naar `dist/`. De server verwijst via `__dirname` naar de bronbestanden. Zorg dat `src/ui/public/` beschikbaar blijft.

### Docker (optioneel)

Er is op dit moment geen Dockerfile meegeleverd. Bij containerisatie:

- Gebruik `node:22-alpine` als basis
- Installeer Playwright Chromium (`npx playwright install --with-deps chromium`)
- Chromium in een container vereist extra flags: `--no-sandbox`, `--disable-dev-shm-usage`
- Stel `PORT` in via omgevingsvariabele
- Mount `data/` als volume voor persistentie

### Stoppen

- Druk op `Ctrl+C` in de terminal
- De server handelt SIGTERM en SIGINT netjes af:
  1. Actieve screencast stoppen
  2. Browser sluiten
  3. Actieve sessie als voltooid markeren
  4. WebSocket-verbindingen sluiten
  5. Database sluiten

---

## 4. Beheer en onderhoud

### Dagelijks beheer

Deze tool is bedoeld als lokale development/analyse tool. Er is geen dagelijks beheer nodig. Controleer bij langdurig gebruik:

- **Schijfruimte** — De SQLite database groeit met het aantal vastgelegde requests (response bodies tot 50 KB per request)
- **Poortgebruik** — Controleer met `netstat -ano | grep 3300` of de poort vrij is

### Logging

Alle logs gaan naar **stdout/stderr** (conform 12-factor principes):

```
API Observer: http://127.0.0.1:3300     # Startup
Extracted 15 cookies from session 1      # Cookie extractie
Screencast error: ...                    # Fout bij screencast
Shutting down...                         # Afsluiting
```

### Backup

```bash
# Database backup (server mag draaien — WAL mode ondersteunt dit)
cp data/observer.db data/observer-backup-$(date +%Y%m%d).db

# Cookie passphrase backup
cp data/.cookie-passphrase data/.cookie-passphrase.backup
```

**Waarschuwing:** De cookie passphrase is nodig om opgeslagen cookies te ontsleutelen. Verlies van de passphrase betekent dat versleutelde cookies onbruikbaar worden.

### Database onderhoud

```bash
# Database comprimeren (na veel deletes)
sqlite3 data/observer.db "VACUUM;"

# WAL-checkpoint forceren
sqlite3 data/observer.db "PRAGMA wal_checkpoint(TRUNCATE);"

# Database grootte controleren
ls -lh data/observer.db
```

### Dependency updates

```bash
# Controleer op bekende kwetsbaarheden
npm audit

# Update naar nieuwste patch-versies
npm update

# Playwright browser bijwerken
npx playwright install chromium
```

---

## 5. Beveiliging

### Getroffen maatregelen

| Maatregel | Implementatie |
|-----------|---------------|
| **Netwerkbinding** | Server bindt uitsluitend op `127.0.0.1` — niet bereikbaar via netwerk |
| **Security headers** | CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy |
| **Cookie-encryptie** | AES-256-GCM met scrypt key derivation |
| **Header-redactie** | Authorization, Cookie, API key headers geredacteerd in UI |
| **Input validatie** | Zod schemas op alle API-endpoints |
| **Body limieten** | Request body max 1 MB, response body truncatie 50 KB |
| **Path traversal** | Blokkering van `..` en null-bytes in statische bestandspaden |
| **Geen eval()** | Geen dynamische code-executie |

### Content Security Policy

```
default-src 'self';
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline';
connect-src 'self' ws://127.0.0.1:*;
img-src 'self' data:
```

`'unsafe-inline'` is nodig voor:
- **style-src**: Inline style-attributen in de server-rendered HTML
- **script-src**: Inline scripts voor extractie-formulier en sidebar-toggle

### Secrets beheer

| Secret | Opslag | Rotatie |
|--------|--------|---------|
| COOKIE_PASSPHRASE | Omgevingsvariabele of `data/.cookie-passphrase` | Handmatig — bij rotatie worden bestaande versleutelde cookies ongeldig |

### Audit logging

Er is op dit moment geen gestructureerde audit log. Alle API-acties worden gelogd naar stdout. Voor productiegebruik wordt aangeraden:
- Structured JSON logging toe te voegen
- Acties als sessie starten/stoppen en data-extractie expliciet te loggen

---

## 6. Schalen

API Observer is ontworpen als een **single-user lokale tool**. Schalen is niet van toepassing:

- Eén gebruiker tegelijk
- Eén browser-sessie tegelijk
- Eén SQLite database (geen replicatie)
- Geen load balancing nodig

Voor multi-user gebruik zou een fundamenteel herontwerp nodig zijn (PostgreSQL, sessie-isolatie, authenticatie).

---

## 7. Troubleshooting voor beheerders

### Health check endpoints

| Endpoint | Verwachte response | Beschrijving |
|----------|-------------------|-------------|
| `GET /healthz` | `{"status":"ok"}` | Liveness: proces draait |
| `GET /readyz` | `{"status":"ok","db":true}` | Readiness: database bereikbaar |
| `GET /api/status` | `{"activeSessionId":null,"hasBrowser":false}` | Applicatiestatus |

### Diagnostische commando's

```bash
# Server bereikbaar?
curl http://127.0.0.1:3300/healthz

# CSS wordt correct geladen?
curl -sI http://127.0.0.1:3300/public/observer.css | head -5
# Verwacht: HTTP/1.1 200 OK, Content-Type: text/css

# Actieve processen op poort 3300
netstat -ano | grep 3300

# Database integriteit controleren
sqlite3 data/observer.db "PRAGMA integrity_check;"

# Aantal sessies en requests
sqlite3 data/observer.db "SELECT COUNT(*) FROM sessions; SELECT COUNT(*) FROM requests;"
```

### Veelvoorkomende problemen

| Probleem | Diagnose | Oplossing |
|----------|----------|-----------|
| Poort bezet | `netstat -ano \| grep 3300` toont ander PID | Stop het proces of gebruik `PORT=3301` |
| CSS niet geladen | `curl -sI .../public/observer.css` toont 404 | Herstart server — mogelijk verouderd proces |
| Database locked | Foutmelding `SQLITE_BUSY` | Controleer of er meerdere processen draaien; stop duplicaten |
| Chromium start niet | Foutmelding bij sessie starten | `npx playwright install chromium` opnieuw uitvoeren |
| Hoog geheugengebruik | > 500 MB | Normaal als Chromium draait; sluit sessie om geheugen vrij te geven |
| MSYS pad-conversie | `/api/` wordt `C:/Program Files/Git/api/` | Stel `MSYS_NO_PATHCONV=1` in bij gebruik van Git Bash op Windows |

---

## 8. Disaster recovery

### Data-locaties

| Bestand | Beschrijving | Kritiek |
|---------|-------------|---------|
| `data/observer.db` | SQLite database met alle sessies, requests, specs | Ja |
| `data/.cookie-passphrase` | Auto-gegenereerde encryptiesleutel | Ja (voor cookie-decryptie) |

### Recovery procedure

1. **Server werkt niet meer:**
   - Controleer of Node.js beschikbaar is: `node --version`
   - Herinstalleer dependencies: `npm install`
   - Herinstalleer browser: `npx playwright install chromium`
   - Start opnieuw: `npm run dev`

2. **Database corrupt:**
   - Stop de server
   - Probeer: `sqlite3 data/observer.db ".recover" | sqlite3 data/observer-recovered.db`
   - Of restore vanuit backup: `cp data/observer-backup-*.db data/observer.db`

3. **Alles kwijt:**
   - De tool kan volledig opnieuw worden geinstalleerd
   - Alleen geobserveerde sessiedata gaat verloren (dit kan opnieuw worden vastgelegd)
   - HAR-bestanden die geimporteerd zijn blijven beschikbaar als de originele `.har`-bestanden nog bestaan
