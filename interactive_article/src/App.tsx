import React from 'react';
import './article.css';
import { ScrollySection } from './ScrollySection';
import { InteractiveGraphPlaceholder } from './InteractiveGraphPlaceholder';

export default function App() {
  return (
    <div className="article-app">
      <header className="article-header">
        <h1>Exploring LLM output distributions</h1>
        <p className="article-byline">
          <em>[Authors &mdash; add names / affiliations]</em>
        </p>
      </header>

      <p>
        When a language model answers you, you&rsquo;re usually seeing <strong>one draw</strong> from a much larger
        space of possible outputs. This article is a short, visualization-forward walkthrough of how we think about
        that space and one way to look at many samples at once. <em>[Draft &mdash; edit freely.]</em>
      </p>

      <p>
        The section below uses <strong>stacking</strong> beats on the left: earlier paragraphs stay pinned while you
        read on. The panel on the right shows a <strong>keyframe</strong> placeholder (1&ndash;4) aligned with the
        diagram beats in the outline; real graphics will replace the numbers as we build them out.
      </p>

      <ScrollySection />

      <section className="article-below-scrolly-top" aria-label="Interactive examples">
        <h2>What can we see?</h2>
        <p className="article-section-lede">
          <em>[TODO: wire each block to precached data and the real untangle-style graph widget.]</em> Placeholder
          frames below stand in for three example-facing demos (titles are suggestions from the outline).
        </p>

        <h3>Presidents</h3>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Short supporting copy for this example &mdash; single
          prompt, many completions, graph view.
        </p>
        <InteractiveGraphPlaceholder
          label="example-presidents"
          caption="Placeholder: interactive graph for the presidents-style prompt and cached generations."
        />

        <h3>Story</h3>
        <p>
          Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor
          quam, feugiat vitae, ultricies eget, tempor sit amet, ante.
        </p>
        <InteractiveGraphPlaceholder
          label="example-story"
          caption="Placeholder: e.g. Seattle / trace-style story completions as in the main tool."
        />

        <h3>Translations or temperature</h3>
        <p>
          Quisque sit amet est et sapien ullamcorper pharetra. Optional third slot for translations, temperature sweeps, or
          another dataset from the paper.
        </p>
        <InteractiveGraphPlaceholder
          label="example-translations-or-temp"
          caption="Placeholder: third demo (translations, temperature, or model family) &mdash; swap label when you pick."
        />
      </section>

      <section className="article-below-scrolly" aria-label="Comparison mode">
        <h2>Comparison mode</h2>
        <p className="article-section-lede">
          <em>[TODO: two prompts, two models, or two temperatures side by side.]</em> Lorem ipsum dolor sit amet,
          consectetur adipiscing elit. Users can inspect how a distribution shifts, not just individual strings.
        </p>
        <div className="article-comparison-row">
          <InteractiveGraphPlaceholder
            label="compare-a"
            caption="Placeholder: graph A (e.g. baseline prompt or model)."
          />
          <InteractiveGraphPlaceholder
            label="compare-b"
            caption="Placeholder: graph B (e.g. alternate prompt or model)."
          />
        </div>
      </section>

      <section className="article-below-scrolly" aria-label="User studies">
        <h2>User studies</h2>
        <p className="article-section-lede">
          <em>[TODO: protocol summary, tasks, and takeaway bullets.]</em> Ut enim ad minim veniam, quis nostrud
          exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>
        <InteractiveGraphPlaceholder
          label="user-study-figure-1"
          caption="Placeholder: figure from the paper (e.g. task overview, quantitative summary, or qualitative coding)."
        />
        <InteractiveGraphPlaceholder
          label="user-study-figure-2"
          caption="Placeholder: second study figure if needed."
        />
      </section>

      <section className="article-below-scrolly" aria-label="Discussion">
        <h2>Discussion</h2>
        <p>
          <em>[TODO: limitations, design tradeoffs, when graph views help vs. hurt, relation to prior work.]</em> Duis
          aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
          occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </p>
        <p>
          Curabitur pretium tincidunt lacus. This section can stay text-only, or you can drop in another small figure if
          helpful for the camera-ready version.
        </p>
      </section>

      <section className="article-below-scrolly" aria-label="Closing">
        <h2>What next?</h2>
        <p>
          Is this the perfect visualization? No. Fork the repo and build on it:{' '}
          <a href="https://github.com/EmilyReif/llm-consistency-vis">github.com/EmilyReif/llm-consistency-vis</a>
        </p>

        <p className="article-placeholder-end">
          <strong>End of draft body.</strong> Replace lorem and placeholders with final prose and embedded diagrams.
        </p>
      </section>
    </div>
  );
}
