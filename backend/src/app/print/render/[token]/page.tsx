import { notFound } from 'next/navigation';

import { BriefDocument } from '@/components/brief/BriefDocument';
import { isSignedIn } from '@/lib/auth';
import { takePendingBrief } from '@/lib/export/pending-store';

export const dynamic = 'force-dynamic';

/**
 * Bare render target for the PDF pipeline.
 *
 * No app chrome, no preview frame, no client JavaScript — just the document at
 * its natural A4 width. Chromium loads this, waits for `data-print-ready`, and
 * prints it. The bundle comes from the transient pending-store (see
 * `lib/export/pending-store.ts`), not a database — the token is single-use and
 * is gone the instant this page reads it.
 */
export default async function PrintRenderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!(await isSignedIn())) notFound();

  const { token } = await params;

  const pending = takePendingBrief(token);
  if (!pending) notFound();

  return (
    <>
      <BriefDocument bundle={pending.bundle} orgName={pending.orgName} />
      {/*
        Readiness signal for the PDF renderer, plus a stylesheet assertion.

        If the stylesheet fails to load — a misconfigured static-asset path is the
        realistic way that happens — the document still renders as unstyled HTML
        and would silently produce a useless PDF. `.doc-page` has a known width of
        210mm (793.7px at 96dpi), so measuring it proves the CSS applied. On
        failure we publish `data-print-error` and the renderer refuses to print.

        Inline and dependency-free: this page ships no other JavaScript.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function () {
  function fail(reason) {
    var el = document.documentElement;
    el.dataset.printError = reason;
    el.dataset.printReady = 'error';
  }
  function ready() {
    var page = document.querySelector('.doc-page');
    if (!page) return fail('no-document');
    var width = page.getBoundingClientRect().width;
    // 210mm is 793.7px; allow a couple of px for sub-pixel rounding.
    if (Math.abs(width - 793.7) > 4) return fail('stylesheet:' + Math.round(width));
    document.documentElement.dataset.printReady = 'true';
  }
  function whenPainted() {
    requestAnimationFrame(function () { requestAnimationFrame(ready); });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(whenPainted, whenPainted);
  } else {
    whenPainted();
  }
})();`,
        }}
      />
    </>
  );
}
