# WCAG 2.2 AA Toegankelijkheidsaudit — API Observer

**Project:** API Observer (`c:\dev\observer`)
**URL:** http://127.0.0.1:3300
**Datum:** 8 maart 2026
**Standaard:** WCAG 2.2 niveau AA
**Tooling:** pa11y (WCAG2AA/HTML_CodeSniffer) + handmatige broncode-analyse
**Pagina's getest:** / (Sessies), /observe, /analysis, /openapi, /extract, /help

---

## Samenvatting

**Totaalscore: 2.5 / 5 (Basis aanwezig, significante verbeteringen nodig)**

De API Observer heeft een solide basis: correcte `lang="nl"`, viewport meta, semantische `<nav>` en `<main>`, formulierlabels met `for`-attributen, en XSS-escaping. Echter, er zijn structurele toegankelijkheidsproblemen die een AA-conformiteit verhinderen. Het meest kritiek zijn de onvoldoende kleurcontrasten (op alle 6 pagina's), het ontbreken van een skip-link, het ontbreken van focus-stijlen op belangrijke interactieve elementen, en het niet-toegankelijk zijn van dynamisch gegenereerde content voor schermlezers.

| Categorie | Bevindingen |
|-----------|-------------|
| Kritiek | 2 |
| Ernstig | 5 |
| Gemiddeld | 8 |
| Laag | 4 |

---

## Kritieke problemen

### K1. Onvoldoende kleurcontrast op alle pagina's (WCAG 1.4.3)

**Ernst:** Kritiek
**Locatie:** `src/ui/public/observer.css:19` (`--text-dim: #888888`), `src/ui/public/observer.css:105` (`.panel-header`), `src/ui/public/observer.css:175` (`.card-header`)
**Beschrijving:** Pa11y detecteert op alle 6 pagina's tientallen contrastfouten. De kleur `#888888` op achtergrond `#252526` levert een contrastratio van 4.32:1, terwijl AA minimaal 4.5:1 vereist. Dit treft:
- Alle `.card-header` elementen
- Alle `.panel-header` elementen
- Alle `label` elementen in formulieren
- Alle `.meta` teksten in sessiekaarten
- Alle `th` elementen in tabellen

Op de /help pagina is het erger: links binnen `.card` hebben kleur `#007acc` op `#252526`, wat een contrastratio van slechts 3.4:1 oplevert (vereist: 4.5:1).

**Impact:** Gebruikers met verminderd gezichtsvermogen kunnen labels, koppen en metadata niet lezen.
**Fix:** Verhoog `--text-dim` naar minimaal `#999999` (of beter `#a0a0a0`) en `--accent` naar `#3794d1` of lichter. Controleer alle kleurcombinaties met een contrast checker.
**Referentie:** WCAG 1.4.3 (Contrast Minimum), WCAG 1.4.6

### K2. Geen skip-link naar hoofdinhoud (WCAG 2.4.1)

**Ernst:** Kritiek
**Locatie:** `src/ui/layout.ts:43-68`
**Beschrijving:** Er is geen "Skip naar inhoud"-link aanwezig. De pagina begint met een activity bar (6 links) en een sidebar navigatie (nogmaals 6 links). Toetsenbordgebruikers moeten 12+ links doorlopen voordat zij de hoofdinhoud bereiken.
**Impact:** Toetsenbord- en schermlezersgebruikers worden ernstig gehinderd bij elke paginanavigatie.
**Fix:** Voeg als eerste element in `<body>` toe: `<a href="#main-content" class="skip-link">Ga naar inhoud</a>` en geef `<main>` een `id="main-content"`. Voeg CSS toe die de link visueel verbergt tot focus.
**Referentie:** WCAG 2.4.1 (Bypass Blocks)

---

## Ernstige problemen

### E1. Canvas screencast zonder tekstalternatief (WCAG 1.1.1)

**Ernst:** Ernstig
**Locatie:** `src/ui/pages-observe.ts:46`
**Beschrijving:** Het `<canvas id="screencastCanvas">` element heeft geen `aria-label`, `role`, of fallback-tekst. De screencast toont een live browsersessie die voor schermlezers volledig onzichtbaar is.
**Impact:** Blinde gebruikers weten niet dat er een live browserweergave wordt getoond en missen essentieel visueel feedback.
**Fix:** Voeg toe: `<canvas id="screencastCanvas" role="img" aria-label="Live browserweergave van de geobserveerde website">` met een `aria-live="polite"` regio die de status communiceert ("Browser gestart", "Screencast actief", etc.).
**Referentie:** WCAG 1.1.1 (Non-text Content)

### E2. Dynamische content niet aangekondigd aan schermlezers (WCAG 4.1.3)

**Ernst:** Ernstig
**Locatie:** `src/ui/public/observer.js:84-108` (appendRequest), `src/ui/public/observer.js:113-158` (showRequestDetail)
**Beschrijving:** Wanneer nieuwe API-requests binnenkomen via WebSocket worden deze dynamisch toegevoegd aan de DOM, maar er is geen `aria-live` regio gedefinieerd. Het request-log (`#requestLog`), de teller (`#requestCount`), en het detail-paneel (`#detailPanel`) missen `aria-live` attributen. Statuswijzigingen ("Sessie gestart", "Sessie gestopt") worden ook niet aangekondigd.
**Impact:** Schermlezersgebruikers ontvangen geen notificaties over nieuwe requests of sessiestatuswijzigingen.
**Fix:** Voeg `aria-live="polite"` toe aan `#requestCount`. Voeg een visueel verborgen `<div aria-live="assertive">` toe voor sessiestatusmeldingen. Overweeg `aria-live="polite"` op `#requestLog` (met `aria-relevant="additions"`).
**Referentie:** WCAG 4.1.3 (Status Messages)

### E3. Tabs in detail-paneel niet als ARIA tabs geimplementeerd (WCAG 4.1.2)

**Ernst:** Ernstig
**Locatie:** `src/ui/public/observer.js:134-155`
**Beschrijving:** De tabs (Response, Req Headers, Res Headers, Req Body) in het request-detail-paneel zijn `<button class="tab">` elementen zonder ARIA tab-semantiek: geen `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, of `aria-controls`. Toetsenbordnavigatie met pijltjestoetsen ontbreekt.
**Impact:** Schermlezersgebruikers herkennen de tabs niet als tabs en kunnen niet efficient navigeren.
**Fix:** Voeg `role="tablist"` toe aan `.tabs`, `role="tab"` + `aria-selected` + `aria-controls` aan elke tab-button, en `role="tabpanel"` + `id` + `aria-labelledby` aan elke tab-content div. Implementeer pijltjestoets-navigatie per WAI-ARIA Authoring Practices.
**Referentie:** WCAG 4.1.2 (Name, Role, Value)

### E4. Geen zichtbare focus-indicator op custom elementen (WCAG 2.4.7)

**Ernst:** Ernstig
**Locatie:** `src/ui/public/observer.css:230` (`outline: none` op inputs), `src/ui/public/observer.css:245-283` (buttons)
**Beschrijving:** Input-elementen hebben `outline: none` en krijgen alleen een `border-color` wijziging bij focus. Buttons (`.btn`) hebben geen enkele focus-stijl gedefinieerd. De `.request-row` elementen zijn klikbaar (`cursor: pointer`) maar niet focusbaar. De `.session-card` links en `.btn-delete` knoppen missen ook expliciete focus-stijlen.
**Impact:** Toetsenbordgebruikers kunnen niet zien welk element momenteel focus heeft.
**Fix:** Verwijder `outline: none` of vervang door een duidelijke custom focus-ring: `outline: 2px solid var(--accent); outline-offset: 2px;`. Voeg focus-stijlen toe voor `.btn`, `.tab`, `.session-card`, `.btn-delete`. Maak `.request-row` focusbaar met `tabindex="0"`.
**Referentie:** WCAG 2.4.7 (Focus Visible)

### E5. Request-rijen niet toetsenbord-bereikbaar (WCAG 2.1.1)

**Ernst:** Ernstig
**Locatie:** `src/ui/public/observer.js:105`
**Beschrijving:** Request-rijen in het log hebben een click-handler (`row.addEventListener('click', ...)`) maar zijn `<div>` elementen zonder `tabindex` of `role="button"`. Ze zijn onbereikbaar met het toetsenbord en niet aangekondigd door schermlezers als interactief.
**Impact:** Toetsenbordgebruikers kunnen individuele requests niet openen/inspecteren.
**Fix:** Voeg `tabindex="0"` en `role="button"` toe aan elke request-row. Voeg een `keydown`-handler toe voor Enter/Space. Of gebruik `<button>` elementen.
**Referentie:** WCAG 2.1.1 (Keyboard)

---

## Gemiddelde problemen

### G1. Tabelkoppen missen scope-attributen (WCAG 1.3.1)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/pages-sessions.ts:171`, `src/ui/pages-analysis.ts:111-112`, `src/ui/pages-help.ts:53,113`
**Beschrijving:** De `<th>` elementen in de tabellen missen `scope="col"` attributen. Schermlezers kunnen de kolomkoppen niet correct associeren met de celwaarden.
**Fix:** Voeg `scope="col"` toe aan alle `<th>` elementen.
**Referentie:** WCAG 1.3.1 (Info and Relationships)

### G2. Formulier input name-attributen ontbreken (WCAG 1.3.1, 4.1.2)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/pages-sessions.ts:19-27`, `src/ui/pages-observe.ts:17-26`
**Beschrijving:** De formulierinputs `#sessionName`, `#targetUrl`, en `#apiFilter` hebben `id` en `for`-gekoppelde labels, maar missen `name`-attributen.
**Fix:** Voeg `name`-attributen toe die overeenkomen met de `id`-waarden.
**Referentie:** WCAG 4.1.2 (Name, Role, Value)

### G3. `role="main"` is redundant (WCAG 4.1.1)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/layout.ts:61`
**Beschrijving:** Het `<main>` element heeft `role="main"`, maar dit is redundant. Het `<main>` element heeft impliciet de `main` landmark role.
**Fix:** Verwijder `role="main"` van het `<main>` element.
**Referentie:** WCAG 4.1.1 (Parsing)

### G4. Geen foutafhandeling in formulieren voor assistive technology (WCAG 3.3.1)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/public/observer.js:229`, `src/ui/public/observer.js:281`
**Beschrijving:** Formulierfouten worden getoond via `alert()`. Er is geen inline foutmelding naast het betreffende veld, en er is geen `aria-invalid` of `aria-describedby` koppeling.
**Fix:** Toon foutmeldingen inline onder het betreffende veld met `role="alert"` of `aria-live="polite"`. Zet `aria-invalid="true"` op foutieve velden.
**Referentie:** WCAG 3.3.1 (Error Identification)

### G5. SVG-iconen in navigatie niet robuust verborgen (WCAG 1.1.1)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/layout.ts:8-15`, `src/ui/layout.ts:39-41`
**Beschrijving:** De SVG-iconen missen `aria-hidden="true"`, waardoor schermlezers de SVG-inhoud proberen voor te lezen.
**Fix:** Voeg `aria-hidden="true"` en `focusable="false"` toe aan alle decoratieve SVG-elementen.
**Referentie:** WCAG 1.1.1 (Non-text Content)

### G6. Verborgen detail-paneel mist ARIA-relatie (WCAG 4.1.2)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/pages-observe.ts:61`, `src/ui/pages-extract.ts:102`
**Beschrijving:** De verborgen panelen gebruiken inline `style="display:none"` maar missen `aria-expanded` en `aria-controls` attributen op de trigger-elementen.
**Fix:** Gebruik `aria-expanded` op de trigger en `aria-controls` die verwijst naar het paneel-ID.
**Referentie:** WCAG 4.1.2 (Name, Role, Value)

### G7. Bevestigingsdialoog voor verwijderen zonder undo (WCAG 3.3.4)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/public/observer.js:300`
**Beschrijving:** Het verwijderen van sessies gebruikt `confirm()` maar de actie is onomkeerbaar.
**Fix:** Overweeg een custom modal met duidelijke focus-trap, of implementeer een "ongedaan maken"-functie.
**Referentie:** WCAG 3.3.4 (Error Prevention)

### G8. Extractie-script gebruikt innerHTML zonder escaping (WCAG 4.1.1)

**Ernst:** Gemiddeld
**Locatie:** `src/ui/pages-extract.ts:152-156`
**Beschrijving:** In het extractie inline-script wordt `innerHTML` gebruikt om resultaatrijen te bouwen, maar de data worden niet ge-escaped.
**Fix:** Gebruik `textContent` voor data-waarden of voeg een `escapeHtml()` functie toe.
**Referentie:** WCAG 4.1.1 (Parsing)

---

## Lage problemen

### L1. Paginatitels zijn voldoende uniek

**Ernst:** Laag
**Beschrijving:** Titels volgen het patroon `"{Pagina} - API Observer"`. Subpagina's als `/analysis/{id}` krijgen correcte titels.
**Impact:** Geen problemen gevonden.

### L2. Autocomplete-attributen ontbreken (WCAG 1.3.5)

**Ernst:** Laag
**Locatie:** `src/ui/pages-sessions.ts:19`, `src/ui/pages-observe.ts:18`
**Beschrijving:** URL-invoervelden missen `autocomplete`-attributen.
**Fix:** Voeg `autocomplete="url"` toe aan URL-velden.
**Referentie:** WCAG 1.3.5 (Identify Input Purpose)

### L3. Mobiele overlay mist ARIA-attributen (WCAG 4.1.2)

**Ernst:** Laag
**Locatie:** `src/ui/layout.ts:70`
**Beschrijving:** De mobiele overlay mist `aria-hidden="true"`.
**Fix:** Voeg `aria-hidden="true"` toe en toggle dit met de zichtbaarheid.
**Referentie:** WCAG 4.1.2 (Name, Role, Value)

### L4. `<details>/<summary>` zonder ARIA-verrijking (WCAG 4.1.2)

**Ernst:** Laag
**Locatie:** `src/ui/pages-help.ts:68-105`
**Beschrijving:** Native `<details>/<summary>` elementen zijn inherent toegankelijk, maar sommige oudere schermlezers hebben moeite met de expanded/collapsed state.
**Fix:** Optioneel: voeg `aria-expanded` toe die synchroniseert met de `open` state.
**Referentie:** WCAG 4.1.2 (Name, Role, Value)

---

## Goede praktijken

1. **Taalattribuut correct**: `<html lang="nl">` is aanwezig en correct.
2. **Viewport meta correct**: `width=device-width, initial-scale=1` zonder beperkingen.
3. **Semantische landmarks**: `<nav>`, `<aside>`, `<main>` correct toegepast met aria-labels.
4. **Formulierlabels gekoppeld**: Alle `<label for="">` attributen correct.
5. **XSS-preventie**: Consistente `escapeHtml()` functie.
6. **Responsief ontwerp**: Media queries met grotere touch targets (min-height: 44px) op mobiel.
7. **Activity bar links**: Hebben `aria-label` en `title` attributen.
8. **Delete-knop**: Heeft `aria-label="Verwijder {sessienaam}"` met dynamische sessienaam.
9. **Native HTML-elementen**: Gebruikt `<button>`, `<a>`, `<form>`, `<table>`, `<details>`.

---

## Aanbevelingen — Prioriteitenlijst

| # | Ernst | Probleem | Geschatte inspanning | Bestanden |
|---|-------|----------|---------------------|-----------|
| 1 | Kritiek | Kleurcontrast verhogen | 1 uur | `observer.css` |
| 2 | Kritiek | Skip-link toevoegen | 30 min | `layout.ts`, `observer.css` |
| 3 | Ernstig | Focus-indicators toevoegen | 1 uur | `observer.css` |
| 4 | Ernstig | Request-rijen toetsenbord-bereikbaar | 1 uur | `observer.js` |
| 5 | Ernstig | ARIA live-regions voor dynamische content | 1 uur | `pages-observe.ts`, `observer.js` |
| 6 | Ernstig | ARIA tabs implementeren | 1.5 uur | `observer.js` |
| 7 | Ernstig | Canvas aria-label en fallback | 30 min | `pages-observe.ts` |
| 8 | Gemiddeld | scope="col" op tabelkoppen | 30 min | meerdere bestanden |
| 9 | Gemiddeld | aria-hidden op decoratieve SVG's | 30 min | `layout.ts` |
| 10 | Gemiddeld | Inline formulierfouten | 2 uur | `observer.js`, `pages-extract.ts` |
| 11 | Gemiddeld | Redundant role="main" verwijderen | 5 min | `layout.ts` |
| 12 | Gemiddeld | name-attributen op inputs | 15 min | meerdere bestanden |
| 13 | Gemiddeld | innerHTML escaping in extract-script | 30 min | `pages-extract.ts` |
| 14 | Gemiddeld | aria-expanded op verborgen panelen | 30 min | meerdere bestanden |
| 15 | Laag | autocomplete-attributen | 15 min | meerdere bestanden |
| 16 | Laag | aria-hidden op mobile overlay | 10 min | `layout.ts` |

**Totale geschatte inspanning:** circa 10-12 uur voor volledige AA-conformiteit.

**Aanbevolen aanpak:** Los eerst K1 (contrast) en K2 (skip-link) op, daarna E3-E5 (toetsenbord en focus). Dit dekt circa 80% van de impact voor circa 4 uur werk.

---

*Audit uitgevoerd op 8 maart 2026 met pa11y (HTML_CodeSniffer, WCAG2AA) en handmatige broncode-analyse van 8 bestanden (~1.700 regels).*
