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
  /** Id of the first scroll step in this editorial group — pass to the diagram so keyframe viz does not remount mid-group. */
  diagramStepId: string;
  /** When set (KF3 list), substring matches in SVG output tokens get a highlight; cleared on the next scroll step. */
  listHighlightSubstring?: string;
}

/** Plain string = paragraph inner HTML; object = optional `listHighlightSubstring` for the viz list view. */
export type ScrollyParagraphSpec = string | { html: string; listHighlightSubstring?: string };

function paragraphHtml(p: ScrollyParagraphSpec): string {
  return typeof p === 'string' ? p : p.html;
}

function paragraphListHighlight(p: ScrollyParagraphSpec): string | undefined {
  return typeof p === 'string' ? undefined : p.listHighlightSubstring;
}

/**
 * One narrative group: shared keyframe; each entry is one paragraph (`<p>`) that scrolls in as its own sticky step.
 * Only the first paragraph of a group “anchors” keyframe transitions for the viz (`diagramStepId`).
 */
export interface ScrollyStepBeat {
  keyframe: number;
  paragraphs: ScrollyParagraphSpec[];
}

const SCROLLY_STEP_ID_PREFIX = 'step-scrolly';

/**
 * Keyframes: 2 = prompt / loading / single streaming output, 3 = many output lines, 4 = graph.
 */
const SCROLLY_STEP_BEATS: ScrollyStepBeat[] = [
  {
    keyframe: 2,
    paragraphs: [
      'For example, we typically interact with LLMs by giving them a prompt, and then getting a single response.',
    ],
  },
  {
    keyframe: 3,
    paragraphs: [
      'In reality, though, this output is just one sample from the underlying distribution: many are possible, and the ways they differ or are similar can be surprising.',
      {
        html: 'For example, in the generations here (prompt from <a href="https://arxiv.org/abs/2504.05228" rel="noopener noreferrer">NoveltyBench</a>), <strong>Elara</strong> appears more frequently than you might expect based on how open-ended the prompt is.',
        listHighlightSubstring: 'Elara',
      },
    ],
  },
  {
    keyframe: 4,
    paragraphs: [
      'This raises a new question: What is the best way to look at a bunch of outputs and show these types of repetitions?',
      'Since the LLM generates token-by-token, a tree might seem natural. However, the outputs often reconverge on a common word or phrase.',
    ],
  },
  {
    keyframe: 4,
    paragraphs: [
      'Can we instead visualize this as a graph? We lose the ability to read each completion line by line, but gain a single picture of where samples agree, branch apart, and meet again.',
      'Each completion is a <em>path</em> through <em>nodes</em> (words or short chunks). When generations share a stretch of text, their paths run along the same edges, showing shared structure. Node size and weight reflect how often a piece of wording appears across samples. We call this visualization GROVE (a Graph Representation of Output Variability and Examples)'
    ],
  },
];

const STEPS: ScrollyStep[] = [];
SCROLLY_STEP_BEATS.forEach((beat) => {
  let diagramStepId = '';
  beat.paragraphs.forEach((para, pIdx) => {
    const id = `${SCROLLY_STEP_ID_PREFIX}-${STEPS.length + 1}`;
    if (pIdx === 0) diagramStepId = id;
    const inner = paragraphHtml(para);
    const listHighlightSubstring = paragraphListHighlight(para);
    STEPS.push({
      id,
      keyframe: beat.keyframe,
      html: `<p>${inner}</p>`,
      diagramStepId,
      ...(listHighlightSubstring ? { listHighlightSubstring } : {}),
    });
  });
});

/** Scroll index of the first paragraph of the keyframe-3 group — line-by-line output reveal runs only here. */
export const SCROLLY_DISTRIBUTIONS_BEAT_INDEX = STEPS.findIndex((s) => s.keyframe === 3 && s.id === s.diagramStepId);

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

  const activeStep = STEPS[activeIndex] ?? STEPS[0];
  const { keyframe, diagramStepId: stepId, listHighlightSubstring } = activeStep;

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
                  listHighlightSubstring={listHighlightSubstring}
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
