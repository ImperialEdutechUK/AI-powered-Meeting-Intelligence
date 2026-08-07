import { serverEnv } from '@/lib/env';

/**
 * Caps how many Chromium instances `renderPdf` is allowed to run at once.
 *
 * Each render launches a real browser process (~350-450MB, see
 * `railway.toml`'s comment on `numReplicas`). Without a limit, several users
 * exporting PDFs within the same few seconds launch several browsers
 * concurrently, blow past the container's memory ceiling, and get OOM-killed
 * — taking down every other in-flight request on the instance, not just the
 * PDF ones. This makes concurrent renders queue instead.
 *
 * State is pinned to `globalThis`, the same trick `pending-store.ts` and
 * `db.ts` use, so it survives Next.js dev-mode module reloads and stays a
 * single counter even if this module ends up bundled more than once.
 */

interface Waiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const globalState = globalThis as typeof globalThis & {
  __pdfRenderActive?: number;
  __pdfRenderQueue?: Waiter[];
};

if (globalState.__pdfRenderActive === undefined) globalState.__pdfRenderActive = 0;
if (globalState.__pdfRenderQueue === undefined) globalState.__pdfRenderQueue = [];

const MAX_QUEUE_WAIT_MS = 60_000;

export class PdfBusyError extends Error {
  constructor() {
    super('Too many PDF exports are in progress. Please try again shortly.');
    this.name = 'PdfBusyError';
  }
}

/** Runs `fn` once a render slot is free, waiting up to a bound before giving up. */
export async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  const limit = Math.max(1, serverEnv().PDF_MAX_CONCURRENT_RENDERS);
  await acquire(limit);
  try {
    return await fn();
  } finally {
    release();
  }
}

function acquire(limit: number): Promise<void> {
  const active = globalState.__pdfRenderActive ?? 0;
  if (active < limit) {
    globalState.__pdfRenderActive = active + 1;
    return Promise.resolve();
  }

  const queue = globalState.__pdfRenderQueue!;
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      resolve: () => {
        globalState.__pdfRenderActive = (globalState.__pdfRenderActive ?? 0) + 1;
        resolve();
      },
      timer: setTimeout(() => {
        const idx = queue.indexOf(waiter);
        if (idx !== -1) queue.splice(idx, 1);
        reject(new PdfBusyError());
      }, MAX_QUEUE_WAIT_MS),
    };
    queue.push(waiter);
  });
}

function release(): void {
  globalState.__pdfRenderActive = Math.max(0, (globalState.__pdfRenderActive ?? 1) - 1);
  const queue = globalState.__pdfRenderQueue!;
  const next = queue.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  }
}
