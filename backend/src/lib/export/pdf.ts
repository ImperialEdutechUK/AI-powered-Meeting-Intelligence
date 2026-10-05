import { access, constants } from 'node:fs/promises';
import type { Browser } from 'puppeteer-core';
import { selfOrigin, serverEnv } from '@/lib/env';
import { withRenderSlot } from '@/lib/export/pdf-limiter';

/**
 * PDF rendering.
 *
 * Chromium loads the app's own `/print/<id>` route and prints it. Rendering
 * through a real browser rather than a separate PDF library is what guarantees
 * the export is byte-for-byte the layout the user previewed — there is only one
 * implementation of the document.
 *
 * The browser is launched per request and closed in a `finally`. Keeping a
 * long-lived instance would be faster but a crashed or wedged browser then
 * poisons every later export; a cold launch costs ~400ms, which is nothing next
 * to the model call that produced the brief.
 */

export class PdfError extends Error {
  readonly code: 'NO_CHROMIUM' | 'NAVIGATION' | 'RENDER' | 'TIMEOUT';
  readonly detail: string;
  constructor(code: PdfError['code'], message: string, detail = '') {
    super(message);
    this.name = 'PdfError';
    this.code = code;
    this.detail = detail;
  }
}

/** Flags required to run Chromium as root inside a container. */
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--font-render-hinting=none',
  '--hide-scrollbars',
  '--mute-audio',
];

async function resolveExecutable(): Promise<string> {
  const configured = serverEnv().CHROMIUM_PATH;
  const candidates = [
    configured,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/pw-browsers/chromium',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try the next candidate
    }
  }

  throw new PdfError(
    'NO_CHROMIUM',
    'PDF export is unavailable because no Chromium binary was found.',
    `Checked: ${candidates.filter(Boolean).join(', ')}. Set CHROMIUM_PATH to the executable.`,
  );
}

export interface RenderPdfOptions {
  /** Path on this server to print, e.g. `/print/<uuid>`. */
  path: string;
  /** Cookie header forwarded so the print route passes the auth gate. */
  cookie?: string;
  timeoutMs?: number;
}

/** Acquires a render slot (see `pdf-limiter.ts`) before launching Chromium. */
export function renderPdf(options: RenderPdfOptions): Promise<Buffer> {
  return withRenderSlot(() => renderPdfNow(options));
}

async function renderPdfNow(options: RenderPdfOptions): Promise<Buffer> {
  const { path, cookie, timeoutMs = 90_000 } = options;
  const executablePath = await resolveExecutable();
  const { default: puppeteer } = await import('puppeteer-core');

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath,
      args: CHROMIUM_ARGS,
      headless: true,
      // Generous for a cold Lambda instance still paging the browser in from
      // the image (see scripts/start.mjs), yet under CloudFront's 60s limit.
      timeout: 50_000,
      protocolTimeout: timeoutMs,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1_120, height: 1_600, deviceScaleFactor: 1 });
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    // The print route is self-contained; block anything third-party outright.
    await page.setJavaScriptEnabled(true);

    const extraHeaders: Record<string, string> = {};
    if (cookie) extraHeaders.cookie = cookie;
    // The loopback request must pass the same origin lock CloudFront's do
    // (see `src/proxy.ts`).
    const originSecret = process.env.ORIGIN_VERIFY_SECRET;
    if (originSecret) extraHeaders['x-origin-verify'] = originSecret;
    if (Object.keys(extraHeaders).length > 0) {
      await page.setExtraHTTPHeaders(extraHeaders);
    }

    const origin = selfOrigin().replace(/\/+$/, '');
    const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;

    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: timeoutMs });
    if (!response) {
      throw new PdfError('NAVIGATION', 'The renderer could not load the document.', url);
    }
    if (!response.ok()) {
      throw new PdfError(
        'NAVIGATION',
        `The renderer received HTTP ${response.status()} loading the document.`,
        url,
      );
    }

    // Wait for the bundled webfont before measuring line breaks.
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    /*
     * The print route sets `data-print-ready` once layout has committed, and it
     * verifies the stylesheet actually applied before doing so. Waiting for that
     * flag is what stops an asset-serving misconfiguration from producing a
     * plausible-looking but unstyled PDF.
     */
    let readyState: string | null = null;
    try {
      await page.waitForFunction(
        () => {
          const flag = document.documentElement.dataset.printReady;
          return flag === 'true' || flag === 'error';
        },
        { timeout: 20_000, polling: 100 },
      );
      readyState = await page.evaluate(
        () => document.documentElement.dataset.printReady ?? null,
      );
    } catch {
      // Timed out. Fall through: printing something is better than nothing, but
      // the stylesheet check below still guards the catastrophic case.
      readyState = null;
    }

    if (readyState === 'error') {
      const reason = await page.evaluate(
        () => document.documentElement.dataset.printError ?? 'unknown',
      );
      if (reason.startsWith('stylesheet')) {
        throw new PdfError(
          'RENDER',
          'The document stylesheet did not load, so the PDF would have come out unformatted. Nothing was produced.',
          `The renderer measured the page at ${reason.split(':')[1] ?? '?'}px instead of 794px. ` +
            'In a container build this means .next/static was not copied next to the standalone server.',
        );
      }
      throw new PdfError('RENDER', 'The document could not be prepared for printing.', reason);
    }

    await page.emulateMediaType('print');

    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      timeout: timeoutMs,
    });

    return Buffer.from(pdf);
  } catch (cause) {
    if (cause instanceof PdfError) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/timeout|timed out/i.test(message)) {
      throw new PdfError('TIMEOUT', 'PDF rendering timed out.', message);
    }
    throw new PdfError('RENDER', 'PDF rendering failed.', message);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/** Whether PDF export is possible in this environment. */
export async function pdfAvailable(): Promise<boolean> {
  try {
    await resolveExecutable();
    return true;
  } catch {
    return false;
  }
}
