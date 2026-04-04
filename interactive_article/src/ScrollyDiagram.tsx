import React from 'react';
import ScrollySequenceViz, { type ScrollySequenceKeyframe } from './ScrollySequenceViz';

export interface ScrollyDiagramProps {
  /** Active story keyframe (must match the step that’s “current” while scrolling). */
  keyframe: number;
  /** Step DOM id for cross-checking in devtools and unique SVG ids. */
  stepId: string;
  /** Scroll-spy index of the current beat; used to start the multi-output beat on cue. */
  activeIndex: number;
  /** `SCROLLY_DISTRIBUTIONS_BEAT_INDEX` — beat where many outputs should animate in. */
  distributionsBeatIndex: number;
  /** Beat index increased vs decreased since last commit (drives reverse animations). */
  scrollDirection: 'forward' | 'backward';
}

/**
 * Scrolly diagram: prompt → loading → streaming output → many lines → graph.
 * Keyframes: 1 = no viz, 2 = intro sequence, 3 = expand outputs, 4 = word graph.
 */
export function ScrollyDiagram({
  keyframe,
  stepId,
  activeIndex,
  distributionsBeatIndex,
  scrollDirection,
}: ScrollyDiagramProps) {
  if (keyframe === 1) {
    return null;
  }

  const k = keyframe as ScrollySequenceKeyframe;
  const aria =
    keyframe === 2 ?
      'Prompt appears, then a single model output streams in word by word'
    : keyframe === 3 ?
      'Many alternative outputs appear as separate lines'
    : 'Interactive word graph: overlapping paths across generations, node size or styling by frequency';

  return (
    <div
      className="scrolly-diagram scrolly-diagram-sequence"
      role="img"
      aria-label={aria}
      data-scrolly-step={stepId}
    >
      <ScrollySequenceViz
        keyframe={k}
        stepId={stepId}
        activeIndex={activeIndex}
        distributionsBeatIndex={distributionsBeatIndex}
        scrollDirection={scrollDirection}
      />
    </div>
  );
}
