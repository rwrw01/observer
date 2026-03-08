import type { Page } from 'playwright';

import type { WsMessage } from './types.js';

interface ScreencastSession {
  page: Page;
  active: boolean;
}

let currentSession: ScreencastSession | null = null;

/** Start CDP screencast and relay JPEG frames via WebSocket broadcast */
export async function startScreencast(
  page: Page,
  broadcast: (msg: WsMessage) => void,
): Promise<void> {
  if (currentSession?.active) {
    await stopScreencast();
  }

  const cdp = await page.context().newCDPSession(page);
  currentSession = { page, active: true };

  cdp.on('Page.screencastFrame', async (params) => {
    if (!currentSession?.active) return;

    broadcast({
      type: 'screencast-frame',
      data: {
        data: params.data,
        metadata: params.metadata,
      },
    });

    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });
    } catch {
      // Page may have closed
    }
  });

  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 50,
    maxWidth: 1280,
    maxHeight: 720,
    everyNthFrame: 3,
  });
}

/** Stop the active screencast */
export async function stopScreencast(): Promise<void> {
  if (currentSession) {
    currentSession.active = false;
    currentSession = null;
  }
}

/** Check if screencast is active */
export function hasScreencast(): boolean {
  return currentSession?.active === true;
}
