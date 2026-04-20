import React from 'react';
import './article.css';
import { prefetchScrollyWordGraphModel } from './ScrollyWordGraphUntangle';
import { ScrollySection } from './ScrollySection';
import { ArticleMotivatingExample } from './ArticleMotivatingExample';
import {
  DISPLAY_QUOTE_BAUDELAIRE,
  DISPLAY_QUOTE_GREEK,
  DISPLAY_QUOTE_HAIKU,
  DISPLAY_QUOTE_PRESIDENTS,
  DISPLAY_QUOTE_RANDOM,
  getBaudelaireGenerations,
  getGreekDeityGenerations,
  getHaikuGenerations,
  getObamaSummaries,
  getRandomNumbersGenerations,
  getTrumpSummaries,
} from './articleMotivatingExamplesData';

if (typeof window !== 'undefined') {
  prefetchScrollyWordGraphModel().catch(() => {});
}

function DistillAffilRef({ id }: { id: 1 | 2 }) {
  return <sup className="article-distill-fn-ref">{id}</sup>;
}

export default function App() {
  const paperFig = (file: string) => `${process.env.PUBLIC_URL || ''}/paper-figures/${file}`;

  return (
    <>
      <div className="article-app">
      <header className="article-header">
        <h1>Exploring LLM output distributions</h1>
        <div className="article-distill-byline" aria-label="Authors and affiliations">
          <div className="article-distill-byline-columns">
            <div className="article-distill-byline-label article-distill-byline-cell-authors-h">Authors</div>
            <div className="article-distill-byline-label article-distill-byline-cell-published-h">Published</div>
            <div className="article-distill-names-line article-distill-byline-cell-authors-names">
              Emily Reif
              <DistillAffilRef id={1} />, Claire Yang
              <DistillAffilRef id={1} />, Jared Hwang
              <DistillAffilRef id={1} />, Deniz Nazar
              <DistillAffilRef id={1} />, Noah Smith
              <DistillAffilRef id={1} />
              <DistillAffilRef id={2} />, Jeff Heer
              <DistillAffilRef id={1} />
            </div>
            <div className="article-distill-byline-published article-distill-byline-cell-published-date">
              Apr. 15, 2026
            </div>
            <div className="article-distill-byline-label article-distill-byline-cell-affil-h">Affiliations</div>
            <div className="article-distill-byline-affil-line article-distill-byline-cell-affil-line">
              <DistillAffilRef id={1} /> University of Washington
              {', '}
              <DistillAffilRef id={2} /> AI2 (Allen Institute for AI)
            </div>
          </div>
        </div>
      </header>
      <p>
        A language model is indeed a statistical model: it samples from a distribution over a set of possible outputs. This
        distribution can contain quirks like mode collapse, divergent outputs, and sensitivity to small prompt changes. How
        does this stochasticity manifest in practice? How does it affect the way people use and evaluate language models?
        What is the best way to inspect and understand these distributions? In our paper (TODO: link), we explore these
        questions through a series of interactive examples and a user study.
      </p>
      </div>

      <div className="scrolly-full-bleed">
        <ScrollySection />
      </div>

      <div className="article-app">
      <section className="article-below-scrolly-top" aria-label="Interactive examples">
        <h2>What can we see?</h2>
        <p className="article-section-lede">
The examples below all show a collection of outputs from a single prompt. Use the control strip on each figure to switch between list and graph views, choose how many cached completions to include, fade rare phrasing, and adjust layout spread.
        </p>

        <ArticleMotivatingExample
          id="greek-deity"
          title="Factual recall"
          svgHeightPx={300}
          promptQuote={DISPLAY_QUOTE_GREEK}
          promptGroupsSpec={{
            mode: 'single',
            promptId: 'greek-deity',
            generationsFull: getGreekDeityGenerations(),
          }}
        >
          <p>
            For a straightforward knowledge question ("What is a diety from Greek mythology?"), most outputs are different phrasings of "Zeus".
          </p>
        </ArticleMotivatingExample>

        <ArticleMotivatingExample
          id="baudelaire"
          title="Translation"
          svgHeightPx={330}
          promptQuote={DISPLAY_QUOTE_BAUDELAIRE}
          promptGroupsSpec={{
            mode: 'single',
            promptId: 'baudelaire-fr',
            generationsFull: getBaudelaireGenerations(),
          }}
        >
          <p>
            Translations of the same stanza from the Baudelaire poem {' '}
            <a href="https://fleursdumal.org/poem/118">La Géante </a> share a similar structure but differ in some
            phrasings. These kinds of visualizations have been used for machine translation historically as well, for example,{' '}
            <a href="https://www.cs.toronto.edu/~gpenn/papers/collins_lattice_uncertainty_2007.pdf">
              lattice- and graph-style views of many hypotheses
            </a>
            .
          </p>
        </ArticleMotivatingExample>

        <ArticleMotivatingExample
          id="haiku-snow"
          title="Generic poetry"
          svgHeightPx={400}
          promptQuote={DISPLAY_QUOTE_HAIKU}
          promptGroupsSpec={{
            mode: 'single',
            promptId: 'haiku-snow',
            generationsFull: getHaikuGenerations(),
          }}
        >
          <p>
            Another open-ended prompt, this time asking for a haiku about snow, produces a collection of outputs that share very similar words and phrasings. LLMs have been critiqued for generating generic poetry that doesn't feel like human-written poetry; reverting to the same phrases is one aspect of this.
          </p>
        </ArticleMotivatingExample>

      </section>

      <section className="article-below-scrolly" aria-label="Planned comparison examples">
        <h2>Comparisons</h2>
        <p className="article-section-lede">
          <em>
            [TODO: Frame how side-by-side or overlaid distributions support cross-model and sampling comparisons.]
          </em>
        </p>
        <ArticleMotivatingExample
          id="presidents-compare"
          title="Comparison: two related prompts, two color tracks"
          svgHeightPx={700}
          promptQuote={DISPLAY_QUOTE_PRESIDENTS}
          promptGroupsSpec={{
            mode: 'compare',
            a: { promptId: 'summ-trump', generationsFull: getTrumpSummaries() },
            b: { promptId: 'summ-obama', generationsFull: getObamaSummaries() },
          }}
        >
          <p>
            Asking for one-sentence summaries of two presidencies surfaces two partially overlapping vocabularies
            (policy areas, epithets, historical references) in two distinct bands. Comparison mode lays out each
            prompt&rsquo;s completions in its own vertical region so you can relate intra-prompt consensus
            to cross-prompt differences&mdash;the kind of structural judgment our participants often made with graph-style
            summaries.
          </p>
        </ArticleMotivatingExample>
        <h3>Comparing models (across families)</h3>
        <p>
          <em>
            [TODO: e.g. same prompt under GPT vs. Claude vs. Gemini (or similar)&mdash;contrasting vocabulary,
            structure, and modal phrasing across model families; figure / interactive.]
          </em>
        </p>

        <h3>Comparing models (within families)</h3>
        <p>
          <em>
            [TODO: e.g. successive sizes or versions within one line (3.5 vs. 4, small vs. large)&mdash;how intra-family
            changes shift the batch distribution; figure / interactive.]
          </em>
        </p>

        <h3>Comparing temperatures</h3>
        <p>
          <em>
            [TODO: e.g. same model and prompt at low vs. high temperature&mdash;entropy, diversity, and collapse in
            the graph; figure / interactive.]
          </em>
        </p>
      </section>

      <section className="article-below-scrolly" aria-label="User studies">
        <h2>User studies</h2>
        <p className="article-section-lede">
          In a formative semi-structured interview study, we spoke with thirteen researchers in NLP and HCI who use
          language models on open-ended tasks. Sessions lasted about half an hour and covered when stochasticity matters in
          their work, how they sample and inspect many completions, what they mean by &ldquo;diversity&rdquo; or a
          &ldquo;distribution&rdquo; over text, and reactions to an early graph prototype&mdash;grounding the design goals
          behind GROVE.
        </p>
        <h3>Findings</h3>
        <ul className="article-formative-findings">
          <li>
            <strong>Adopting LMs out of necessity, not enthusiasm.</strong> Many participants treated models as the only
            practical way to get fluent language on novel tasks without massive data or crowdwork, not because the LM was
            ideal. One researcher said simply: &ldquo;there just wasn&rsquo;t really anything else that would have worked
            [for our task].&rdquo;
          </li>
          <li>
            <strong>Tools that enable nuanced behaviors also produce nuanced failures.</strong> Benchmarks and automatic
            metrics were often a starting point, but rarely settled whether behavior was good enough for a specific use
            case. As one put it: &ldquo;quantitative evaluation isn&rsquo;t great. No automatic metrics really apply to
            our problem.&rdquo;
          </li>
          <li>
            <strong>Evaluation requires distributional analysis.</strong> A single completion could be misleading; people
            cared about within-input diversity versus meaningful differences when comparing prompts. One summarized the
            iteration problem this way: &ldquo;it&rsquo;s a huge problem that a single output from model A could have also
            come from model B.&rdquo;
          </li>
          <li>
            <strong>What does &ldquo;distribution&rdquo; mean for natural language?</strong> There was no shared
            operationalization&mdash;unlike numeric outputs, text has no agreed units of variation, so assessments were
            often an &ldquo;impression test&rdquo; from reading many examples.
          </li>
          <li>
            <strong>Direct evaluation does not scale for distributions.</strong> Inspecting many generations at once was
            cognitively costly; some avoided stochasticity or large batches. One wished for richer multi-example
            workflows but noted: &ldquo;It&rsquo;s expensive to generate, and hard to qualitatively understand.&rdquo;
          </li>
          <li>
            <strong>Distributions matter beyond evaluation.</strong> Open-ended creativity, synthetic data uniformity,
            matching human-like variation, reasoning traces, and intentionally diverse multi-agent setups all made the
            spread of outputs a first-class concern. One researcher building multiple LM experts asked: &ldquo;If I&rsquo;ve
            accidentally created the same agent multiple times, or they&rsquo;re all giving the same advice, then why not
            just make one?&rdquo;
          </li>
          <li>
            <strong>Consistency can also be desirable.</strong> For multi-step or user-facing systems, inconsistency could
            cascade; participants wanted controlled variation (semantic consistency with flexible phrasing), not
            chaotically different behaviors. As one participant put it, &ldquo;[inconsistency] is worse when it&rsquo;s a
            part of a larger system. It can cascade and mess up the whole thing,&rdquo; motivating careful inspection of
            full output sets.
          </li>
        </ul>
        <h3>Controlled studies</h3>
        <p>
          We also ran three within-subjects crowdsourced studies on Prolific (N=47, 44, and 40), comparing the merged
          graph with the same outputs in a plain list. Wilcoxon tests on per-participant accuracy (graph &minus; list)
          favored the graph <em>only</em> for judging relative diversity across temperature (<i>p</i> = 0.012, <i>n</i> =
          36); the list was more accurate for questions about one distribution and for two-prompt comparison (
          <i>p</i> = 0.009, <i>n</i> = 26; <i>p</i> = 0.002, <i>n</i> = 40). Preferences mirrored that
          split&mdash;strongly pro-graph for diversity, more mixed or polarized on the other tasks.
        </p>
        <figure className="article-graph-figure">
          <img
            className="article-paper-figure-img"
            src={paperFig('combined_diff_accuracy_by_participant.png')}
            loading="lazy"
            alt="Per-participant accuracy difference (graph minus list) for diversity, single-distribution, and comparison studies."
          />
          <figcaption className="article-graph-figcaption">
            Per-participant difference (graph &minus; list) in accuracy; positive favors graph. Diversity: graph
            higher, <i>p</i> = 0.012. Single distribution and two-prompt comparison: list higher, <i>p</i> = 0.009 and{' '}
            <i>p</i> = 0.002.
          </figcaption>
        </figure>
        <figure className="article-graph-figure">
          <img
            className="article-paper-figure-img"
            src={paperFig('direct_comparison_overall_preference.png')}
            loading="lazy"
            alt="Overall interface preference by study: 1 is graph, 7 is list."
          />
          <figcaption className="article-graph-figcaption">
            Overall preference (1 = graph, 7 = list): pro-graph for diversity; polarized for single-distribution; more
            spread for comparison.
          </figcaption>
        </figure>
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
          End of draft body. Replace lorem and placeholders with final prose and embedded diagrams.
        </p>
      </section>
      </div>
    </>
  );
}
