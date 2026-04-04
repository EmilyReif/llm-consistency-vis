import React, { useMemo, useState } from 'react';
import ExamplesWordGraphUntangle from './ExamplesWordGraphUntangle';

type SpecSingle = {
  mode: 'single';
  promptId: string;
  generationsFull: string[];
};

type SpecCompare = {
  mode: 'compare';
  a: { promptId: string; generationsFull: string[] };
  b: { promptId: string; generationsFull: string[] };
};

export type ArticleMotivatingExampleProps = {
  id: string;
  title: string;
  children: React.ReactNode;
  /** Prompt shown as a floating card in the graph area (left of the controls sidebar). */
  promptQuote: string;
  promptGroupsSpec: SpecSingle | SpecCompare;
  /**
   * Fixed height for the word graph SVG (px). Width still fills the card.
   * The layout may grow slightly in list mode if many rows need more space.
   */
  svgHeightPx?: number;
};

export function ArticleMotivatingExample({
  id,
  title,
  children,
  promptQuote,
  promptGroupsSpec,
  svgHeightPx,
}: ArticleMotivatingExampleProps) {
  const maxN = useMemo(() => {
    if (promptGroupsSpec.mode === 'single') {
      return Math.max(2, promptGroupsSpec.generationsFull.length);
    }
    return Math.max(
      2,
      Math.min(promptGroupsSpec.a.generationsFull.length, promptGroupsSpec.b.generationsFull.length)
    );
  }, [promptGroupsSpec]);

  const [n, setN] = useState(() => Math.max(2, Math.min(20, maxN)));

  const promptGroups = useMemo(() => {
    const cap = Math.min(n, maxN);
    if (promptGroupsSpec.mode === 'single') {
      return [
        {
          promptId: promptGroupsSpec.promptId,
          generations: promptGroupsSpec.generationsFull.slice(0, cap),
        },
      ];
    }
    return [
      {
        promptId: promptGroupsSpec.a.promptId,
        generations: promptGroupsSpec.a.generationsFull.slice(0, cap),
      },
      {
        promptId: promptGroupsSpec.b.promptId,
        generations: promptGroupsSpec.b.generationsFull.slice(0, cap),
      },
    ];
  }, [promptGroupsSpec, n, maxN]);

  const hostClassName = [
    'article-graph-placeholder-frame article-motivating-graph-host',
    svgHeightPx != null ? 'article-motivating-graph-host--manual-svg-h' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hostStyle: React.CSSProperties | undefined =
    svgHeightPx != null
      ? ({
          '--article-motivating-svg-h': `${svgHeightPx}px`,
          minHeight: svgHeightPx,
        } as React.CSSProperties)
      : undefined;

  const floatingPrompt = useMemo(
    () => (
      <div className="scrolly-seq-prompt-block scrolly-seq-prompt-block--visible article-motivating-floating-prompt-card">
        <p className="scrolly-seq-prompt-body">{promptQuote}</p>
      </div>
    ),
    [promptQuote]
  );

  return (
    <div className="article-motivating-block">
      <h3>{title}</h3>
      {children}
      <div className="article-motivating-fullbleed">
        <div className="article-graph-figure article-motivating-figure">
          <div className={hostClassName} style={hostStyle}>
            <ExamplesWordGraphUntangle
              svgId={`motivating-${id}`}
              className="article-example-untangle"
              promptGroups={promptGroups}
              showUntangleToggle
              showMotivatingControls
              motivatingGenerations={{
                maxCached: maxN,
                value: Math.min(n, maxN),
                onChange: setN,
              }}
              fixedSvgHeightPx={svgHeightPx}
              startInListView={false}
              initialSeparateByPrompt={promptGroupsSpec.mode === 'compare'}
              floatingPrompt={floatingPrompt}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
