import React from 'react';
import './article.css';
import { ScrollySection } from './ScrollySection';
import { InteractiveGraphPlaceholder } from './InteractiveGraphPlaceholder';
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

export default function App() {
  return (
    <>
      <div className="article-app">
      <header className="article-header">
        <h1>Exploring LLM output distributions</h1>
        <p className="article-byline">
          Emily Reif, Claire Yang, Jared Hwang, Deniz Nazar, Noah Smith, and Jeff Heer
        </p>
      </header>

      <p>
        When a language model answers you, you&rsquo;re usually seeing <strong>one draw</strong> from a much larger
        space of possible completions. Language models show distributional quirks in practice: homogeneous
        open-ended responses, mode collapse, patterns that feel oddly non-human, and &ldquo;sticky&rdquo; completions
        such as the fictional name &ldquo;Elara Voss&rdquo; appearing far more often than naive intuition would
        predict. That single-shot view hides structure users care about&mdash;modes, uncommon edge cases, and
        sensitivity to small prompt changes&mdash;making it easy to treat one sample as representative of the whole
        model behavior.
      </p>

      <p>
        Presenting only one answer can encourage misplaced trust and anthropomorphism; when people iterate on
        prompts, they often over-generalize from a single success or failure. Resampling the same prompt can produce
        different outputs, so it may be unclear whether a change reflects the wording or plain randomness, and
        unlike numbers, text has no agreed-on &ldquo;units&rdquo; of variation. For open-ended tasks with sparse
        feedback, prior work argues for inspecting <strong>many</strong> completions at once (mesoscale batches
        of tens to hundreds to a single prompt). In a formative study with researchers who rely on LMs in their
        work (13 participants), people described models as infrastructure for filling gaps in their workflows but
        lacked lightweight ways to see the distribution underneath.
      </p>

      <p>
        We introduce <strong>GROVE</strong> (Graph Representation of Output Variability and Examples): an interactive
        visualization that merges overlapping tokens into a shared graph, represents each sampled completion as a path
        through that structure, and keeps raw outputs within reach. Across three crowdsourced user studies, graph-style
        summaries helped with structural judgments such as comparing diversity across distributions, while a simple
        list worked better for fine-grained and single-distribution questions; participants often preferred a hybrid.
        The section below uses <strong>stacking</strong> beats on the left&mdash;earlier paragraphs stay pinned while
        you read on&mdash;with a panel on the right keyed to the narrative.
      </p>
      </div>

      <div className="scrolly-full-bleed">
        <ScrollySection />
      </div>

      <div className="article-app">
      <section className="article-below-scrolly-top" aria-label="Interactive examples">
        <h2>What can we see?</h2>
        <p className="article-section-lede">
          The same interactive tool as in our studies: use the control strip on each figure to switch between{' '}
          <strong>list</strong> and <strong>graph</strong> views, choose how many cached completions to include, fade rare
          phrasing, and adjust layout spread. Each example highlights a different &ldquo;shape&rdquo; of an output
          distribution&mdash;how tightly the model clusters on one phrasing versus how much parallel structure appears
          once you see many samples at once.
        </p>

        <ArticleMotivatingExample
          id="greek-deity"
          title="Factual recall: a dominant mode"
          svgHeightPx={300}
          promptQuote={DISPLAY_QUOTE_GREEK}
          promptGroupsSpec={{
            mode: 'single',
            promptId: 'greek-deity',
            generationsFull: getGreekDeityGenerations(),
          }}
        >
          <p>
            For a straightforward knowledge question, most draws collapse on the same entity&mdash;here,
            Zeus&mdash;with only modest edits (&ldquo;prominent&rdquo; vs &ldquo;well-known&rdquo;). A single completion
            looks definitive; the graph makes the <em>mode</em> obvious and shows where the wording drifts without
            changing the answer.
          </p>
        </ArticleMotivatingExample>

        <ArticleMotivatingExample
          id="baudelaire"
          title="Translation: shared spine, flexible surface"
          svgHeightPx={330}
          promptQuote={DISPLAY_QUOTE_BAUDELAIRE}
          promptGroupsSpec={{
            mode: 'single',
            promptId: 'baudelaire-fr',
            generationsFull: getBaudelaireGenerations(),
          }}
        >
          <p>
            Translations of the same stanza agree on content but vary in connective glue (&ldquo;In the days when&hellip;&rdquo;
            vs &ldquo;Back when&hellip;&rdquo;) and near-synonyms for the same image (&ldquo;creativity&rdquo; vs
            &ldquo;mood&rdquo; vs &ldquo;zeal&rdquo;). The merged graph foregrounds the long shared backbone of the
            English line while branches expose stylistic choices easy to miss from one sample.
          </p>
        </ArticleMotivatingExample>

        <ArticleMotivatingExample
          id="haiku-snow"
          title="Tiny creative constraint"
          svgHeightPx={400}
          promptQuote={DISPLAY_QUOTE_HAIKU}
          promptGroupsSpec={{
            mode: 'single',
            promptId: 'haiku-snow',
            generationsFull: getHaikuGenerations(),
          }}
        >
          <p>
            Short-form prompts often produce a family of completions that <em>feel</em> diverse yet reuse the same
            scaffolding&mdash;here, opening on silent snowfall and a winter hush. Many samples look &ldquo;different
            enough&rdquo; in isolation; together they reveal repeated motifs and line-breaking habits across the batch.
          </p>
        </ArticleMotivatingExample>

        <ArticleMotivatingExample
          id="random-nums"
          title="Apparent randomness, structural regularities"
          svgHeightPx={500}
          promptQuote={DISPLAY_QUOTE_RANDOM}
          promptGroupsSpec={{
            mode: 'single',
            promptId: 'random-nums',
            generationsFull: getRandomNumbersGenerations(),
          }}
        >
          <p>
            A request for random numbers ought to scatter across the space of lists; in practice, models still exhibit
            tropes (favorite integers, repeated patterns in ordering and phrasing). Inspecting many draws at once helps
            separate true variability from stylistic defaults that survive even when the literal digits change.
          </p>
        </ArticleMotivatingExample>

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
            (policy areas, epithets, historical references) in two distinct bands. <strong>Comparison mode</strong>{' '}
            lays out each prompt&rsquo;s completions in its own vertical region so you can relate intra-prompt consensus
            to cross-prompt differences&mdash;the kind of structural judgment our participants often made with graph-style
            summaries.
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
    </>
  );
}
