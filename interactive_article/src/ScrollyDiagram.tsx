import React from 'react';

export interface ScrollyDiagramProps {
  /** Active story keyframe (must match the step that’s “current” while scrolling). */
  keyframe: number;
  /** Step DOM id for cross-checking in devtools. */
  stepId: string;
}

/**
 * Placeholder “diagram” for scrolly debugging: shows keyframe + step id.
 * Replace the inner area later with real SVG / D3 / etc.
 */
export function ScrollyDiagram({ keyframe, stepId }: ScrollyDiagramProps) {
  return (
    <div className="scrolly-diagram" role="img" aria-label={`Diagram keyframe ${keyframe}`}>
      <div className="scrolly-diagram-debug">
        <div className="scrolly-diagram-keyframe">{keyframe}</div>
        <div className="scrolly-diagram-meta">
          <span className="scrolly-diagram-label">Keyframe</span>
          <span className="scrolly-diagram-step-id">{stepId}</span>
        </div>
      </div>
      <div className="scrolly-diagram-template">
        <p className="scrolly-diagram-template-hint">Diagram template — swap in real viz later.</p>
      </div>
    </div>
  );
}
