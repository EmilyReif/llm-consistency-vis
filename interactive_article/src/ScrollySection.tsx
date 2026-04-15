import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollyDiagram } from './ScrollyDiagram';

/**
 * Scroll spy thresholds (viewport coordinates):
 * - First beat: sentinel crosses `SCROLL_TRIGGER_VIEWPORT_TOP_PX` from the top of the viewport.
 * - Later beats: sentinel crosses `(bottom of previous sticky article + SCROLL_TRIGGER_AFTER_PREV_PX)`.
 *   This matches stacked sticky copy: advancement is tied to the card above, not the screen edge.
 */
const SCROLL_TRIGGER_VIEWPORT_TOP_PX = 0;
/** Positive = switch later (sentinel must rise higher); negative = switch earlier. */
const SCROLL_TRIGGER_AFTER_PREV_PX = 0;

/** Vertical gap between stacked sticky beats (px). */
const STACK_GAP_PX = 4;

export interface ScrollyStep {
  id: string;
  keyframe: number;
  html: string;
}

/** Edit this list only — `id` is `step-scrolly-${index + 1}` for scroll sentinels / diagram keys. */
export interface ScrollyStepBeat {
  keyframe: number;
  html: string;
}

const SCROLLY_STEP_ID_PREFIX = 'step-scrolly';

/**
 * Keyframes: 2 = prompt / loading / single streaming output, 3 = many output lines (two beats: reveal + static copy), 4 = graph.
 */
const SCROLLY_STEP_BEATS: ScrollyStepBeat[] = [
  {
    keyframe: 2,
    html: `<p>We typically interact with LLMs by giving them a prompt, and then getting a single response.</p>`,
  },
  {
    keyframe: 3,
    html: `<p>However, LLMs produce <em>distributions</em>. Each output is just one sample from a given distribution: we usually just see one, but many are possible. How does this stochasticity manifest? Some sets of outputs are divergent, some are convergent.</p>`,
  },
  {
    keyframe: 4,
    html: `<p>This raises a new question: What&rsquo;s the best way to look at a bunch of outputs?</p><p>In reality, since the LLM generates token-by-token, this is a tree. However, the outputs often reconverge on a common phrase.</p>`,
  },
  {
    keyframe: 4,
    html: `<p>Can we instead visualize this as a graph? We lose the ability to read each completion line by line, but gain a single picture of how mass is spread across phrasing&mdash;where samples agree, branch apart, and meet again.</p><p>In the view below, each completion is a <em>path</em> through <em>nodes</em> (words or short chunks). When generations share a stretch of text, their paths run along the same edges, so overlap makes shared structure visible. Node size and weight reflect how often a piece of wording appears across samples, highlighting backbone phrases and hubs in the distribution.</p>`,
  },
];

const STEPS: ScrollyStep[] = SCROLLY_STEP_BEATS.map((beat, i) => ({
  ...beat,
  id: `${SCROLLY_STEP_ID_PREFIX}-${i + 1}`,
}));

/** First keyframe-3 beat only: line-by-line output reveal runs when this index is active. */
export const SCROLLY_DISTRIBUTIONS_BEAT_INDEX = SCROLLY_STEP_BEATS.findIndex((b) => b.keyframe === 3);

function getActiveScrollyBeat(articleRefs: React.MutableRefObject<(HTMLElement | null)[]>): number {
  let next = 0;
  for (let i = STEPS.length - 1; i >= 0; i--) {
    const el = document.getElementById(STEPS[i].id);
    if (!el) continue;
    let triggerY: number;
    if (i === 0) {
      triggerY = SCROLL_TRIGGER_VIEWPORT_TOP_PX;
    } else {
      const prevArticle = articleRefs.current[i - 1];
      triggerY =
        prevArticle ?
          prevArticle.getBoundingClientRect().bottom + SCROLL_TRIGGER_AFTER_PREV_PX
        : SCROLL_TRIGGER_VIEWPORT_TOP_PX;
    }
    if (el.getBoundingClientRect().top <= triggerY) {
      next = i;
      break;
    }
  }
  return next;
}

function isPageReload(): boolean {
  if (typeof performance === 'undefined') return false;
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (entry?.type === 'reload') return true;
  const legacy = (performance as unknown as { navigation?: { type: number } }).navigation;
  return legacy?.type === 1;
}

export function ScrollySection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [stickyTops, setStickyTops] = useState<number[]>(() => STEPS.map(() => 0));
  const sectionRef = useRef<HTMLElement | null>(null);
  const textColRef = useRef<HTMLDivElement | null>(null);
  const articleRefs = useRef<(HTMLElement | null)[]>([]);
  /** Last committed `activeIndex` (updated after paint) so the *current* render compares to the previous beat. */
  const prevBeatRef = useRef(0);
  /** When `activeIndex` is unchanged, reuse last direction so StrictMode / re-renders don’t flip to default. */
  const scrollDirRef = useRef<'forward' | 'backward'>('forward');

  let scrollDirection: 'forward' | 'backward';
  if (activeIndex !== prevBeatRef.current) {
    scrollDirection = activeIndex > prevBeatRef.current ? 'forward' : 'backward';
    scrollDirRef.current = scrollDirection;
  } else {
    scrollDirection = scrollDirRef.current;
  }

  useLayoutEffect(() => {
    prevBeatRef.current = activeIndex;
  }, [activeIndex]);

  /**
   * Full reload while scrolled into the block (e.g. graph beat) restores a heavy mid-sequence state.
   * Jump to the top of the scrolly so the narrative and viz stay aligned without a long catch-up.
   */
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !isPageReload()) return;
    const root = sectionRef.current;
    if (!root) return;
    const docTop = root.getBoundingClientRect().top + window.scrollY;
    const docBottom = docTop + root.offsetHeight;
    const scrollY = window.scrollY;
    const viewBottom = scrollY + window.innerHeight;
    const overlapsScrolly = viewBottom > docTop && scrollY < docBottom;
    if (overlapsScrolly && scrollY > docTop + 1) {
      window.scrollTo({ top: docTop, behavior: 'auto' });
    }
  }, []);

  const recomputeStickyTops = () => {
    const heights = STEPS.map((_, i) => {
      const el = articleRefs.current[i];
      return el ? el.offsetHeight : 0;
    });
    let acc = 0;
    const tops = heights.map((h) => {
      const t = acc;
      acc += h + STACK_GAP_PX;
      return t;
    });
    setStickyTops(tops);
  };

  useLayoutEffect(() => {
    recomputeStickyTops();
    const ro = new ResizeObserver(() => {
      recomputeStickyTops();
    });
    if (textColRef.current) {
      ro.observe(textColRef.current);
    }
    STEPS.forEach((_, i) => {
      const el = articleRefs.current[i];
      if (el) ro.observe(el);
    });
    window.addEventListener('resize', recomputeStickyTops);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputeStickyTops);
    };
  }, []);

  const applyScrollSpy = useCallback(() => {
    const next = getActiveScrollyBeat(articleRefs);
    setActiveIndex((prev) => (prev !== next ? next : prev));
  }, []);

  /** After sticky `top` offsets are applied, recomputing the beat fixes reload-at-mid-scroll and layout shifts. */
  useLayoutEffect(() => {
    applyScrollSpy();
  }, [stickyTops, applyScrollSpy]);

  useEffect(() => {
    let scheduled = false;

    const onScrollOrResize = () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          applyScrollSpy();
        });
      }
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    applyScrollSpy();

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [applyScrollSpy]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const step = STEPS[activeIndex] ?? STEPS[0];
    console.log('[scrolly scroll-spy] active beat → keyframe should start', {
      beatIndex: activeIndex,
      stepId: step.id,
      keyframe: step.keyframe,
    });
  }, [activeIndex]);

  const { keyframe, id: stepId } = STEPS[activeIndex] ?? STEPS[0];

  return (
    <section ref={sectionRef} className="scrolly-root" aria-label="Scrollytelling">
      <div className="scrolly-inner">
        <div className="scrolly-text-col" ref={textColRef}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div id={s.id} className="scrolly-beat-start" aria-hidden="true" />
              <article
                ref={(el) => {
                  articleRefs.current[i] = el;
                }}
                className="scrolly-step scrolly-step-stacked"
                style={{
                  top: stickyTops[i],
                  zIndex: 10 + i,
                }}
                dangerouslySetInnerHTML={{ __html: s.html }}
              />
              <div className="scrolly-beat-spacer" aria-hidden="true" />
            </React.Fragment>
          ))}
        </div>
        <div className="scrolly-viz-col">
          <div className="scrolly-viz-sticky">
            <div className="scrolly-viz-panel scrolly-viz-panel--sequence">
              <div className="scrolly-viz-main scrolly-viz-main--sequence">
                <ScrollyDiagram
                  activeIndex={activeIndex}
                  distributionsBeatIndex={SCROLLY_DISTRIBUTIONS_BEAT_INDEX}
                  keyframe={keyframe}
                  scrollDirection={scrollDirection}
                  stepId={stepId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
