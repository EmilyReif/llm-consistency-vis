import React, { useState } from 'react';
import { getEmbeddings } from './embed';
import { cosineSimilarity } from 'fast-cosine-similarity';
import { stripWhitespaceAndPunctuation } from './utils';
import { examplesOrig } from './cached_data/examples';
import { examplesNoveltyBench } from './cached_data/novelty_bench';
import { examplesQalign } from './cached_data/qalign';
import { exampleOlmoTrace } from './cached_data/examples_olmo_trace';
import { examplesUserStudyMonsters } from './cached_data/examples_user_study_monsters';
import { examplesUserStudyPlaces } from './cached_data/examples_user_study_places';
import { examplesPresidents } from './cached_data/presidents';

function safeCosineSimilarity(a: number[], b: number[]): number {
    const isZero = (v: number[]) => !v?.length || v.every((x) => x === 0);
    if (isZero(a) && isZero(b)) return 0;
    if (isZero(a) || isZero(b)) return 0;
    return cosineSimilarity(a, b);
}

// All prompts from all datasets (combined, deduped by key)
const ALL_DATASETS: { [key: string]: string[] }[] = [
  examplesOrig,
  examplesNoveltyBench,
  examplesQalign,
  exampleOlmoTrace,
  examplesUserStudyMonsters,
  examplesUserStudyPlaces,
  examplesPresidents,
];

// All prompts + map from prompt -> generations (first dataset that has it)
const { allPrompts, promptToGenerations }: { allPrompts: string[]; promptToGenerations: Map<string, string[]> } = (() => {
  const seen = new Set<string>();
  const promptToGens = new Map<string, string[]>();
  for (const ds of ALL_DATASETS) {
    for (const [p, gens] of Object.entries(ds)) {
      if (!seen.has(p)) {
        seen.add(p);
        promptToGens.set(p, gens);
      }
    }
  }
  return { allPrompts: Array.from(seen).sort(), promptToGenerations: promptToGens };
})();

// Word-level Jaccard: |A ∩ B| / |A ∪ B|
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(stripWhitespaceAndPunctuation(a).split(/\s+/).filter(Boolean));
  const wordsB = new Set(stripWhitespaceAndPunctuation(b).split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

// Levenshtein distance
function levenshteinDistance(str1: string, str2: string): number {
  if (!str1) return str2 ? str2.length : 0;
  if (!str2) return str1.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      matrix[i][j] =
        str2[i - 1] === str1[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[str2.length][str1.length];
}

// Levenshtein-based similarity (0–1)
function levenshteinSimilarity(a: string, b: string): number {
  const c1 = stripWhitespaceAndPunctuation(a);
  const c2 = stripWhitespaceAndPunctuation(b);
  if (!c1 || !c2) return 0;
  const dist = levenshteinDistance(c1, c2);
  const maxLen = Math.max(c1.length, c2.length);
  return 1 - dist / maxLen;
}

// Word-level Dice: 2|A ∩ B| / (|A| + |B|)
function diceSimilarity(a: string, b: string): number {
  const wordsA = stripWhitespaceAndPunctuation(a).split(/\s+/).filter(Boolean);
  const wordsB = stripWhitespaceAndPunctuation(b).split(/\s+/).filter(Boolean);
  if (wordsA.length === 0 && wordsB.length === 0) return 1;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  let intersection = 0;
  for (const w of wordsA) {
    if (setB.has(w)) intersection++;
  }
  return (2 * intersection) / (wordsA.length + wordsB.length);
}

export type SimilarityResult = { name: string; value: number; timeMs: number };

export default function TestCosSimPage() {
  const [selectedPrompt, setSelectedPrompt] = useState<string>(allPrompts[0] ?? '');
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const generations = promptToGenerations.get(selectedPrompt) ?? [];
  const [results, setResults] = useState<SimilarityResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    if (!textA.trim() || !textB.trim()) {
      setError('Both text boxes must be non-empty.');
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    const out: SimilarityResult[] = [];

    try {
      // Jaccard (sync)
      let t0 = performance.now();
      const jaccard = jaccardSimilarity(textA, textB);
      out.push({ name: 'Jaccard (word)', value: jaccard, timeMs: performance.now() - t0 });

      // Dice (sync)
      t0 = performance.now();
      const dice = diceSimilarity(textA, textB);
      out.push({ name: 'Dice (word)', value: dice, timeMs: performance.now() - t0 });

      // Levenshtein (sync)
      t0 = performance.now();
      const lev = levenshteinSimilarity(textA, textB);
      out.push({ name: 'Levenshtein', value: lev, timeMs: performance.now() - t0 });

      // Cosine (async)
      t0 = performance.now();
      const [embA, embB] = await Promise.all([getEmbeddings(textA), getEmbeddings(textB)]);
      const cos = safeCosineSimilarity(embA, embB);
      out.push({ name: 'Cosine (embedding)', value: cos, timeMs: performance.now() - t0 });

      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ margin: '20px auto', padding: 20, fontFamily: 'sans-serif', maxWidth: 1200 }}>
      <h1>Text Similarity Tester</h1>

      <div style={{ display: 'flex', gap: 24, marginTop: 16, alignItems: 'flex-start' }}>
        {/* Left: text inputs */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="prompt-select" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Select prompt
            </label>
            <select
              id="prompt-select"
              value={selectedPrompt}
              onChange={(e) => setSelectedPrompt(e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid #ccc',
              }}
            >
              {allPrompts.map((p) => (
                <option key={p} value={p}>
                  {p.slice(0, 80)}{p.length > 80 ? '...' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Generations from selected prompt (copy from here):</div>
            <textarea
              readOnly
              value={
                generations.length === 0
                  ? '(No generations)'
                  : generations.map((g, i) => `${i + 1}. ${g}`).join('\n\n')
              }
              style={{
                width: '100%',
                minHeight: 280,
                maxHeight: 400,
                padding: 8,
                fontSize: 14,
                fontFamily: 'inherit',
                border: '1px solid #ddd',
                borderRadius: 4,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="text-a" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Text A
            </label>
            <textarea
              id="text-a"
              value={textA}
              onChange={(e) => setTextA(e.target.value)}
              placeholder="Paste or type first string..."
              rows={4}
              style={{
                width: '100%',
                padding: 8,
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid #ccc',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="text-b" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Text B
            </label>
            <textarea
              id="text-b"
              value={textB}
              onChange={(e) => setTextB(e.target.value)}
              placeholder="Paste or type second string..."
              rows={4}
              style={{
                width: '100%',
                padding: 8,
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid #ccc',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              background: loading ? '#999' : '#1976d2',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Computing...' : 'Calculate similarities'}
          </button>

          {error && (
            <div style={{ marginTop: 16, padding: 12, background: '#ffebee', color: '#c62828', borderRadius: 4 }}>
              {error}
            </div>
          )}
        </div>

        {/* Right: similarities */}
        <div style={{ flex: '0 0 320px' }}>
          {results !== null && !error ? (
            <div style={{ position: 'sticky', top: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Similarities</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#e8f5e9', borderRadius: 4, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: '#c8e6c9' }}>
                    <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #a5d6a7' }}>Measure</th>
                    <th style={{ padding: 8, textAlign: 'right', borderBottom: '1px solid #a5d6a7' }}>Similarity</th>
                    <th style={{ padding: 8, textAlign: 'right', borderBottom: '1px solid #a5d6a7' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} style={{ borderBottom: i < results.length - 1 ? '1px solid #a5d6a7' : undefined }}>
                      <td style={{ padding: 8 }}>{r.name}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{r.value.toFixed(6)}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>
                        {r.timeMs < 1 ? '<1' : r.timeMs.toFixed(1)} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 16, background: '#f5f5f5', borderRadius: 4, color: '#666', fontSize: 14 }}>
              Enter text in both boxes and click &quot;Calculate similarities&quot; to see results here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
