import { notFound } from 'next/navigation';

import { BriefDocument } from '@/components/brief/BriefDocument';
import { isSignedIn } from '@/lib/auth';
import { serverEnv } from '@/lib/env';
import { BriefNotFoundError, getBrief } from '@/lib/repository';

export const dynamic = 'force-dynamic';

/**
 * Bare render target for the PDF pipeline.
 *
 * No app chrome, no preview frame, no client JavaScript — just the document at
 * its natural A4 width. Chromium loads this, waits for `data-print-ready`, and
 * prints it.
 */
export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isSignedIn())) notFound();

  const { id } = await params;

  let record;
  try {
    record = await getBrief(id);
  } catch (error) {
    if (error instanceof BriefNotFoundError) notFound();
    throw error;
  }

  return (
    <>
      <BriefDocument bundle={record.bundle} orgName={serverEnv().ORG_NAME} />
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
