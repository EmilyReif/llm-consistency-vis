/** Mirrors main app wordgraph types; local to interactive_article. */

export type TokenizeMode = 'space' | 'comma' | 'sentence';

export interface OrigSentenceInfo {
  sentIdx: number;
  wordIdx: number;
  origWords: string[];
}

export interface NodeDatum {
  word: string;
  count: number;
  origSentIndices: number[];
  origPromptIds?: string[];
  origSentenceInfo?: OrigSentenceInfo[];
  children: NodeDatum[];
  parents: NodeDatum[];
  isEnd?: boolean;
  isRoot?: boolean;
  fontSize: number;
  textLength: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rx: number;
  ry: number;
}

export interface LinkDatum {
  source: NodeDatum;
  target: NodeDatum;
  promptId?: string;
  sentIdx: number;
}
