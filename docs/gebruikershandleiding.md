# Gebruikershandleiding — API Observer

**Versie**: 1.0
**Datum**: 2026-03-08

---

## 1. Introductie

### Wat is API Observer?

API Observer is een tool waarmee je het API-verkeer van elke willekeurige website kunt observeren, analyseren en documenteren. De tool opent een browser, onderschept alle API-aanroepen terwijl je door de website navigeert, en genereert automatisch een OpenAPI-specificatie.

### Voor wie is het bedoeld?

- **Ontwikkelaars** die een bestaande API willen reverse-engineeren
- **Testers** die API-verkeer willen vastleggen en analyseren
- **Architecten** die een API-landschap willen documenteren
- **Analisten** die data willen extraheren uit ontdekte API-endpoints

### Belangrijkste functies

| Functie | Beschrijving |
|---------|-------------|
| Live observatie | Browse een website terwijl API-verkeer automatisch wordt vastgelegd |
| HAR import | Importeer eerder opgeslagen verkeer (HAR-bestanden) |
| Patroonanalyse | Automatische herkenning van REST/GraphQL endpoints, CRUD-patronen en authenticatie |
| OpenAPI generatie | Download een volledige OpenAPI 3.0 specificatie (JSON of YAML) |
| Data extractie | Haal verantwoord data op via ontdekte GET-endpoints |
| Browser screencast | Bekijk een live mirror van de observatie-browser in de web UI |

---

## 2. Aan de slag

### Toegang

Open een browser en ga naar: **http://127.0.0.1:3300**

De tool draait lokaal op je computer. Er is geen inlogscherm of registratie nodig.

### Overzicht van de interface

De interface is opgebouwd in VS Code-stijl met drie hoofdonderdelen:

```
+--+----------+------------------------------------------+
|  | Zijbalk  |            Hoofdvenster                   |
|A |          |                                          |
|c | Sessies  |   Hier verschijnt de inhoud van de       |
|t | Observe  |   geselecteerde pagina                   |
|. | Analyse  |                                          |
|B | OpenAPI  |                                          |
|a | Extract  |                                          |
|r |          |                                          |
+--+----------+------------------------------------------+
```

- **Activity bar** (links, smal) — Pictogrammen voor snelle navigatie. Klik op het actieve pictogram om de zijbalk in/uit te klappen.
- **Zijbalk** — Navigatiemenu met de vijf hoofdpagina's.
- **Hoofdvenster** — De inhoud van de geselecteerde pagina.

### Eerste stappen

1. Open http://127.0.0.1:3300
2. Je ziet de **Sessies**-pagina met twee opties:
   - **Nieuwe live sessie** — voor het observeren van een website
   - **HAR bestand importeren** — voor het analyseren van eerder vastgelegd verkeer
3. Start een sessie of importeer een HAR-bestand
4. Na het vastleggen: analyseer patronen en genereer een OpenAPI-spec

---

## 3. Functies en handleidingen

### 3.1 Live observatie starten

Met een live observatie opent de tool een echte browser (Chromium) die naar de opgegeven website navigeert. Alle API-aanroepen worden automatisch vastgelegd.

**Stappen:**

1. Ga naar de pagina **Observeren** (via de zijbalk of het oog-pictogram)
2. Vul het formulier in:
   - **Naam** — Een herkenbare naam voor deze sessie (bijv. "Login flow testen")
   - **Doel-URL** — De URL van de website die je wilt observeren (bijv. `https://example.com`)
   - **API filter** — Alleen URL's die dit patroon bevatten worden vastgelegd (standaard: `/api/`)
3. Klik op **Sessie starten**
4. Er opent een apart browservenster — navigeer hierin door de website
5. In de web UI zie je:
   - **Links**: Een live mirror (screencast) van de browser
   - **Rechts**: Een lijst met vastgelegde API-requests
6. Klik op een request in de lijst om details te bekijken (headers, body, response)
7. Klik op **Stoppen** als je klaar bent

**Tips:**
- Het browservenster is een echte browser — je kunt inloggen, MFA uitvoeren en normaal navigeren
- Het API filter `/api/` vangt de meeste REST API's. Pas dit aan als de API een ander pad gebruikt (bijv. `/v1/`, `/graphql`)
- De verbindingsindicator (groen/rood bolletje) toont of de WebSocket-verbinding actief is

**Veelgemaakte fouten:**
- "A browser session is already active" — Er draait al een sessie. Stop deze eerst.
- Geen requests zichtbaar — Controleer of het API-filter overeenkomt met de API-paden van de website.

### 3.2 HAR bestand importeren

Als je al een HAR-bestand hebt (bijv. via de Chrome DevTools Network tab), kun je dit importeren zonder een live sessie te starten.

**Stappen:**

1. Ga naar de pagina **Sessies** (startpagina)
2. Vul bij "HAR bestand importeren" in:
   - **Bestandspad** — Het volledige pad naar het HAR-bestand op je computer (bijv. `C:\Downloads\verkeer.har`)
   - **Naam** (optioneel) — Een naam voor de sessie. Als je dit leeg laat, wordt de naam uit het HAR-bestand overgenomen.
   - **API filter** — Welke requests importeren (standaard: `/api/`)
3. Klik op **Importeren**
4. Na succesvolle import verschijnt een melding met het aantal geimporteerde requests

**Een HAR-bestand exporteren uit Chrome DevTools:**

1. Open Chrome DevTools (F12)
2. Ga naar het tabblad **Network**
3. Navigeer door de website
4. Klik met de rechtermuisknop in de requestlijst > **Save all as HAR with content**
5. Sla het bestand op en gebruik het pad bij de import

### 3.3 Patroonanalyse

De analysetool herkent automatisch patronen in het vastgelegde API-verkeer.

**Stappen:**

1. Ga naar de pagina **Analyse**
2. Selecteer een sessie uit de lijst
3. De analyse toont:
   - **Samenvatting** — Totaal requests, unieke endpoints, paginatie- en authenticatiepatroon
   - **Endpoint patronen** — Overzicht van alle ontdekte endpoints met:
     - Geparametriseerd pad (bijv. `/api/users/{id}`)
     - HTTP-methoden (GET, POST, PUT, DELETE)
     - CRUD-classificatie (Create, Read, Update, Delete)
     - Aantal requests en gemiddelde responstijd
     - Foutenpercentage
     - Type (REST of GraphQL)

**Wat herkent de analyse automatisch?**

| Patroon | Voorbeeld | Wordt |
|---------|-----------|-------|
| Numerieke ID's | `/api/users/42` | `/api/users/{id}` |
| UUID's | `/api/docs/550e8400-e29b-...` | `/api/docs/{uuid}` |
| Datums | `/api/logs/2026-03-08` | `/api/logs/{date}` |
| Paginatie | `?page=1&size=20` | Offset/limit, page/size of cursor |
| Authenticatie | `Authorization: Bearer ...` | Bearer token, API key of Cookie |
| GraphQL | POST met `query` in body | Operatienaam geextraheerd |

### 3.4 OpenAPI specificatie genereren

Na analyse kun je een volledige OpenAPI 3.0.3 specificatie downloaden.

**Stappen:**

1. Ga naar de pagina **OpenAPI**
2. Selecteer een sessie
3. De specificatie wordt automatisch gegenereerd en getoond
4. Download via de knoppen:
   - **Download JSON** — Machine-leesbaar formaat
   - **Download YAML** — Leesbaar tekstformaat

**Tip:** Je kunt de OpenAPI-spec importeren in tools als Swagger UI, Postman of Insomnia om de API direct te verkennen.

**Tip:** Vanuit de analysepagina kun je ook direct doorklikken naar "OpenAPI genereren".

### 3.5 Data extractie

Met data extractie kun je verantwoord data ophalen via ontdekte GET-endpoints.

**Stappen:**

1. Ga naar de pagina **Extractie**
2. Selecteer een sessie (je moet de sessie eerst analyseren)
3. Op de configuratiepagina:
   - **Selecteer endpoints** — Vink aan welke endpoints je wilt ophalen (alleen GET)
   - **Vertraging** — Wachttijd tussen requests in milliseconden (standaard: 3000ms)
   - **Jitter** — Willekeurige variatie op de vertraging (standaard: 30%)
   - **Max foutenpercentage** — Bij meer fouten stopt de extractie automatisch (standaard: 20%)
4. Klik op **Extractie starten**
5. De voortgang verschijnt in de resultatenlijst
6. Klik op **Stoppen** om de extractie voortijdig te beeindigen

**Veiligheidswaarborgen:**
- Alleen GET-requests (geen data wijzigen)
- Sequentieel: 1 request tegelijk
- Rate limiting met jitter (lijkt op menselijk gedrag)
- Controle van robots.txt voor het eerste request
- Automatische pauze bij te veel fouten

---

## 4. Veelgestelde vragen (FAQ)

**Kan ik meerdere sessies tegelijk draaien?**
Nee, er kan slechts een live browser-sessie tegelijk actief zijn. Eerdere sessies blijven beschikbaar in het overzicht.

**Worden mijn wachtwoorden opgeslagen?**
Nee. Wachtwoorden die je intypt in de browser worden niet vastgelegd. Wel worden session cookies versleuteld opgeslagen (AES-256-GCM) zodat ze herbruikt kunnen worden bij data-extractie.

**Wat is het verschil tussen live observatie en HAR import?**
Bij live observatie opent de tool een browser waarin je navigeert — requests worden in real-time vastgelegd. Bij HAR import analyseer je een eerder opgeslagen bestand.

**Hoe nauwkeurig is de OpenAPI-spec?**
De spec is gebaseerd op geobserveerd verkeer. Hoe meer requests je vastlegt, hoe vollediger de spec. Endpoints die je niet bezoekt worden niet ontdekt.

**Is data extractie veilig?**
De tool respecteert robots.txt, gebruikt rate limiting en stopt bij te veel fouten. Gebruik het alleen op systemen waar je toestemming voor hebt.

**Waarom zie ik geen requests na het starten?**
Controleer het API-filter. Standaard is dit `/api/` — als de website een ander pad gebruikt (bijv. `/v2/` of `/graphql`), pas het filter aan.

**Kan ik de tool op afstand gebruiken?**
Nee, de server bindt bewust alleen op `127.0.0.1` (localhost) voor veiligheid. Alleen de computer waarop de tool draait heeft toegang.

---

## 5. Problemen oplossen

| Probleem | Mogelijke oorzaak | Oplossing |
|----------|-------------------|-----------|
| Pagina is ongestyled (witte achtergrond, grote iconen) | Verouderd serverproces | Stop de server (Ctrl+C) en start opnieuw: `npm run dev` |
| "A browser session is already active" | Er draait al een sessie | Klik op **Stoppen** of herstart de server |
| Geen requests in het log | API-filter komt niet overeen | Pas het filter aan (bijv. verwijder het filter of gebruik `/`) |
| Browser opent niet | Playwright niet geinstalleerd | Voer uit: `npx playwright install chromium` |
| HAR import mislukt | Ongeldig pad of bestandsformaat | Controleer het volledige pad en zorg dat het een geldig HAR 1.2-bestand is |
| WebSocket "Niet verbonden" | Server is herstart | Ververs de pagina (F5) |
| Port 3300 in gebruik | Ander proces op dezelfde poort | Stop het andere proces of stel een andere poort in: `PORT=3301 npm run dev` |
