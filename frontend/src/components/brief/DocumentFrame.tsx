'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** A4 at 96 dpi, which is the unit Chromium uses for print layout. */
const A4_WIDTH_PX = 793.7;
const A4_HEIGHT_PX = 1122.5;

/**
 * Fits the fixed-width brief into whatever space is available.
 *
 * Uses `transform: scale()` rather than CSS `zoom` deliberately: scale rasterises
 * the document at its true print size and then shrinks the result, so the preview
 * shows exactly the line breaks the PDF will have. `zoom` re-runs layout at the
 * smaller size and can break lines differently.
 *
 * Because transforms do not affect layout, the wrapper's height is set from the
 * measured content height so the page scrolls correctly.
 */
export function DocumentFrame({
  children,
  maxScale = 1,
  showPageGuides = true,
}: {
  children: ReactNode;
  maxScale?: number;
  showPageGuides?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(maxScale);
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const available = outer.clientWidth;
    if (available > 0) {
      setScale(Math.min(maxScale, available / A4_WIDTH_PX));
    }
    const height = inner.scrollHeight;
    if (height > 0) setContentHeight(height);
  }, [maxScale]);

  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);

    // Web fonts land after first paint and change the content height.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measure]);

  const pageCount = Math.max(1, Math.ceil(contentHeight / A4_HEIGHT_PX));

  return (
    <div ref={outerRef} className="w-full">
      <div
        className="doc-frame mx-auto"
        style={{ height: contentHeight * scale, width: A4_WIDTH_PX * scale }}
      >
        <div
          ref={innerRef}
          className="doc-scaler origin-top-left shadow-[0_18px_60px_-30px_rgba(11,6,22,0.45)]"
          style={{ transform: `scale(${scale})`, width: A4_WIDTH_PX }}
        >
          {children}

          {showPageGuides && pageCount > 1 ? (
            <div aria-hidden className="no-print pointer-events-none absolute inset-0">
              {Array.from({ length: pageCount - 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 border-t border-dashed border-ink-300/70"
                  style={{ top: (i + 1) * A4_HEIGHT_PX }}
                >
                  <span className="absolute right-1 top-1 rounded bg-ink-900/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    page {i + 2}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <p className="no-print mt-3 text-center text-xs text-ink-400">
        {pageCount} A4 {pageCount === 1 ? 'page' : 'pages'} · previewed at{' '}
        {Math.round(scale * 100)}%
      </p>
    </div>
  );
}
