import { renderLayout } from './layout.js';

/** Render the in-app help page */
export function renderHelpPage(port: number): string {
  const body = buildHelpBody();
  return renderLayout('Help', body, 'help', port);
}

function buildHelpBody(): string {
  return `
<div class="card mb-16">
  <div class="card-header">Welkom bij API Observer</div>
  <div class="card-body">
    <p>API Observer observeert, analyseert en documenteert het API-verkeer van elke willekeurige website.
       Open een browser, navigeer door de site, en de tool legt automatisch alle API-aanroepen vast.</p>
  </div>
</div>

<h3 class="mb-8">Snel aan de slag</h3>

<div class="card mb-16">
  <div class="card-body">
    <ol class="help-steps">
      <li>
        <strong>Observeren</strong> &mdash; Ga naar <a href="/observe">Observeren</a>, vul een naam en doel-URL in,
        en klik op <em>Sessie starten</em>. Er opent een browser &mdash; navigeer hierin door de website.
        Alle API-calls worden automatisch vastgelegd.
      </li>
      <li>
        <strong>Of: HAR importeren</strong> &mdash; Op de <a href="/">Sessies</a>-pagina kun je een bestaand
        HAR-bestand importeren (bijv. uit Chrome DevTools).
      </li>
      <li>
        <strong>Analyseren</strong> &mdash; Ga naar <a href="/analysis">Analyse</a> en selecteer een sessie.
        De tool herkent automatisch endpoints, CRUD-patronen, paginatie en authenticatie.
      </li>
      <li>
        <strong>OpenAPI genereren</strong> &mdash; Ga naar <a href="/openapi">OpenAPI</a> en selecteer een sessie.
        Download de specificatie als JSON of YAML.
      </li>
      <li>
        <strong>Data extraheren</strong> &mdash; Ga naar <a href="/extract">Extractie</a> om verantwoord
        data op te halen via ontdekte GET-endpoints (met rate limiting).
      </li>
    </ol>
  </div>
</div>

<h3 class="mb-8">Pagina-overzicht</h3>

<div class="card mb-16">
  <table>
    <thead><tr><th>Pagina</th><th>Functie</th></tr></thead>
    <tbody>
      <tr><td><a href="/">Sessies</a></td><td>Overzicht van alle sessies. Start een nieuwe live sessie of importeer een HAR-bestand.</td></tr>
      <tr><td><a href="/observe">Observeren</a></td><td>Live observatie met browser screencast en request log. Hier start en stop je sessies.</td></tr>
      <tr><td><a href="/analysis">Analyse</a></td><td>Automatische patroonherkenning: endpoints, CRUD, paginatie, authenticatie, GraphQL.</td></tr>
      <tr><td><a href="/openapi">OpenAPI</a></td><td>Genereer en download een OpenAPI 3.0 specificatie uit geobserveerd verkeer.</td></tr>
      <tr><td><a href="/extract">Extractie</a></td><td>Haal data op via ontdekte endpoints met configureerbare rate limiting.</td></tr>
    </tbody>
  </table>
</div>

<h3 class="mb-8">Veelgestelde vragen</h3>

<div class="card mb-16">
  <div class="card-body">
    <details class="help-faq">
      <summary><strong>Wat is het API-filter?</strong></summary>
      <p>Het filter bepaalt welke requests worden vastgelegd. Standaard is dit <code>/api/</code>, waardoor alleen
         URL's met <code>/api/</code> in het pad worden opgeslagen. Pas dit aan als de API een ander pad gebruikt
         (bijv. <code>/v1/</code>, <code>/graphql</code>, of laat het leeg voor alles).</p>
    </details>
    <details class="help-faq">
      <summary><strong>Kan ik inloggen met MFA (tweefactorauthenticatie)?</strong></summary>
      <p>Ja. De observatiebrowser is een echt browservenster. Je kunt normaal inloggen, MFA-codes invoeren
         en door de site navigeren. Cookies worden na het stoppen versleuteld opgeslagen.</p>
    </details>
    <details class="help-faq">
      <summary><strong>Worden mijn wachtwoorden opgeslagen?</strong></summary>
      <p>Nee. Wachtwoorden die je intypt worden niet vastgelegd. Wel worden session cookies versleuteld
         opgeslagen (AES-256-GCM) zodat ze herbruikt kunnen worden bij data-extractie.</p>
    </details>
    <details class="help-faq">
      <summary><strong>Hoe maak ik een HAR-bestand aan?</strong></summary>
      <p>Open Chrome DevTools (F12) &gt; Network tab &gt; navigeer door de site &gt; rechtermuisklik
         in de requestlijst &gt; <em>Save all as HAR with content</em>.</p>
    </details>
    <details class="help-faq">
      <summary><strong>Ik zie geen requests na het starten</strong></summary>
      <p>Controleer het API-filter. Als de website <code>/v2/</code> of <code>/graphql</code> gebruikt
         in plaats van <code>/api/</code>, pas het filter aan. Je kunt ook <code>/</code> gebruiken
         om alles vast te leggen.</p>
    </details>
    <details class="help-faq">
      <summary><strong>Is data extractie veilig?</strong></summary>
      <p>De tool gebruikt rate limiting (standaard 3 seconden tussen requests), respecteert robots.txt,
         en stopt automatisch bij meer dan 20% fouten. Gebruik het alleen op systemen waar je toestemming
         voor hebt.</p>
    </details>
    <details class="help-faq">
      <summary><strong>Kan iemand anders bij mijn data?</strong></summary>
      <p>Nee. De server draait alleen op <code>127.0.0.1</code> (localhost) en is niet bereikbaar via
         het netwerk. Cookies worden versleuteld opgeslagen.</p>
    </details>
  </div>
</div>

<h3 class="mb-8">Problemen oplossen</h3>

<div class="card mb-16">
  <table>
    <thead><tr><th>Probleem</th><th>Oplossing</th></tr></thead>
    <tbody>
      <tr><td>Pagina is ongestyled</td><td>Herstart de server: stop met Ctrl+C en start opnieuw met <code>npm run dev</code></td></tr>
      <tr><td>"A browser session is already active"</td><td>Er draait al een sessie. Klik op <strong>Stoppen</strong> of herstart de server.</td></tr>
      <tr><td>Browser opent niet</td><td>Voer uit: <code>npx playwright install chromium</code></td></tr>
      <tr><td>HAR import mislukt</td><td>Controleer het volledige pad en zorg dat het een geldig HAR 1.2-bestand is.</td></tr>
      <tr><td>WebSocket "Niet verbonden"</td><td>Ververs de pagina met F5.</td></tr>
    </tbody>
  </table>
</div>

<div class="card">
  <div class="card-body text-dim" style="text-align:center">
    API Observer v1.0 &mdash; Licentie: EUPL-1.2
  </div>
</div>`;
}
