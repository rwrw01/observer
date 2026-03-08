# Beveiligingsaudit API Observer

**Project:** API Observer (`c:\dev\observer`)
**Auditor:** Senior Security Engineer
**Datum:** 2026-03-08
**Scope:** Volledige broncode, configuratie, afhankelijkheden, architectuur

---

## Management Samenvatting

API Observer is een lokale tool (single-user, localhost-only) voor het observeren en documenteren van web-API's. De codebase is compact (~2800 regels, 21 TypeScript-bestanden) en toont een bovengemiddeld beveiligingsbewustzijn voor een lokale tool: binding op 127.0.0.1, security headers, HTML-escaping, cookie-encryptie met AES-256-GCM, Zod-validatie, en body-sizelimits.

Er zijn **geen kritieke (CRITICAL) bevindingen**. Er zijn **3 bevindingen op HIGH-niveau**, **5 op MEDIUM-niveau** en **4 op LOW-niveau**. De meeste risico's worden gemitigeerd door het feit dat de server uitsluitend op localhost draait. Bij eventuele toekomstige netwerkexposure worden de HIGH-bevindingen urgent.

**Totaalscore Defense in Depth: 3.3 / 5 (Goed)**

---

## Kritieke bevindingen (CRITICAL)

Geen.

---

## Hoge bevindingen (HIGH)

### H-1: Path Traversal bij HAR-import via API endpoint

**Locatie:** `src/routes-api.ts:94-97`
**Beschrijving:** Het `/api/import-har` endpoint accepteert een willekeurig `filePath` van de client en leest dit bestand direct met `readFileSync`. Hoewel `harImportSchema` bestaat in `validation.ts`, wordt deze NIET gebruikt. De body wordt met `as Record<string, unknown>` gecast en `body.filePath as string` wordt ongevalideerd doorgegeven aan `importHarFile()`.
**Impact:** Een aanvaller met toegang tot localhost kan elk leesbaar bestand op het systeem lezen (bijv. `C:\Users\...\.ssh\id_rsa`, `/etc/passwd`). Het bestand moet geen geldig HAR zijn om een informatief foutbericht terug te krijgen.
**Bewijs:**
```typescript
// routes-api.ts:94
const body = JSON.parse(await ctx.readBody(req)) as Record<string, unknown>;
const result = importHarFile(ctx.db, body.filePath as string, ...);
```
**Oplossing:** Gebruik `harImportSchema.parse(body)` en beperk bestandspaden tot een toegestane directory (bijv. `data/`). Valideer dat het pad niet buiten de toegestane map wijst.
**Referentie:** CWE-22 (Path Traversal), OWASP A01:2021 Broken Access Control

### H-2: Ontbrekende inputvalidatie op `/api/extract` endpoint

**Locatie:** `src/routes-api.ts:115-128`
**Beschrijving:** Het extract-endpoint accepteert `sessionId`, `endpoints`, `baseUrl`, `delayMs` etc. zonder enige Zod-validatie. Alle waarden worden met `as` gecast. De `baseUrl` wordt gebruikt om HTTP-requests naar willekeurige URL's te sturen, en `endpoints` is een array van strings die aan de baseUrl worden geconcateneerd.
**Impact:** Server-Side Request Forgery (SSRF) — een aanvaller kan de observer laten verzoeken doen naar interne services (bijv. `http://169.254.169.254/` voor cloud metadata, of interne netwerken). De `delayMs` kan op 0 gezet worden om rate limiting te omzeilen.
**Bewijs:**
```typescript
// routes-api.ts:116-117
const body = JSON.parse(await ctx.readBody(req)) as Record<string, unknown>;
const result = await startExtraction(ctx.db, {
  sessionId: body.sessionId as number,
  endpoints: body.endpoints as string[],
  baseUrl: body.baseUrl as string, // Geen validatie!
```
**Oplossing:** Maak een Zod-schema voor extractie-input met URL-validatie (alleen https/http), minimale delay (bijv. 500ms), en een maximum op endpoints.
**Referentie:** CWE-918 (SSRF), OWASP A10:2021 Server-Side Request Forgery

### H-3: Spoofbare User-Agent bij data-extractie

**Locatie:** `src/data-extractor.ts:135`
**Beschrijving:** De data-extractor stuurt requests met een hardcoded User-Agent die een reguliere browser nabootst: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`. Dit maskeert geautomatiseerd verkeer als menselijk verkeer.
**Impact:** Dit kan de detectie van geautomatiseerd verkeer door doelsystemen ondermijnen, en kan juridische consequenties hebben bij ongeautoriseerd gebruik.
**Bewijs:**
```typescript
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
```
**Oplossing:** Gebruik een eerlijke User-Agent zoals `APIObserver/1.0 (+https://github.com/...)` zodat doelsystemen geautomatiseerd verkeer kunnen herkennen.
**Referentie:** CWE-290 (Authentication Bypass by Spoofing)

---

## Gemiddelde bevindingen (MEDIUM)

### M-1: CSP staat 'unsafe-inline' toe voor script-src en style-src

**Locatie:** `src/server.ts:38`
**Beschrijving:** De Content Security Policy bevat `script-src 'self' 'unsafe-inline'` en `style-src 'self' 'unsafe-inline'`. De inline scripts in `layout.ts` en `pages-extract.ts` zijn de reden. Dit verzwakt XSS-bescherming.
**Impact:** Als er ergens een XSS-vector wordt gevonden, kan `unsafe-inline` exploitatie vergemakkelijken.
**Oplossing:** Verplaats alle inline scripts naar `observer.js`. Gebruik dan nonce-based CSP of verwijder `'unsafe-inline'`.
**Referentie:** CWE-79 (XSS), OWASP A03:2021 Injection

### M-2: XSS-risico in extractie inline script via `r.endpoint`

**Locatie:** `src/ui/pages-extract.ts:153-156`
**Beschrijving:** In het inline script van de extractiepagina wordt `r.endpoint` direct in de HTML geplaatst via `innerHTML` zonder escaping.
**Impact:** Stored XSS als de geobserveerde API-endpoints kwaadaardige padnamen bevatten.
**Oplossing:** Voeg `escapeHtml()` toe aan het inline script of gebruik `textContent`.
**Referentie:** CWE-79 (XSS), OWASP A03:2021 Injection

### M-3: Geen authenticatie/autorisatie op enig endpoint

**Locatie:** Alle routes in `src/routes-api.ts` en `src/routes-pages.ts`
**Beschrijving:** Geen enkel API-endpoint vereist authenticatie. Elk proces op localhost heeft volledige toegang. Browsers staan cross-origin requests toe naar localhost, en de CSP voorkomt dit niet.
**Impact:** Elke malafide webpagina geopend in dezelfde browser kan via JavaScript (CSRF) sessies starten, data extraheren, of bestanden lezen via het HAR-import endpoint.
**Oplossing:** Voeg op zijn minst een CSRF-token of een geheim bearer-token toe (gegenereerd bij opstart, getoond in de console). Overweeg ook `SameSite` cookie-gebaseerde sessies.
**Referentie:** CWE-352 (CSRF), OWASP A01:2021 Broken Access Control

### M-4: WebSocket zonder origin-validatie

**Locatie:** `src/server.ts:128-137`
**Beschrijving:** De WebSocket-server accepteert verbindingen van elke origin. Er is geen `verifyClient`-callback die de Origin-header controleert.
**Impact:** Een kwaadaardige webpagina kan een WebSocket-verbinding openen naar `ws://127.0.0.1:3300` en alle screencast-frames en request-data in real-time ontvangen.
**Oplossing:** Voeg een `verifyClient`-functie toe die controleert dat de Origin `http://127.0.0.1:3300` is.
**Referentie:** CWE-346 (Origin Validation Error)

### M-5: SQL LIKE-injectie bij cookie-domein query

**Locatie:** `src/cookie-extractor.ts:116-117`
**Beschrijving:** De `getCookieHeader`-functie gebruikt een LIKE-query met `%${domain}` zonder de SQL-wildcard-tekens (`%`, `_`) te escapen.
**Impact:** Beperkt door single-user context, maar het is een patroonschending.
**Oplossing:** Escape `%` en `_` in de domain-parameter, of gebruik exacte match.
**Referentie:** CWE-89 (SQL Injection)

---

## Lage bevindingen (LOW)

### L-1: Foutmeldingen lekken stacktraces naar client

**Locatie:** `src/server.ts:124`
**Beschrijving:** Bij een onafgevangen exception wordt `err.message` teruggestuurd. Error-messages van bijv. SQLite of het bestandssysteem kunnen interne padnamen en configuratie onthullen.
**Oplossing:** Log de volledige fout server-side; stuur alleen een generiek bericht naar de client.
**Referentie:** CWE-209 (Information Exposure Through Error Messages)

### L-2: Statische bestanden zonder path-normalisatie

**Locatie:** `src/server.ts:112-117`
**Beschrijving:** De controle op `..` is primitief: `fileName.includes('..')`. Dit blokkeert `../` maar beschermt niet tegen alle path-traversal-varianten op Windows.
**Oplossing:** Gebruik `path.resolve()` en verifieer dat het resulterende pad begint met `PUBLIC_DIR`.
**Referentie:** CWE-22 (Path Traversal)

### L-3: Geen rate limiting op API-endpoints

**Locatie:** Alle routes
**Beschrijving:** De API-endpoints hebben geen rate limiting.
**Oplossing:** Voeg een simpele in-memory rate limiter toe (bijv. max 100 req/s).
**Referentie:** CWE-770 (Allocation of Resources Without Limits)

### L-4: Verouderde afhankelijkheden

**Locatie:** `package.json`
**Beschrijving:** Meerdere afhankelijkheden zijn verouderd (maar geen bekende kwetsbaarheden per `npm audit`):
- `@types/node`: 22.13.10 -> 25.3.5
- `typescript`: 5.7.3 -> 5.9.3
- `zod`: 3.24.2 -> 4.3.6 (major version!)
- `ws`: 8.18.0 -> 8.19.0
**Oplossing:** Plan periodieke updates. Let op bij Zod 4 (breaking changes).
**Referentie:** CWE-1104 (Use of Unmaintained Third-Party Components)

---

## Defense in Depth Score per Laag

| Laag | Score | Toelichting |
|------|-------|-------------|
| **Netwerkbinding** | 4/5 | Binding op 127.0.0.1 — goed. Geen TLS (niet nodig voor localhost). Punt aftrek voor ontbrekende origin-validatie op WebSocket. |
| **Authenticatie/Autorisatie** | 1/5 | Volledig afwezig. Elk proces op localhost heeft volledige toegang. CSRF-bescherming ontbreekt. |
| **Inputvalidatie** | 3/5 | Zod wordt goed gebruikt voor sessiecreatie en poort. Maar HAR-import en extractie-endpoints missen validatie volledig. |
| **Output-encoding** | 4/5 | Server-side `escapeHtml()` consistent. Client-side `escapeHtml()` in observer.js. Eén inline script mist escaping. |
| **Encryptie** | 5/5 | AES-256-GCM met scrypt KDF, uniek salt per encryptie, auto-gegenereerde passphrase. Correcte implementatie. |
| **Security Headers** | 4/5 | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP aanwezig. Punt aftrek voor unsafe-inline in CSP. |
| **Database** | 4/5 | Parameterized queries overal. WAL-modus, foreign keys. Enige issue: LIKE zonder wildcard-escaping. |
| **Foutafhandeling** | 3/5 | Fouten worden opgevangen maar soms te gedetailleerd teruggestuurd. Body-sizelimit van 1MB aanwezig. |
| **Afhankelijkheden** | 4/5 | Minimale dependency tree. 0 bekende kwetsbaarheden. Exacte versie-pinning. Enkele verouderde pakketten. |
| **Container/Deployment** | 1/5 | Geen Dockerfile, geen docker-compose, geen container-hardening aanwezig. |

**Gewogen totaal: 3.3 / 5**

---

## Geprioriteerde Aanbevelingen

| # | Prioriteit | Actie | Bevinding |
|---|-----------|-------|-----------|
| 1 | **HOOG** | Gebruik `harImportSchema.parse()` op het HAR-import endpoint en beperk paden tot een vaste directory | H-1 |
| 2 | **HOOG** | Maak een Zod-schema voor het extract-endpoint met URL-validatie en minimum delay | H-2 |
| 3 | **HOOG** | Voeg CSRF-bescherming toe (token of origin-check) op alle state-muterende endpoints | M-3 |
| 4 | **HOOG** | Voeg `verifyClient` toe aan WebSocketServer met origin-controle | M-4 |
| 5 | **GEMIDDELD** | Escape `r.endpoint` in het extractie inline script met `escapeHtml()` | M-2 |
| 6 | **GEMIDDELD** | Verplaats inline scripts naar observer.js en verwijder 'unsafe-inline' uit CSP | M-1 |
| 7 | **GEMIDDELD** | Escape SQL-wildcards in `getCookieHeader` of gebruik exacte match | M-5 |
| 8 | **GEMIDDELD** | Gebruik een eerlijke User-Agent bij data-extractie | H-3 |
| 9 | **LAAG** | Stuur generieke foutmeldingen naar clients, log details server-side | L-1 |
| 10 | **LAAG** | Gebruik `path.resolve()` + startsWith-check voor statische bestanden | L-2 |
| 11 | **LAAG** | Update afhankelijkheden (let op Zod 4 breaking changes) | L-4 |
| 12 | **LAAG** | Voeg een Dockerfile en docker-compose toe conform portability-regels | - |

---

**Conclusie:** De API Observer toont voor een lokale tool een bovengemiddeld beveiligingsniveau. De encryptie is correct geimplementeerd, SQL-queries zijn geparameteriseerd, en HTML-output wordt consistent ge-escaped. De belangrijkste verbeterpunten zijn (1) het consistent toepassen van Zod-validatie op ALLE endpoints, (2) CSRF/origin-bescherming tegen cross-origin aanvallen op localhost, en (3) het elimineren van het path-traversal-risico bij HAR-import. Geen van de bevindingen is op dit moment actief exploiteerbaar door externe aanvallers dankzij de localhost-binding, maar deze bevindingen worden urgent bij eventuele netwerkexposure.
