import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollyDiagram } from './ScrollyDiagram';

/** Scroll spy: beat advances when this sentinel crosses the top of the viewport. */
const SCROLL_TRIGGER_TOP_PX = 0;

/** Vertical gap between stacked sticky beats (px). */
const STACK_GAP_PX = 4;

export interface ScrollyStep {
  id: string;
  keyframe: number;
  html: string;
}

/**
 * Story beats (edit freely). Keyframes line up with diagram states: 1 = prompt only, 2 = single stream /
 * token-by-token, 3 = many lines, 4 = wall → graph / untangle. Multiple beats can share a keyframe while the
 * narration catches up.
 */
const STEPS: ScrollyStep[] = [
  {
    id: 'step-1',
    keyframe: 1,
    html: `<p>We usually interact with LLMs by giving a prompt, getting a response, maybe following up with another prompt, getting another response, and so on.</p>`,
  },
  {
    id: 'step-2',
    keyframe: 2,
    html: `<p>The model can show that as a single completion—a straight line of text, built up token by token.</p>`,
  },
  {
    id: 'step-3',
    keyframe: 3,
    html: `<p>But LLMs produce <em>distributions</em>, not single answers. For a given input, what you see is just one <strong>sample</strong>—there could actually be many different outputs.</p>`,
  },
  {
    id: 'step-4',
    keyframe: 3,
    html: `<p>Sometimes that doesn&rsquo;t matter for the user&rsquo;s task, but sometimes it does. <em>[TODO: formative studies]</em></p>`,
  },
  {
    id: 'step-5',
    keyframe: 3,
    html: `<p>That raises a new question: what&rsquo;s the best way to look at a bunch of outputs? In reality, since the LLM generates token by token, the full structure is a <strong>tree</strong>.</p>`,
  },
  {
    id: 'step-6',
    keyframe: 4,
    html: `<p>But sometimes outputs <strong>reconverge</strong> on a common phrase—so we can visualize them as a <strong>graph</strong>. A wall of many completions can &ldquo;detangle&rdquo; into overlapping paths.</p><p>We sacrifice some legibility of each exact example to show the overall shape of the distribution: outputs as paths in a graph, <strong>nodes</strong> as words or phrases, <strong>paths</strong> as individual generations, <strong>thickness</strong> as frequency.</p>`,
  },
];

export function ScrollySection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [stickyTops, setStickyTops] = useState<number[]>(() => STEPS.map(() => 0));
  const textColRef = useRef<HTMLDivElement | null>(null);
  const articleRefs = useRef<(HTMLElement | null)[]>([]);

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

  useEffect(() => {
    let scheduled = false;

    const updateActive = () => {
      scheduled = false;
      const y = SCROLL_TRIGGER_TOP_PX;
      let next = 0;
      for (let i = STEPS.length - 1; i >= 0; i--) {
        const el = document.getElementById(STEPS[i].id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= y) {
          next = i;
          break;
        }
      }
      setActiveIndex((prev) => (prev !== next ? next : prev));
    };

    const onScrollOrResize = () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(updateActive);
      }
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    updateActive();

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  const { keyframe, id: stepId } = STEPS[activeIndex] ?? STEPS[0];

  return (
    <section className="scrolly-root" aria-label="Scrollytelling">
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
            <ScrollyDiagram keyframe={keyframe} stepId={stepId} />
          </div>
        </div>
      </div>
    </section>
  );
}
