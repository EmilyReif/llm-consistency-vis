import React from 'react';
import './article.css';
import { prefetchScrollyWordGraphModel } from './ScrollyWordGraphUntangle';
import { ScrollySection } from './ScrollySection';
import { ArticleMotivatingExample } from './ArticleMotivatingExample';
import { MobileArticleNotice } from './MobileArticleNotice';
import {
  DISPLAY_QUOTE_BAUDELAIRE,
  DISPLAY_QUOTE_GREEK,
  DISPLAY_QUOTE_HAIKU,
  DISPLAY_QUOTE_GREEK_TEMP_COMPARE,
  DISPLAY_QUOTE_JOKE_MODEL_COMPARE,
  DISPLAY_QUOTE_PRESIDENTS,
  getBaudelaireGenerations,
  getGreekDeityGenerations,
  getGreekDeityTemp02Generations,
  getGreekDeityTemp09Generations,
  getHaikuGenerations,
  getJokeGpt4oGenerations,
  getJokeGpt35TurboGenerations,
  getObamaSummaries,
  getTrumpSummaries,
} from './articleMotivatingExamplesData';

if (typeof window !== 'undefined') {
  const startScrollyGraphPrefetch = () => prefetchScrollyWordGraphModel().catch(() => {});
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.setTimeout(startScrollyGraphPrefetch, 0);
    });
  });
}

function DistillAffilRef({ id }: { id: 1 | 2 }) {
  return <sup className="article-distill-fn-ref">{id}</sup>;
}

export default function App() {
  const paperFig = (file: string) => `${process.env.PUBLIC_URL || ''}/paper-figures/${file}`;

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
    } catch {
      /* ignore */
    }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const legacy = (performance as unknown as { navigation?: { type: number } }).navigation;
    const isReload = nav?.type === 'reload' || legacy?.type === 1;
    if (isReload) {
      window.scrollTo(0, 0);
    }
  }, []);

  return (
    <>
      <MobileArticleNotice />
      <div className="article-app">
      <header className="article-header">
        <h1>Beyond One Output</h1>
        <p className="article-header-subtitle">
          Visualizing and Comparing Distributions of Language Model Generations
        </p>
        <nav className="article-header-links" aria-label="Paper, demo, and code">
          <a className="article-header-outlink" href="https://arxiv.org/abs/2604.18724" rel="noopener noreferrer">
            paper
          </a>
          <span className="article-header-link-sep" aria-hidden>
            {' '}
            &middot;{' '}
          </span>
          <a className="article-header-outlink" href="https://emilyreif.com/llm-consistency-vis/" rel="noopener noreferrer">
            demo
          </a>
          <span className="article-header-link-sep" aria-hidden>
            {' '}
            &middot;{' '}
          </span>
          <a className="article-header-outlink" href="https://github.com/EmilyReif/llm-consistency-vis" rel="noopener noreferrer">
            code
          </a>
        </nav>
        <div className="article-distill-byline" aria-label="Authors and affiliations">
          <div className="article-distill-byline-columns">
            <div className="article-distill-byline-label article-distill-byline-cell-authors-h">Authors</div>
            <div className="article-distill-byline-label article-distill-byline-cell-published-h">Published</div>
            <div className="article-distill-names-line article-distill-byline-cell-authors-names">
              Emily Reif
              <DistillAffilRef id={1} />, Claire Yang
              <DistillAffilRef id={1} />, Jared Hwang
              <DistillAffilRef id={1} />, Deniz Nazar
              <DistillAffilRef id={1} />, Noah A. Smith
              <DistillAffilRef id={1} />
              <DistillAffilRef id={2} />, Jeff Heer
              <DistillAffilRef id={1} />
            </div>
            <div className="article-distill-byline-published article-distill-byline-cell-published-date">
              Apr. 22, 2026
            </div>
            <div className="article-distill-byline-label article-distill-byline-cell-affil-h">Affiliations</div>
            <div className="article-distill-byline-affil-line article-distill-byline-cell-affil-line">
              <DistillAffilRef id={1} />University of Washington
              {' '}
              <DistillAffilRef id={2} />Allen Institute for AI
            </div>
          </div>
        </div>
      </header>
      <p>
        While we usually interact with language models on a turn-by-turn basis, a single output is just one sample from
        a distribution of possible outputs. This distribution can contain quirks like mode collapse, divergent outputs,
        and sensitivity to small prompt changes.
        
        </p>
        <p>

         A growing line of work interrogates that default: showing only one sample can increase{' '}
        <a href="https://arxiv.org/abs/2503.16114">undue trust</a> and anthropomorphization relative to showing many
        samples, while "mesoscale" interfaces aim to help people make sense of{' '}
        <a href="https://doi.org/10.1145/3613904.3642139">tens to hundreds</a> of completions at once. Meanwhile, people
        struggle to iterate on prompts, whether because it's because they{' '}
        <a href="https://doi.org/10.1145/3544548.3581388">explore opportunistically</a> rather than systematically, or
        because, <a href="https://doi.org/10.1145/3706598.3714319">without gold labels</a> for a new task, it is hard to know whether a
        prompt is improving. How does this stochasticity manifest in practice? How does it affect the way people use and evaluate language
        models? What is the best way to inspect, understand, and compare these distributions?
      </p>

      </div>

      <div className="scrolly-full-bleed">
        <ScrollySection />
      </div>

      <div className="article-app">
      <section className="article-below-scrolly-top" aria-label="Interactive examples">
        <p className="article-section-lede">
The examples below show collections of outputs from a single prompt, visualized in this way. Use the control strip on each figure to switch between list and graph views, choose how many cached completions to include, hide longtail outputs, and adjust layout spread.
        </p>
{/* 
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
            For a straightforward knowledge question ("What is a diety from Greek mythology?"; prompt from{' '}
            <a href="https://arxiv.org/abs/2504.05228" rel="noopener noreferrer">
              NoveltyBench
            </a>
            ), the answer is always Zeus, though there is some variety in phrasing.
          </p>
        </ArticleMotivatingExample> */}

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
            <a href="https://fleursdumal.org/poem/118">La Géante</a> share a similar structure, but specific words have a variety of possibile translations. Similar graph-based visualizations have been used for machine translation historically, for example,{' '}
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
            An open-ended prompt asking for a haiku about snow produces a collection of outputs that share very similar words and phrasings. LLM poetry is often criticized as formulaic and derivative: this shows what that means in practice.
          </p>
        </ArticleMotivatingExample>

      </section>

      <section className="article-below-scrolly" aria-label="Planned comparison examples">
        <h2>Comparisons</h2>
        <p className="article-section-lede">
            When comparing prompts or models, it can be hard to know if a single output is representative of the overall behavior. Visualizing the distributions side-by-side can help understand whether or not there is a meaningful change, and if so, how it manifests.
        </p>
        <ArticleMotivatingExample
          id="presidents-compare"
          title="Two related prompts"
          svgHeightPx={700}
          promptQuote={DISPLAY_QUOTE_PRESIDENTS}
          promptGroupsSpec={{
            mode: 'compare',
            a: { promptId: 'summ-trump', generationsFull: getTrumpSummaries() },
            b: { promptId: 'summ-obama', generationsFull: getObamaSummaries() },
          }}
        >
          <p>
            Each of the one-sentence summaries of the Trump and Obama presidencies share a similar structure, but different specific policies and historical references are mentioned.
          </p>
        </ArticleMotivatingExample>
        <ArticleMotivatingExample
          id="greek-deity-temp-compare"
          title="Comparing temperature settings"
          svgHeightPx={700}
          promptQuote={DISPLAY_QUOTE_GREEK_TEMP_COMPARE}
          compareLegend={{
            aLabel: 'Temperature: 0.2',
            bLabel: 'Temperature: 0.9',
          }}
          promptGroupsSpec={{
            mode: 'compare',
            a: { promptId: 'greek-deity-t0.2', generationsFull: getGreekDeityTemp02Generations() },
            b: { promptId: 'greek-deity-t0.9', generationsFull: getGreekDeityTemp09Generations() },
          }}
        >
          <p>
            The response to the factual question ("what is a greek Diety?"; prompt from{' '}
            <a href="https://arxiv.org/abs/2504.05228" rel="noopener noreferrer">
              NoveltyBench
            </a>
            ) is always Zeus. Increasing the temperature from 0.2 to 0.9 produces more diverse responses, but only in
            the way that they are phrased.
          </p>
        </ArticleMotivatingExample>
        <ArticleMotivatingExample
          id="joke-model-compare"
          title="Comparing models within a family"
          svgHeightPx={700}
          promptQuote={DISPLAY_QUOTE_JOKE_MODEL_COMPARE}
          compareLegend={{
            aLabel: 'GPT-4o',
            bLabel: 'GPT-3.5-turbo',
          }}
          promptGroupsSpec={{
            mode: 'compare',
            a: { promptId: 'joke-gpt-4o', generationsFull: getJokeGpt4oGenerations() },
            b: { promptId: 'joke-gpt-35-turbo', generationsFull: getJokeGpt35TurboGenerations() },
          }}
        >
          <p>
            Even within the GPT family, different models produce different jokes in response to the same prompt
            ("Tell me a joke"; prompt from{' '}
            <a href="https://arxiv.org/abs/2504.05228" rel="noopener noreferrer">
              NoveltyBench
            </a>
            ). While GPT-4o is generally a higher-accuracy model, it produces less diverse jokes than GPT-3.5-turbo.
          </p>
        </ArticleMotivatingExample>

      </section>

      <section className="article-below-scrolly" aria-label="User studies">
        <h2>User studies</h2>
        <p className="article-section-lede">
          We interviewed 13 researchers who use LMs for open-ended tasks to understand how they reason about stochastic
          outputs. They emphasized that evaluation is inherently distributional (single examples are unreliable), but also
          difficult, since text lacks clear units of variation and inspecting many outputs is costly. Participants wanted
          tools to balance diversity and consistency without relying solely on manual inspection. These interviews grounded the design criteris for GROVE. See Sec. 3 of our <a href="https://arxiv.org/pdf/2604.18724">paper</a> for more details.
        </p>
        <h3>Controlled studies</h3>
        <p>
          We also ran three within-subjects crowdsourced studies on Prolific (N=47, 44, and 40), comparing the merged
          graph with the same outputs in a plain list. Wilcoxon tests on per-participant accuracy (graph &minus; list)
          favored the graph only for judging relative diversity across temperature (<i>p</i> = 0.012, <i>n</i> =
          36); the list led to higher accuracy on questions about one distribution and for two-prompt comparison (
          <i>p</i> = 0.009, <i>n</i> = 26; <i>p</i> = 0.002, <i>n</i> = 40). Preferences mirrored that
          split, and were pro-graph for diversity, more mixed or polarized on the other tasks.
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
          Our results point to a hybrid workflow: the graph supports structural, distribution-level questions (for example, relative diversity when temperature
          changes), but a plain list was often more accurate for reading one set of outputs closely or for comparing two
          prompts. Qualitative feedback from the evaluative studies mirrors that tradeoff: people valued the graph for
          spotting modes and repetition at a glance, and the list for scanning exact wording, with many asking for a way to
          move between the two. That pattern suggests distributional sensemaking is as much about choosing the right view
          for the task as it is about developing any one encoding in isolation.
        </p>
        <p>
          The same lesson shows up in our formative interviews (Sec.&nbsp;3 of the <a href="https://arxiv.org/pdf/2604.18724">paper</a>).
          Participants were not doing one generic open-ended task: they described goals such as curating synthetic
          data (e.g. reviews), eliciting diversity in ensembled reasoning models, creative writing, domain-specific and user-facing language (e.g. empathetic
          or medical-style help), and building or stress-testing whole systems, including coding and alignment
          workflows, and setups that intentionally elicit many distinct agents, experts, or strategies to see how
          they actually diverge. Each of these use cases comes with its own success criteria, failure modes, and data, so one-size-fits-all inspection is a poor fit. It will be interesting to see what
          interfaces, summaries, and companion tools we can build for this landscape of distributional needs.
        </p>
        <p>
          How well a structural visualization works also depends on the shape of the text itself. Merged paths are
          clearest when outputs align for long spans or repeatedly revisit the same templates; they become hard to read
          when many generations diverge early into long, heterogeneous text, sometimes producing a dense "hairball"
          layout. For the full treatment of these tradeoffs, follow-on questions, and limitations, see the discussion and "Limitations / Future
          Work" in our <a href="https://arxiv.org/pdf/2604.18724">paper</a> .
        </p>
      </section>

      <section className="article-below-scrolly" aria-label="Closing">
        <h2>What next?</h2>
        <p>
          This is one way of visualizing distributions of language model generations, but there are a variety of other directions to explore. Fork the <a href="https://github.com/EmilyReif/llm-consistency-vis">repo</a>, or reach out to us at <a href="mailto:emreif@cs.washington.edu">emreif@cs.washington.edu</a> if you're interested in collaborating!
        </p>
      </section>

      <section className="article-below-scrolly article-acknowledgements" aria-label="Acknowledgements">
        <h2>Acknowledgements</h2>
        <p>
          We thank members of the Interactive Data Lab, especially Madeleine Grunde-McLaughlin, Hyeok Kim, and Ameya Patil,
          as well as Noah's ARK Lab, and Adam Pearce, Martin Wattenberg, and Fernanda Vi&eacute;gas for their valuable
          feedback and discussions. Emily Reif is supported by the Amazon AI PhD Fellowship. This material is based upon
          work supported by the National Science Foundation under Award No. 2413244.
        </p>
      </section>
      </div>
    </>
  );
}
