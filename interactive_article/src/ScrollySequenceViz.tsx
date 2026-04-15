/**
 * Prompt → loading → single streaming output → many lines → word graph (reuses ScrollyWordGraphUntangle).
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ScrollyWordGraphUntangle from './ScrollyWordGraphUntangle';
import { SCROLLY_PROMPT, SCROLLY_GENERATIONS } from './scrollyData';

export type ScrollySequenceKeyframe = 2 | 3 | 4;

/**
 * Keyframe 2 only — wall-clock timeline from effect start (prompt already visible):
 *
 *   t = 0                          … prompt only
 *   t = LOADING_SHOW_MS            … “…” loading dots appear
 *   t = LOADING_SHOW_MS + LOADING_MS
 *                                  … dots hide, “Output” card appears (still empty)
 *   t = LOADING_SHOW_MS + LOADING_MS + OUTPUT_AFTER_LOADING_MS
 *                                  … first token streams in; then +TOKEN_MS per word
 */
/** Delay before the three loading dots appear (after prompt-only beat). */
const LOADING_SHOW_MS = 100;
/** How long the dots stay visible before the output card replaces them. */
const LOADING_MS = 100;
/** Pause after the card mounts so layout can settle before token streaming begins. */
const OUTPUT_AFTER_LOADING_MS = 200;
const TOKEN_MS = 95;
const ROW_REVEAL_MS = 220;
/** Generations shown as lines in the output card (before graph). */
const LIST_LINE_CAP = 10000;

interface Props {
  keyframe: ScrollySequenceKeyframe;
  stepId: string;
  /** Current scroll beat (must match `distributionsBeatIndex` to run the multi-output strip). */
  activeIndex: number;
  /** Index of the beat with keyframe 3 (`SCROLLY_DISTRIBUTIONS_BEAT_INDEX`). */
  distributionsBeatIndex: number;
  /** Whether the reader moved to an earlier or later beat (inverse animations on backward). */
  scrollDirection: 'forward' | 'backward';
}

export default function ScrollySequenceViz({
  keyframe,
  stepId,
  activeIndex,
  distributionsBeatIndex,
  scrollDirection,
}: Props) {
  const [promptVisible, setPromptVisible] = useState(true);
  const [showLoading, setShowLoading] = useState(false);
  const [showOutputCard, setShowOutputCard] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [visibleLineCount, setVisibleLineCount] = useState(1);
  /** True until graph→list reverse morph finishes (scroll up from graph beat). */
  const [reverseGraphInProgress, setReverseGraphInProgress] = useState(false);
  const prevKeyframeForGraphRef = useRef(keyframe);
  const prevKeyframeForEffects = useRef(keyframe);
  const timersRef = useRef<number[]>([]);
  const gen0 = SCROLLY_GENERATIONS[0] ?? '';
  const tokens0 = gen0.split(/\s+/).filter((w) => w.length > 0);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);
  const cancelledIntroRef = useRef(false);

  useLayoutEffect(() => {
    const prev = prevKeyframeForGraphRef.current;
    // In this story 4 → 3 only happens when scrolling up; don’t gate on scrollDirection (it used to lag one frame).
    if (keyframe === 3 && prev === 4) {
      setReverseGraphInProgress(true);
    }
    if (keyframe === 4) {
      setReverseGraphInProgress(false);
    }
    prevKeyframeForGraphRef.current = keyframe;
  }, [keyframe]);

  const onReverseMorphComplete = useCallback(() => {
    setReverseGraphInProgress(false);
  }, []);

  const exitingGraphToList = keyframe === 3 && prevKeyframeForGraphRef.current === 4;
  /** Keyframe 3 uses the SVG list (same layout as graph morph), not HTML lines. */
  const blockOutputForGraph =
    keyframe === 3 || keyframe === 4 || reverseGraphInProgress || exitingGraphToList;
  const showGraphPanel =
    keyframe === 3 || keyframe === 4 || reverseGraphInProgress || exitingGraphToList;
  /** Don’t sync row counts while reverse morph is driving `phase: 'untangle'` / `interp`. */
  const graphListRowsControlled =
    keyframe === 3 && !reverseGraphInProgress && !exitingGraphToList;

  // Keyframe 2: prompt (immediate) → loading dots → single streaming line.
  useEffect(() => {
    if (keyframe !== 2) {
      prevKeyframeForEffects.current = keyframe;
      return;
    }
    prevKeyframeForEffects.current = keyframe;

    if (process.env.NODE_ENV === 'development') {
      console.log('[scrolly viz] keyframe 2 effect start (prompt → loading → stream)', { stepId });
    }
    clearTimers();
    cancelledIntroRef.current = false;
    setPromptVisible(true);
    setShowLoading(false);
    setShowOutputCard(false);
    setTokenCount(0);
    setVisibleLineCount(1);

    const schedule = (fn: () => void, ms: number) => {
      timersRef.current.push(
        window.setTimeout(() => {
          if (!cancelledIntroRef.current) fn();
        }, ms)
      );
    };

    schedule(() => {
      setShowLoading(true);
    }, LOADING_SHOW_MS);

    schedule(() => {
      setShowLoading(false);
      setShowOutputCard(true);
    }, LOADING_SHOW_MS + LOADING_MS);

    const streamStart = LOADING_SHOW_MS + LOADING_MS + OUTPUT_AFTER_LOADING_MS;
    for (let i = 1; i <= tokens0.length; i++) {
      const ntok = i;
      schedule(() => {
        setTokenCount(ntok);
      }, streamStart + ntok * TOKEN_MS);
    }

    return () => {
      cancelledIntroRef.current = true;
      clearTimers();
    };
  }, [keyframe, clearTimers, tokens0.length, stepId]);

  // Keyframe 3: distributions beat — line-by-line reveal when scrolling forward; snap full when scrolling backward.
  useEffect(() => {
    if (distributionsBeatIndex < 0 || activeIndex !== distributionsBeatIndex) {
      return undefined;
    }
    if (keyframe !== 3) return undefined;
    clearTimers();
    setPromptVisible(true);
    setShowLoading(false);
    setShowOutputCard(true);
    setTokenCount(tokens0.length);

    const maxLines = Math.min(LIST_LINE_CAP, SCROLLY_GENERATIONS.length);

    if (scrollDirection === 'backward') {
      setVisibleLineCount(maxLines);
      return undefined;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[scrolly viz] keyframe 3 effect start (multi-line outputs)', {
        stepId,
        activeIndex,
        distributionsBeatIndex,
      });
    }
    setVisibleLineCount(1);

    let n = 1;
    const tick = () => {
      if (n >= maxLines) return;
      n++;
      setVisibleLineCount(n);
      timersRef.current.push(window.setTimeout(tick, ROW_REVEAL_MS));
    };
    timersRef.current.push(window.setTimeout(tick, ROW_REVEAL_MS));

    return clearTimers;
  }, [activeIndex, distributionsBeatIndex, keyframe, scrollDirection, clearTimers, tokens0.length, stepId]);

  // Keyframe 3 after the distributions beat: keep full output list, no reveal animation (also covers remount when scrolling back from graph).
  useEffect(() => {
    if (keyframe !== 3) return;
    if (distributionsBeatIndex < 0) return;
    if (activeIndex === distributionsBeatIndex) return;
    clearTimers();
    setPromptVisible(true);
    setShowLoading(false);
    setShowOutputCard(true);
    setTokenCount(tokens0.length);
    setVisibleLineCount(Math.min(LIST_LINE_CAP, SCROLLY_GENERATIONS.length));
  }, [activeIndex, distributionsBeatIndex, keyframe, clearTimers, tokens0.length]);

  // Keyframe 4: graph (output list hidden)
  useEffect(() => {
    if (keyframe !== 4) return;
    if (process.env.NODE_ENV === 'development') {
      console.log('[scrolly viz] keyframe 4 effect start (word graph)', { stepId });
    }
    clearTimers();
    setPromptVisible(true);
    setShowLoading(false);
    setShowOutputCard(false);
    setTokenCount(tokens0.length);
  }, [keyframe, clearTimers, tokens0.length, stepId]);

  const firstLineText = tokens0.slice(0, tokenCount).join(' ');

  return (
    <div className="scrolly-sequence-viz">
      <div
        className={`scrolly-seq-prompt-block ${
          (keyframe === 2 ? promptVisible : true) ? 'scrolly-seq-prompt-block--visible' : ''
        }`}
      >
        <p className="scrolly-seq-prompt-body">{SCROLLY_PROMPT}</p>
      </div>

      {showLoading ? (
        <div className="scrolly-seq-loading" aria-live="polite" aria-busy="true">
          <span className="scrolly-seq-loading-dot" />
          <span className="scrolly-seq-loading-dot" />
          <span className="scrolly-seq-loading-dot" />
        </div>
      ) : null}

      {showOutputCard && keyframe === 2 && !blockOutputForGraph ? (
        <div
          className="scrolly-seq-output-card"
          style={{
            minHeight: keyframe === 2 && tokenCount < tokens0.length ? '5.25rem' : undefined,
          }}
        >
          <p className="scrolly-seq-output-label">Output</p>
          <div className="scrolly-seq-output-lines" aria-live="polite">
            <p className="scrolly-seq-output-line">{firstLineText}</p>
          </div>
        </div>
      ) : null}

      {showGraphPanel ? (
        <div className="scrolly-seq-graph-panel">
          <ScrollyWordGraphUntangle
            keyframe={keyframe}
            svgId={`scrolly-wg-svg-${stepId}`}
            className="scrolly-untangle-root"
            listRowsControlled={graphListRowsControlled}
            visibleListRowCount={visibleLineCount}
            onReverseMorphComplete={onReverseMorphComplete}
          />
        </div>
      ) : null}
    </div>
  );
}
