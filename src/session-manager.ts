import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/** Active browser session state */
export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

let activeSession: BrowserSession | null = null;

/**
 * Launch a headful Chromium browser and navigate to the target URL.
 * Returns the browser session for interceptor/screencast attachment.
 */
export async function startBrowserSession(targetUrl: string): Promise<BrowserSession> {
  if (activeSession) {
    throw new Error('A browser session is already active');
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: false,
  });

  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  activeSession = { browser, context, page };
  return activeSession;
}

/** Stop the active browser session gracefully */
export async function stopBrowserSession(): Promise<void> {
  if (!activeSession) return;

  const session = activeSession;
  activeSession = null;

  try {
    await session.context.close();
    await session.browser.close();
  } catch {
    // Browser may already be closed by user
  }
}

/** Get the currently active browser session, or null */
export function getActiveBrowserSession(): BrowserSession | null {
  return activeSession;
}

/** Check if a browser session is active */
export function hasBrowserSession(): boolean {
  return activeSession !== null;
}
