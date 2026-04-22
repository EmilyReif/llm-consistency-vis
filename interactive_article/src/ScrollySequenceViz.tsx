/**
 * Prompt + single streaming output (no loading) → many lines → word graph (reuses ScrollyWordGraphUntangle).
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ScrollyWordGraphUntangle from './ScrollyWordGraphUntangle';
import { SCROLLY_PROMPT, SCROLLY_GENERATIONS } from './scrollyData';

export type ScrollySequenceKeyframe = 2 | 3 | 4;

/**
 * Keyframe 2 only — from effect start: prompt and output card are shown immediately, then
 * first line streams in: t = STREAM_START_MS, then +TOKEN_MS per word.
 */
/** Brief pause so layout can settle before token streaming begins. */
const STREAM_START_MS = 50;
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
  /** KF3 SVG list: highlight this substring in tokens when set. */
  listHighlightSubstring?: string;
  /** Whether the reader moved to an earlier or later beat (inverse animations on backward). */
  scrollDirection: 'forward' | 'backward';
}

export default function ScrollySequenceViz({
  keyframe,
  stepId,
  activeIndex,
  distributionsBeatIndex,
  listHighlightSubstring,
  scrollDirection,
}: Props) {
  const [promptVisible, setPromptVisible] = useState(true);
  const [showOutputCard, setShowOutputCard] = useState(true);
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
  /** After the HTML stream finishes once, avoid restarting it on brief scroll-spy flicker (beat 0) while moving down. */
  const htmlIntroCompletedRef = useRef(false);
  const activeIndexRef = useRef(activeIndex);
  const scrollDirectionRef = useRef(scrollDirection);
  activeIndexRef.current = activeIndex;
  scrollDirectionRef.current = scrollDirection;

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

  // Keyframe 2: prompt + output card immediately → single streaming line (no loading dots).
  useLayoutEffect(() => {
    if (keyframe !== 2) {
      // Do not set htmlIntroCompletedRef here: a one-frame KF3 flash from scroll-spy would skip the stream.
      prevKeyframeForEffects.current = keyframe;
      return;
    }

    if (scrollDirectionRef.current === 'backward') {
      htmlIntroCompletedRef.current = false;
    }

    prevKeyframeForEffects.current = keyframe;

    if (
      htmlIntroCompletedRef.current &&
      scrollDirectionRef.current === 'forward' &&
      activeIndexRef.current === 0
    ) {
      clearTimers();
      cancelledIntroRef.current = false;
      setPromptVisible(true);
      setShowOutputCard(true);
      setTokenCount(tokens0.length);
      setVisibleLineCount(1);
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[scrolly viz] keyframe 2 effect start (prompt + stream, no loading)', { stepId });
    }
    clearTimers();
    cancelledIntroRef.current = false;
    setPromptVisible(true);
    setShowOutputCard(true);
    setTokenCount(0);
    setVisibleLineCount(1);

    const schedule = (fn: () => void, ms: number) => {
      timersRef.current.push(
        window.setTimeout(() => {
          if (!cancelledIntroRef.current) fn();
        }, ms)
      );
    };

    const streamStart = STREAM_START_MS;
    for (let i = 1; i <= tokens0.length; i++) {
      const ntok = i;
      schedule(() => {
        setTokenCount(ntok);
        if (ntok === tokens0.length) htmlIntroCompletedRef.current = true;
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
        <p className="scrolly-seq-prompt-source">
          Prompt from{' '}
          <a href="https://arxiv.org/abs/2504.05228" rel="noopener noreferrer">
            NoveltyBench
          </a>
          .
        </p>
      </div>

      {showOutputCard && keyframe === 2 && !blockOutputForGraph ? (
        <div
          className="scrolly-seq-output-card"
          style={{
            minHeight: keyframe === 2 && tokenCount < tokens0.length ? '5.25rem' : undefined,
          }}
        >
          <p className="scrolly-seq-output-label">Output</p>
          <div className="scrolly-seq-output-lines" aria-live="polite">
            <p className="scrolly-seq-output-line scrolly-seq-output-line--streaming">{firstLineText}</p>
          </div>
        </div>
      ) : null}

      {showGraphPanel ? (
        <div className="scrolly-seq-graph-panel">
          <ScrollyWordGraphUntangle
            keyframe={keyframe}
            svgId={`scrolly-wg-svg-${stepId}`}
            className="scrolly-untangle-root"
            listHighlightSubstring={listHighlightSubstring}
            listRowsControlled={graphListRowsControlled}
            visibleListRowCount={visibleLineCount}
            onReverseMorphComplete={onReverseMorphComplete}
          />
        </div>
      ) : null}
    </div>
  );
}
