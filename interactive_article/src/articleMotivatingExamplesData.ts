/**
 * Article motivating-example completions (bundled copy of main app caches).
 * Data lives in `motivatingExamplesBundled.ts`; regenerate when repo caches change.
 */
import {
  GREEK_DEITY_TEMP_02_GENERATIONS,
  GREEK_DEITY_TEMP_09_GENERATIONS,
} from './greekDeityTemperatureBundled';
import { JOKE_GPT_35_TURBO_GENERATIONS, JOKE_GPT_4O_GENERATIONS } from './jokeModelCompareBundled';
import {
  BAUDELAIRE_TRANSLATION_GENERATIONS,
  GREEK_DEITY_GENERATIONS,
  HAIKU_SNOW_GENERATIONS,
  OBAMA_SUMMARY_GENERATIONS,
  RANDOM_NUMBERS_GENERATIONS,
  TRUMP_SUMMARY_GENERATIONS,
} from './motivatingExamplesBundled';

export const PROMPT_HAIKU = 'Write me a haiku about snow';
export const PROMPT_RANDOM = 'Give me 10 random numbers between 1 and 100';
export const PROMPT_TRUMP = 'Summarize the Trump presidency in one sentence';
export const PROMPT_OBAMA = 'Summarize the Obama presidency in one sentence';

export function getGreekDeityGenerations(): string[] {
  return GREEK_DEITY_GENERATIONS;
}

export function getBaudelaireGenerations(): string[] {
  return BAUDELAIRE_TRANSLATION_GENERATIONS;
}

export function getHaikuGenerations(): string[] {
  return HAIKU_SNOW_GENERATIONS;
}

export function getRandomNumbersGenerations(): string[] {
  return RANDOM_NUMBERS_GENERATIONS;
}

export function getTrumpSummaries(): string[] {
  return TRUMP_SUMMARY_GENERATIONS;
}

export function getObamaSummaries(): string[] {
  return OBAMA_SUMMARY_GENERATIONS;
}

export function getGreekDeityTemp02Generations(): string[] {
  return GREEK_DEITY_TEMP_02_GENERATIONS;
}

export function getGreekDeityTemp09Generations(): string[] {
  return GREEK_DEITY_TEMP_09_GENERATIONS;
}

export function getJokeGpt4oGenerations(): string[] {
  return JOKE_GPT_4O_GENERATIONS;
}

export function getJokeGpt35TurboGenerations(): string[] {
  return JOKE_GPT_35_TURBO_GENERATIONS;
}

export const DISPLAY_QUOTE_GREEK = 'What is a deity from Greek mythology?';
/** Same text as the key in `src/cached_data/examples.tsx` (full stanza, no truncation). */
export const DISPLAY_QUOTE_BAUDELAIRE =
  'Translate this to English: "Du temps que la Nature en sa verve puissante Concevait chaque jour des enfants monstrueux, J\'eusse aimé vivre auprès d\'une jeune géante, Comme aux pieds d\'une reine un chat voluptueux."';
export const DISPLAY_QUOTE_HAIKU = PROMPT_HAIKU;
export const DISPLAY_QUOTE_RANDOM = PROMPT_RANDOM;
export const DISPLAY_QUOTE_PRESIDENTS =
  'Summarize the Trump presidency vs. the Obama presidency in one sentence.';
/** Floating card copy for the temperature comparison figure (prompt text matches the bundled generations). */
export const DISPLAY_QUOTE_GREEK_TEMP_COMPARE =
  'Same model and prompt at different temperatures: What is a deity from Greek mythology?';
export const DISPLAY_QUOTE_JOKE_MODEL_COMPARE =
  'Same prompt on two models (GPT-4o vs. GPT-3.5-turbo): Tell me a joke.';
