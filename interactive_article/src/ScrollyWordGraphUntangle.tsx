/**
 * Minimal word-graph for the article scrolly: behavior driven only by `keyframe` (2–4).
 * Precomputes merged graph + force layout off-screen in memory, then renders list → graph.
 * Full interactive version: `ExamplesWordGraphUntangle`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import './single_example_wordgraph.css';
import * as utils from './lib/articleUtils';
import * as color_utils from './lib/articleColorUtils';
import { ellipseForce } from './lib/force_collide_ellipse';
import { getNodeColor } from './lib/articleColorUtils';
import { TokenizeMode, NodeDatum, LinkDatum } from './lib/graphTypes';
import {
  SCROLLY_GENERATIONS,
  SCROLLY_FIRST_OUTPUT_FIRST_LINE_WORDS,
} from './scrollyData';
import { wordGraphZoomEventFilter } from './lib/wordGraphZoomArm';

const PROMPT_ID = 'scrolly-bio';
const SIMILARITY = 0.7;
const SPREAD = 0.5;
const TOKENIZE: TokenizeMode = 'space';
const LIST_FONT_PX = 14;
const WORDS_PER_CHUNK = 5;
const MARGIN_L = 14;
const MARGIN_T = 30;
const MARGIN_B = 60;
/** Vertical spacing between completion rows in list (1D) mode inside the graph SVG. */
const ROW_SPACING = 32;
const REF_ROW_W = 500;
/** Match `GAP_PX_1D` in `ExamplesWordGraphUntangle` (1D list token spacing). */
const LIST_GAP = 4;
const GRAPH_THRESHOLD = 1;
const INTERACT_THRESHOLD = 0.7;
const PX_FALLBACK = 2;
const TOKEN_STEP_MS = 115;
const TOKEN_INIT_MS = 350;
const ROW_STEP_MS = 90;
const ROW_INIT_MS = 280;
const GRAPH_HOLD_MS = 900;
const UNTANGLE_MS = 1100;
/** Single text/link color in list (exploded) mode; graph uses frequency-based colors once interp reaches 1. */
const LIST_LINE_TEXT = '#1e293b';
const LIST_LINE_LINK = '#64748b';

export type ScrollyKeyframe = 2 | 3 | 4;

interface NodeInst1D {
  node: NodeDatum;
  sentIdx: number;
  pathIndex: number;
  x: number;
  y: number;
  origWord: string;
}

interface Link1D {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

type NodeViz = NodeDatum | (NodeInst1D & { word: string });

interface Props {
  keyframe: ScrollyKeyframe;
  svgId: string;
  className?: string;
  /** After graph→list reverse morph (scroll up from graph beat). */
  onReverseMorphComplete?: () => void;
  /**
   * Scrolly keyframe 3: parent drives how many completion rows are visible (line-by-line reveal in SVG list mode).
   * When set, internal row timers for keyframe 3 are skipped.
   */
  listRowsControlled?: boolean;
  /** 1-based number of rows to show in list mode; ignored unless `listRowsControlled`. */
  visibleListRowCount?: number;
}

interface Scene {
  tokenIdx: number;
  rowIdx: number;
  interp: number;
  /** Drives visibility during intro; untangle = full list then morph to graph (interp 0→1). */
  phase: 'tokens' | 'rows' | 'untangle';
}

interface BuiltModel {
  nodesData: NodeDatum[];
  linksData: LinkDatum[];
  instances1D: NodeInst1D[];
  link1D: Map<LinkDatum, Link1D>;
  /** Full-graph layout snapshot; used to restore after node multi-select / “isolate” layout. */
  nodeInitialXY: Map<NodeDatum, { x: number; y: number }>;
  width: number;
  height: number;
  nRows: number;
  firstLineSteps: number;
  opacityScale: d3.ScalePower<number, number>;
  getLinkEp: (d: LinkDatum) => {
    sourceX: number;
    targetX: number;
    y1: number;
    y2: number;
    sourceRightX: number;
    targetLeftX: number;
  };
}

function promptGroupsAll() {
  return [{ promptId: PROMPT_ID, generations: SCROLLY_GENERATIONS }];
}

function measureTextWidth(text: string, fontSize: number): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return (text ?? '').length * PX_FALLBACK;
  ctx.font = `${fontSize}px monospace`;
  return ctx.measureText((text ?? '').replace(/^##/, '')).width;
}

function chunksForNode(word: string): string[] {
  const s = (utils.unformat(word) ?? word ?? '').toString();
  const words = s.split(/\s+/).filter((w) => w.length > 0);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    out.push(words.slice(i, i + WORDS_PER_CHUNK).join(' '));
  }
  return out.length ? out : [''];
}

function textLen(node: NodeDatum): number {
  const ch = chunksForNode(node.word);
  return d3.max(ch.map((c) => c.length * node.fontSize * 0.6)) ?? 0;
}

function textH(node: NodeDatum): number {
  return chunksForNode(node.word).length * node.fontSize;
}

function scaleToPx(xN: number, yRow: number) {
  return { x: MARGIN_L + xN * REF_ROW_W, y: MARGIN_T + yRow * ROW_SPACING };
}

function getExpectedX(d: NodeDatum, nodesData: NodeDatum[]): number {
  const pad = 30;
  const parents = d.parents.filter((p) => nodesData.includes(p));
  if (d.isRoot && !parents.length) return pad;
  if (!parents.length) return d.x;
  const parentLefts = parents.map((p) => p.x + p.textLength + pad);
  const min = d3.min(parentLefts) ?? 0;
  const max = d3.max(parentLefts) ?? 0;
  const mean = d3.mean(parentLefts) ?? 0;
  return d3.scaleLinear().domain([0, 0.5, 1]).range([min, mean, max])(SPREAD);
}

function build1D(
  linksData: LinkDatum[],
  promptGroups: ReturnType<typeof promptGroupsAll>
): { instances1D: NodeInst1D[]; link1D: Map<LinkDatum, Link1D> } {
  const instances1D: NodeInst1D[] = [];
  const link1D = new Map<LinkDatum, Link1D>();
  if (!linksData.length) return { instances1D, link1D };

  const nRows = promptGroups.reduce((a, g) => a + g.generations.length, 0);
  const linksForSent = (s: number) => linksData.filter((d) => d.sentIdx === s);
  const pathsBySent = new Map<number, { path: NodeDatum[]; origWords: string[] }>();

  for (let sentIdx = 0; sentIdx < nRows; sentIdx++) {
    const links = linksForSent(sentIdx);
    if (!links.length) continue;
    const targets = new Set(links.map((d) => d.target));
    const root = links.find((d) => !targets.has(d.source))?.source;
    if (!root) continue;
    const linkMap = new Map<NodeDatum, NodeDatum>();
    links.forEach((d) => linkMap.set(d.source, d.target));
    const path: NodeDatum[] = [root];
    let cur = root;
    while (linkMap.has(cur)) {
      cur = linkMap.get(cur)!;
      path.push(cur);
    }
    const origWords = path.map((node) => {
      const info = node.origSentenceInfo?.find((oi) => oi.sentIdx === sentIdx);
      const raw = info ? info.origWords.join(' ') : '';
      return raw === ' ' || raw === '' ? '' : raw;
    });
    pathsBySent.set(sentIdx, { path, origWords });
  }

  const sentIdxs = [...pathsBySent.keys()].sort((a, b) => a - b);
  for (const sentIdx of sentIdxs) {
    const { path, origWords } = pathsBySent.get(sentIdx)!;
    const xPx: number[] = [];
    let cumul = 0;
    for (let i = 0; i < origWords.length; i++) {
      xPx.push(cumul);
      cumul +=
        measureTextWidth(origWords[i], LIST_FONT_PX) + (i < origWords.length - 1 ? LIST_GAP : 0);
    }
    const rowIndex = sentIdxs.indexOf(sentIdx);
    const xNorm = (v: number) => v / REF_ROW_W;
    for (let i = 0; i < path.length; i++) {
      instances1D.push({
        node: path[i],
        sentIdx,
        pathIndex: i,
        x: xNorm(xPx[i] ?? 0),
        y: rowIndex,
        origWord: origWords[i] ?? '',
      });
    }
    for (let i = 0; i < path.length - 1; i++) {
      const link = linksData.find(
        (d) => d.sentIdx === sentIdx && d.source === path[i] && d.target === path[i + 1]
      );
      if (link) {
        link1D.set(link, {
          sourceX: xNorm(xPx[i]),
          sourceY: rowIndex,
          targetX: xNorm(xPx[i + 1]),
          targetY: rowIndex,
        });
      }
    }
  }

  return { instances1D, link1D };
}

function runForce(nodesData: NodeDatum[], linksData: LinkDatum[], height: number): void {
  const sim = d3.forceSimulation(nodesData);
  sim
    .force('collide', ellipseForce(nodesData, 14, 5, 5))
    .force(
      'link',
      d3.forceLink(linksData).id((d: any) => d.word).strength(0.4)
    )
    .force(
      'y',
      d3.forceY(height / 2).strength((d: any) => Math.min(0.16, 0.06 + Math.sqrt(Math.max(1, d.count)) / 28))
    )
    .force('x', () => {
      nodesData.forEach((d) => (d.x = getExpectedX(d, nodesData)));
    });
  sim.stop();
  for (let i = 0; i < 1000; i++) sim.tick();
}

function linkIsInSentsForHighlight(
  d: LinkDatum,
  selected: Set<NodeDatum>,
  hoveredSent: number[] | null
): boolean {
  if (selected.size > 0) {
    return [...selected].some((node) => node.origSentIndices.includes(d.sentIdx));
  }
  return hoveredSent != null && hoveredSent.includes(d.sentIdx);
}

function nodeIsInHighlightedSents(
  d: NodeDatum,
  selected: Set<NodeDatum>,
  hoveredSent: number[] | null
): boolean {
  if (selected.size > 0) {
    const selectedSents = new Set<number>();
    [...selected].forEach((node) => {
      node.origSentIndices.forEach((s) => selectedSents.add(s));
    });
    return d.origSentIndices.some((s) => selectedSents.has(s));
  }
  if (!hoveredSent) return false;
  return d.origSentIndices.some((s) => hoveredSent.includes(s));
}

function applySelectionLayout(model: BuiltModel, selected: Set<NodeDatum>): void {
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const { nodesData, linksData, nodeInitialXY } = model;
  if (selected.size === 0) {
    nodeInitialXY.forEach((xy, n) => {
      n.x = xy.x;
      n.y = xy.y;
    });
    return;
  }
  const selectedLinks = linksData.filter((d) =>
    [...selected].some((node) => node.origSentIndices.includes(d.sentIdx))
  );
  const selectedNodes = nodesData.filter((d) => {
    const selectedSents = new Set<number>();
    [...selected].forEach((node) => {
      node.origSentIndices.forEach((s) => selectedSents.add(s));
    });
    return d.origSentIndices.some((s) => selectedSents.has(s));
  });
  runForce(selectedNodes, selectedLinks, viewportH);
}

async function buildModel(): Promise<BuiltModel> {
  const promptGroups = promptGroupsAll();
  const { nodesData, linksData } = await utils.createGraphDataFromPromptGroups(
    promptGroups,
    SIMILARITY,
    false,
    TOKENIZE,
    false
  );
  const totalGen = promptGroups.reduce((a, g) => a + g.generations.length, 0);
  const fontScale = d3
    .scaleLinear()
    .domain([1, Math.max(2, totalGen)])
    .range([11, 30])
    .clamp(true);
  const opacityScale = d3
    .scalePow()
    .exponent(0.6)
    .domain([1, totalGen])
    .range([0.6, 1])
    .clamp(true);

  nodesData.forEach((n) => {
    n.fontSize = fontScale(n.count);
    n.textLength = textLen(n);
  });
  nodesData.forEach((n) => {
    n.rx = n.textLength / 2;
    n.ry = textH(n) / 2;
  });

  const { instances1D, link1D } = build1D(linksData, promptGroups);
  const nRows = totalGen;
  const minH1D = nRows > 1 ? MARGIN_T + MARGIN_B + (nRows - 1) * ROW_SPACING : 640;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  let height = Math.max(viewportH, minH1D);
  const width = Math.min(window.innerWidth, 5000);

  runForce(nodesData, linksData, Math.min(height, viewportH));
  height = viewportH;

  const row0Count = instances1D.filter((i) => i.sentIdx === 0).length;
  const firstLineSteps = Math.min(row0Count, SCROLLY_FIRST_OUTPUT_FIRST_LINE_WORDS);

  const getLinkEp = (d: LinkDatum) => {
    const getY = (node: NodeDatum) => {
      const lineHeight = 0.75;
      const pct =
        node.origSentIndices?.length ?
          [...node.origSentIndices].indexOf(d.sentIdx) / node.origSentIndices.length
        : 0;
      return node.y + (pct - lineHeight) * node.fontSize;
    };
    const lr = (node: NodeDatum) => {
      const leftX = node.x;
      const rightX = leftX + node.textLength;
      const cx = (leftX + rightX) / 2;
      return [leftX, rightX, cx] as const;
    };
    const [sl, sr, sc] = lr(d.source);
    const [tl, tr, tc] = lr(d.target);
    const sourceX = d.source?.isRoot ? sl : sc;
    const targetX = d.target.isEnd ? tr : tc;
    return { sourceX, targetX, y1: getY(d.source), y2: getY(d.target), sourceRightX: sr, targetLeftX: tl };
  };

  const nodeInitialXY = new Map<NodeDatum, { x: number; y: number }>();
  for (const n of nodesData) {
    nodeInitialXY.set(n, { x: n.x, y: n.y });
  }

  return {
    nodesData,
    linksData,
    instances1D,
    link1D,
    nodeInitialXY,
    width,
    height,
    nRows,
    firstLineSteps,
    opacityScale,
    getLinkEp,
  };
}

let scrollyGraphModelPromise: Promise<BuiltModel> | null = null;

/** Call when the user enters the scrolly block so graph data is ready by the graph beat. */
export function prefetchScrollyWordGraphModel(): Promise<BuiltModel> {
  if (!scrollyGraphModelPromise) {
    scrollyGraphModelPromise = buildModel();
  }
  return scrollyGraphModelPromise;
}

function getNode(d: NodeViz): NodeDatum {
  return 'pathIndex' in d && 'node' in d ? (d as NodeInst1D & { word: string }).node : (d as NodeDatum);
}

/** Graph `node.word` is an internal token key (e.g. `Name:` + sentIdx + idx → `Name:10`); show original text. */
function graphDisplayLabel(node: NodeDatum): string {
  const u = utils.unformat(node.word);
  if (u != null && String(u).trim().length > 0) return String(u);
  const parts = node.origSentenceInfo?.flatMap((o) => o.origWords) ?? [];
  if (parts.length) return parts.join(' ');
  return node.word;
}

function avg1d(node: NodeDatum, inst: NodeInst1D[]): { x: number; y: number } | null {
  const slice = inst.filter((i) => i.node === node);
  if (!slice.length) return null;
  return {
    x: d3.mean(slice, (i) => i.x) ?? 0,
    y: d3.mean(slice, (i) => i.y) ?? 0,
  };
}

export default function ScrollyWordGraphUntangle({
  keyframe,
  svgId,
  className,
  onReverseMorphComplete,
  listRowsControlled = false,
  visibleListRowCount = 1,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const modelRef = useRef<BuiltModel | null>(null);
  const mainRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const sceneRef = useRef<Scene>({ tokenIdx: -1, rowIdx: -1, interp: 0, phase: 'tokens' });
  const prevKeyframeAnimRef = useRef<ScrollyKeyframe | null>(null);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  /** Waits for D3 bootstrap (`mainRef`) so the untangle sequencer never no-ops if effects order poorly */
  const deferBootstrapRafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const bootedRef = useRef(false);
  const selectedNodesRef = useRef<Set<NodeDatum>>(new Set());
  const hoveredNodeRef = useRef<NodeDatum | null>(null);
  const hoveredSentRef = useRef<number[] | null>(null);
  /** Wheel + pan zoom only after explicit click; reset on mouse leave (see article UX). */
  const mapZoomArmedRef = useRef(false);
  const [mapZoomArmed, setMapZoomArmed] = useState(false);
  const [vizPointerInside, setVizPointerInside] = useState(false);

  const disarmMapZoom = useCallback(() => {
    mapZoomArmedRef.current = false;
    setMapZoomArmed(false);
  }, []);

  const clearAnim = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (deferBootstrapRafRef.current != null) cancelAnimationFrame(deferBootstrapRafRef.current);
    deferBootstrapRafRef.current = null;
  }, []);

  const draw = useCallback(() => {
    const model = modelRef.current;
    if (!model || !mainRef.current) return;

    const scene = sceneRef.current;
    const { interp, phase } = scene;
    const isUntangled = interp < INTERACT_THRESHOLD;
    const useCollapsed = interp >= GRAPH_THRESHOLD || model.instances1D.length === 0;
    const graphColored = interp >= GRAPH_THRESHOLD;
    /** 0 = list palette, 1 = graph palette/opacity; ramps during untangle with positions */
    const styleBlendT = phase === 'untangle' ? interp : graphColored ? 1 : 0;
    /** List rows + morph: show edges at full graph opacity (gradient stops), not a separate fade-in. */
    const edgeLayoutStrength = phase === 'untangle' || phase === 'rows' ? 1 : 0;
    const main = mainRef.current;
    const graphInteract = !isUntangled;

    const isLinkForBlur = (x: LinkDatum | NodeViz): x is LinkDatum =>
      x != null && typeof x === 'object' && 'source' in x && 'target' in x;

    const getBlur = (d: LinkDatum | NodeViz): string => {
      const sel = selectedNodesRef.current;
      const hs = hoveredSentRef.current;
      const blurFn = (opacity: number) => `blur(2px) opacity(${opacity})`;
      const inSents = isLinkForBlur(d)
        ? linkIsInSentsForHighlight(d, sel, hs)
        : nodeIsInHighlightedSents(getNode(d as NodeViz), sel, hs);
      if (sel.size === 0 && !hs) return '';
      if (sel.size > 0) return !inSents ? blurFn(0.2) : '';
      if (hs) return '';
      return '';
    };

    const nodeFill = (d: NodeViz) => {
      const n = getNode(d);
      if (styleBlendT <= 0) return LIST_LINE_TEXT;
      return d3.interpolateRgb(LIST_LINE_TEXT, getNodeColor(n, model.linksData))(styleBlendT);
    };

    const nodeOpacityBlended = (d: NodeViz) => {
      const n = getNode(d);
      if (!n.word) return 0;
      let gate: number;
      if (!useCollapsed) {
        gate = visInst(d as NodeInst1D & { word: string }) ? 1 : 0;
      } else {
        gate =
          phase === 'untangle' || graphColored ? 1
          : opacityNode(n) > 0 ? 1
          : 0;
      }
      const t = Math.min(1, styleBlendT);
      const co = model.opacityScale(n.count);
      return gate * (1 - t + t * co);
    };

    const visInst = (i: NodeInst1D) => {
      if (phase === 'untangle') return true;
      if (phase === 'tokens') return i.sentIdx === 0 && i.pathIndex <= scene.tokenIdx;
      return i.sentIdx <= scene.rowIdx;
    };

    const opacityNode = (n: NodeDatum): number => {
      if (!n.word) return 0;
      if (graphColored) {
        return model.opacityScale(n.count);
      }
      if (phase === 'untangle') {
        return 1;
      }
      if (phase === 'tokens') {
        const ok = model.instances1D.some(
          (x) => x.node === n && x.sentIdx === 0 && x.pathIndex <= scene.tokenIdx
        );
        return ok ? 1 : 0;
      }
      const ok = n.origSentIndices?.some((s) => s <= scene.rowIdx) ?? false;
      return ok ? 1 : 0;
    };

    const linkOpaq = (d: LinkDatum): number => {
      if (phase === 'tokens') {
        if (d.sentIdx !== 0) return 0;
        const src = model.instances1D.find((x) => x.node === d.source && x.sentIdx === 0);
        const tg = model.instances1D.find((x) => x.node === d.target && x.sentIdx === 0);
        if (!src || !tg) return 0;
        if (src.pathIndex > scene.tokenIdx || tg.pathIndex > scene.tokenIdx) return 0;
      }
      if (phase === 'rows' && d.sentIdx > scene.rowIdx) return 0;
      const so = opacityNode(d.source);
      const to = opacityNode(d.target);
      if (!so || !to) return 0;
      return ((so + to) / 2) * 0.25;
    };

    const linkPathD = (d: LinkDatum) => {
      const ep = model.getLinkEp(d);
      let sx = ep.sourceX,
        tx = ep.targetX,
        y1 = ep.y1,
        y2 = ep.y2,
        srx = ep.sourceRightX,
        tlx = ep.targetLeftX;
      const e1 = model.link1D.get(d);
      if (e1) {
        const pS = scaleToPx(e1.sourceX, e1.sourceY);
        const pT = scaleToPx(e1.targetX, e1.targetY);
        sx = interp * ep.sourceX + (1 - interp) * pS.x;
        tx = interp * ep.targetX + (1 - interp) * pT.x;
        y1 = interp * ep.y1 + (1 - interp) * pS.y;
        y2 = interp * ep.y2 + (1 - interp) * pT.y;
        srx = interp * ep.sourceRightX + (1 - interp) * pS.x;
        tlx = interp * ep.targetLeftX + (1 - interp) * pT.x;
      }
      const pts = [
        { x: sx, y: y1 },
        { x: srx, y: y1 },
        { x: tlx, y: y2 },
        { x: tx, y: y2 },
      ];
      const horiz = Math.abs(srx - tlx);
      const vert = Math.abs(y1 - y2);
      const linear = vert < 2 || (horiz > 1 && vert / (horiz || 1) < 0.05);
      return d3
        .line<{ x: number; y: number }>()
        .x((p) => p.x)
        .y((p) => p.y)
        .curve(linear ? d3.curveLinear : d3.curveMonotoneY)(pts);
    };

    const nodeData: NodeViz[] = useCollapsed ?
        model.nodesData.filter(Boolean)
      : model.instances1D
          .filter((ni) => ni?.node)
          .map((ni) => ({ ...ni, word: ni.origWord }));

    const keyFn = (d: NodeViz) =>
      'pathIndex' in d ?
        `${(d as NodeInst1D).sentIdx}-${(d as NodeInst1D).pathIndex}-${getNode(d).word}`
      : getNode(d).word;

    const xf = (d: NodeViz): string => {
      const node = getNode(d);
      if (!useCollapsed && 'pathIndex' in d) {
        const ni = d as NodeInst1D & { word: string };
        const p = scaleToPx(ni.x, ni.y);
        return `translate(${interp * node.x + (1 - interp) * p.x},${interp * node.y + (1 - interp) * p.y})`;
      }
      const ag = avg1d(node, model.instances1D);
      if (ag && interp < 1) {
        const p = scaleToPx(ag.x, ag.y);
        return `translate(${interp * node.x + (1 - interp) * p.x},${interp * node.y + (1 - interp) * p.y})`;
      }
      return `translate(${node.x},${node.y})`;
    };

    const nodeJoin = main.selectAll<SVGGElement, NodeViz>('g.node').data(nodeData, keyFn);
    const ent = nodeJoin.enter().append('g').attr('class', 'node');
    ent.append('text').attr('text-anchor', 'start');
    const merged = ent.merge(nodeJoin);
    merged
      .on('mouseover', (_e, d) => {
        if (!graphInteract) return;
        hoveredNodeRef.current = getNode(d);
        hoveredSentRef.current = [...getNode(d).origSentIndices];
        drawRef.current();
      })
      .on('mouseout', () => {
        if (!graphInteract) return;
        hoveredNodeRef.current = null;
        hoveredSentRef.current = null;
        drawRef.current();
      })
      .on('click', (e, d) => {
        if (!graphInteract) return;
        if (!mapZoomArmedRef.current) {
          mapZoomArmedRef.current = true;
          setMapZoomArmed(true);
        }
        e.stopPropagation();
        const n = getNode(d);
        const sel = selectedNodesRef.current;
        if (sel.size > 0 && !nodeIsInHighlightedSents(n, sel, null)) return;
        if (sel.has(n)) {
          sel.delete(n);
        } else {
          sel.add(n);
        }
        hoveredNodeRef.current = null;
        hoveredSentRef.current = null;
        applySelectionLayout(model, sel);
        drawRef.current();
      });
    merged.sort((a, b) => {
      const na = getNode(a);
      const nb = getNode(b);
      return (
        (selectedNodesRef.current.has(na) ? 1 : 0) -
        (selectedNodesRef.current.has(nb) ? 1 : 0)
      );
    });
    merged.attr('transform', xf);
    merged.attr('fill', nodeFill).style('opacity', nodeOpacityBlended);
    merged
      .style('font-weight', (d) => {
        if (isUntangled) return 'normal';
        const n = getNode(d);
        return selectedNodesRef.current.has(n) || hoveredNodeRef.current === n ? 'bold' : 'normal';
      })
      .style('filter', (d) => getBlur(d))
      .style('pointer-events', graphInteract ? 'auto' : 'none')
      .style('cursor', graphInteract ? 'pointer' : 'default');
    merged
      .select('text')
      .style('pointer-events', graphInteract ? 'all' : 'none')
      .attr('fill', nodeFill)
      .attr('font-size', (d) => {
        const node = getNode(d);
        if (phase === 'untangle' && !useCollapsed) {
          return LIST_FONT_PX + interp * (node.fontSize - LIST_FONT_PX);
        }
        return useCollapsed ? node.fontSize : LIST_FONT_PX;
      })
      .each(function (d: NodeViz) {
        const t = d3.select(this);
        const label = useCollapsed ? graphDisplayLabel(getNode(d)) : (d as NodeInst1D & { word: string }).origWord;
        t.text(null);
        t.append('tspan').attr('x', 0).attr('dy', 0).text(label);
      });
    nodeJoin.exit().remove();

    const linksSel = main.selectAll<SVGGElement, LinkDatum>('g.link').data(model.linksData);
    const linkPointer = isUntangled || edgeLayoutStrength <= 0.02 ? 'none' : 'auto';
    linksSel
      .on('mouseover', (_e, d) => {
        if (!graphInteract) return;
        hoveredNodeRef.current = null;
        hoveredSentRef.current = [d.sentIdx];
        drawRef.current();
      })
      .on('mouseout', () => {
        if (!graphInteract) return;
        hoveredSentRef.current = null;
        drawRef.current();
      })
      .style('opacity', edgeLayoutStrength)
      .style('pointer-events', linkPointer)
      .style('cursor', graphInteract ? 'pointer' : 'default');
    const useGraphEdgeStyle = graphColored || phase === 'rows' || phase === 'untangle';
    linksSel
      .select<SVGPathElement>('path.link-visible')
      .attr('d', (d) => linkPathD(d))
      .attr('stroke', (d, i) => (useGraphEdgeStyle ? `url(#scrolly-grad-${i})` : LIST_LINE_LINK))
      .attr('stroke-opacity', (d) => {
        if (linkOpaq(d) <= 0) return 0;
        if (graphColored || phase === 'rows' || phase === 'untangle') return 1;
        if (styleBlendT > 0.92) return Math.min(1, (styleBlendT - 0.92) / 0.08);
        return edgeLayoutStrength > 0 ? Math.min(0.9, linkOpaq(d) * 4) : 0;
      })
      .style('filter', (d) => getBlur(d));

    if ((useGraphEdgeStyle || styleBlendT > 0.85) && svgRef.current) {
      const mult = 0.2;
      const root = d3.select(svgRef.current);
      const gradOpaBoost = Math.min(1, Math.max(0, (styleBlendT - 0.85) / 0.15));
      /** Match collapsed graph: frequency-based stops, full strength for list + morph (no ramp-up). */
      const ramp = graphColored || phase === 'rows' || phase === 'untangle' ? 1 : gradOpaBoost;
      linksSel.each(function (d: LinkDatum, i: number) {
        const so = model.opacityScale(d.source.count);
        const to = model.opacityScale(d.target.count);
        root
          .select(`#scrolly-grad-${i}`)
          .selectAll('stop')
          .attr('stop-opacity', (_: unknown, j: number) => (j === 0 ? so : to) * mult * ramp);
      });
    }

  }, []);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  /** Keyframe 3 + scrolly: sync SVG list rows to parent `visibleListRowCount` (same geometry as graph list / morph). */
  useEffect(() => {
    if (!ready || !modelRef.current || !listRowsControlled || keyframe !== 3) return;
    let cancelled = false;
    const applyRows = () => {
      if (cancelled) return;
      if (!mainRef.current) {
        requestAnimationFrame(applyRows);
        return;
      }
      const m = modelRef.current!;
      const maxR = m.nRows - 1;
      const maxTok = Math.max(0, m.firstLineSteps - 1);
      const nShow = Math.max(1, Math.min(visibleListRowCount, m.nRows));
      sceneRef.current = {
        phase: 'rows',
        tokenIdx: maxTok,
        rowIdx: Math.min(nShow - 1, maxR),
        interp: 0,
      };
      drawRef.current();
    };
    requestAnimationFrame(applyRows);
    return () => {
      cancelled = true;
    };
  }, [ready, listRowsControlled, visibleListRowCount, keyframe]);

  const bootstrapSvg = useCallback(
    (model: BuiltModel) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const svg = d3.select(svgEl);
      svg.selectAll('*').remove();
      svg.attr('width', model.width).attr('height', model.height).style('cursor', 'grab');

      const root = svg.append('g').attr('class', 'scrolly-zoom-root');
      root
        .append('rect')
        .attr('class', 'scrolly-zoom-pan')
        .attr('width', model.width)
        .attr('height', model.height)
        .attr('fill', 'transparent')
        .style('cursor', 'grab')
        .attr('pointer-events', 'all');
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        // If this returns true on a node press, d3 calls stopPropagation — clicks never fire (hover still does).
        .filter((event) => wordGraphZoomEventFilter(event, mapZoomArmedRef.current))
        .scaleExtent([0.5, 3])
        .on('zoom', (e) => root.attr('transform', e.transform));
      svg.call(zoom as any).on('dblclick.zoom', null);

      svg.on('click', (event: MouseEvent) => {
        if (!mapZoomArmedRef.current) {
          mapZoomArmedRef.current = true;
          setMapZoomArmed(true);
        }
        const t = event.target as Element;
        if (t.closest('.node') || t.closest('.link')) return;
        if (
          selectedNodesRef.current.size > 0 ||
          hoveredNodeRef.current != null ||
          hoveredSentRef.current != null
        ) {
          selectedNodesRef.current.clear();
          hoveredNodeRef.current = null;
          hoveredSentRef.current = null;
          const m = modelRef.current;
          if (m) applySelectionLayout(m, selectedNodesRef.current);
          drawRef.current();
        }
      });

      const defs = svg.append('defs');
      model.linksData.forEach((d: LinkDatum, i: number) => {
        const stroke =
          color_utils.MILLER_STONE_COLORS[
            (d.promptId ? color_utils.getPromptIndexFromId(d.promptId) : 0) %
              color_utils.MILLER_STONE_COLORS.length
          ];
        const grad = defs
          .append('linearGradient')
          .attr('id', `scrolly-grad-${i}`)
          .attr('gradientUnits', 'objectBoundingBox');
        grad.append('stop').attr('offset', '0%').attr('stop-color', stroke).attr('stop-opacity', 0.2);
        grad.append('stop').attr('offset', '100%').attr('stop-color', stroke).attr('stop-opacity', 0.2);
      });

      const main = root
        .append('g')
        .attr('class', 'scrolly-main')
        .style('pointer-events', 'none');
      mainRef.current = main;

      const linkG = main
        .append('g')
        .attr('class', 'links')
        .style('pointer-events', 'none')
        .selectAll<SVGGElement, LinkDatum>('g')
        .data(model.linksData)
        .join('g')
        .attr('class', 'link');

      linkG
        .append('path')
        .attr('class', 'link-visible')
        .attr('fill', 'none')
        .attr('stroke-width', 2);
      linkG
        .append('path')
        .attr('class', 'link-hit')
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12);

      draw();
    },
    [draw]
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const m = await prefetchScrollyWordGraphModel();
        if (cancel) return;
        modelRef.current = m;
        setReady(true);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancel = true;
      clearAnim();
    };
  }, [clearAnim]);

  useEffect(() => {
    if (!ready || !modelRef.current || !svgRef.current || bootedRef.current) return;
    bootedRef.current = true;
    bootstrapSvg(modelRef.current);
    return () => {
      bootedRef.current = false;
      mainRef.current = null;
    };
  }, [ready, bootstrapSvg]);

  useEffect(() => {
    if (!ready || !modelRef.current) return;
    clearAnim();
    selectedNodesRef.current.clear();
    hoveredNodeRef.current = null;
    hoveredSentRef.current = null;
    applySelectionLayout(modelRef.current, selectedNodesRef.current);

    let cancelled = false;
    const m = modelRef.current;
    const prevKf = prevKeyframeAnimRef.current;
    prevKeyframeAnimRef.current = keyframe;

    const runReverseUntangle = () => {
      sceneRef.current.phase = 'untangle';
      sceneRef.current.tokenIdx = 1e9;
      sceneRef.current.rowIdx = 1e9;
      sceneRef.current.interp = 1;
      drawRef.current();
      const ease = (t: number) => t * (2 - t);
      const t0 = performance.now();
      const tick = () => {
        if (cancelled) return;
        const u = Math.min(1, (performance.now() - t0) / UNTANGLE_MS);
        sceneRef.current.interp = 1 - ease(u);
        drawRef.current();
        if (u < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          sceneRef.current.interp = 0;
          drawRef.current();
          onReverseMorphComplete?.();
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const startReverseFromGraph = () => {
      if (cancelled) return;
      if (!mainRef.current) {
        deferBootstrapRafRef.current = requestAnimationFrame(startReverseFromGraph);
        return;
      }
      deferBootstrapRafRef.current = null;
      runReverseUntangle();
    };

    if (keyframe === 3 && prevKf === 4) {
      deferBootstrapRafRef.current = requestAnimationFrame(startReverseFromGraph);
      return () => {
        cancelled = true;
        clearAnim();
      };
    }

    if (keyframe === 3 && listRowsControlled) {
      return () => {
        cancelled = true;
        clearAnim();
      };
    }

    const finishUntangle = () => {
      sceneRef.current.phase = 'untangle';
      sceneRef.current.tokenIdx = 1e9;
      sceneRef.current.rowIdx = 1e9;
      sceneRef.current.interp = 0;
      drawRef.current();
      const ease = (t: number) => t * (2 - t);
      timersRef.current.push(
        window.setTimeout(() => {
          const t0 = performance.now();
          const tick = () => {
            if (cancelled) return;
            const u = Math.min(1, (performance.now() - t0) / UNTANGLE_MS);
            sceneRef.current.interp = ease(u);
            drawRef.current();
            if (u < 1) {
              rafRef.current = requestAnimationFrame(tick);
            } else {
              sceneRef.current.interp = 1;
              drawRef.current();
            }
          };
          rafRef.current = requestAnimationFrame(tick);
        }, GRAPH_HOLD_MS)
      );
      /** Dev / StrictMode: if RAF stalls, still land on the collapsed graph */
      timersRef.current.push(
        window.setTimeout(() => {
          if (cancelled) return;
          if (sceneRef.current.interp < 1) {
            sceneRef.current.interp = 1;
            drawRef.current();
          }
        }, GRAPH_HOLD_MS + UNTANGLE_MS + 300)
      );
    };

    const runRows = (then: 'done' | 'untangle') => {
      sceneRef.current.phase = 'rows';
      const maxTok = Math.max(0, m.firstLineSteps - 1);
      sceneRef.current.tokenIdx = maxTok;
      const maxR = m.nRows - 1;
      sceneRef.current.rowIdx = 0;
      sceneRef.current.interp = 0;
      drawRef.current();

      let cur = 1;
      const step = () => {
        if (cancelled) return;
        if (cur > maxR) {
          if (then === 'untangle') finishUntangle();
          return;
        }
        sceneRef.current.rowIdx = cur;
        drawRef.current();
        cur++;
        if (cur <= maxR) {
          timersRef.current.push(window.setTimeout(step, ROW_STEP_MS));
        } else if (then === 'untangle') {
          finishUntangle();
        }
      };

      timersRef.current.push(window.setTimeout(step, ROW_INIT_MS));
    };

    const runTokens = (next: 'none' | 'rows-done' | 'rows-untangle') => {
      sceneRef.current.phase = 'tokens';
      sceneRef.current.rowIdx = -1;
      sceneRef.current.interp = 0;
      const max = Math.max(0, m.firstLineSteps - 1);
      let cur = -1;
      const stepTok = () => {
        if (cancelled) return;
        if (cur > max) return;
        sceneRef.current.tokenIdx = cur;
        drawRef.current();
        cur++;
        if (cur <= max) {
          timersRef.current.push(window.setTimeout(stepTok, TOKEN_STEP_MS));
        } else if (next === 'rows-untangle') {
          runRows('untangle');
        } else if (next === 'rows-done') {
          runRows('done');
        }
      };

      timersRef.current.push(window.setTimeout(stepTok, TOKEN_INIT_MS));
    };

    const startSequence = () => {
      if (cancelled) return;
      if (!mainRef.current) {
        deferBootstrapRafRef.current = requestAnimationFrame(startSequence);
        return;
      }
      deferBootstrapRafRef.current = null;

      sceneRef.current = { tokenIdx: -1, rowIdx: -1, interp: 0, phase: 'tokens' };

      if (keyframe === 2) {
        runTokens('none');
      } else if (keyframe === 3) {
        runTokens('rows-done');
      } else {
        // Keyframe 4 is the “graph” beat: do not replay token+row timing (can take minutes); show full wall then morph.
        sceneRef.current = {
          tokenIdx: 1e9,
          rowIdx: 1e9,
          interp: 0,
          phase: 'untangle',
        };
        drawRef.current();
        finishUntangle();
      }
    };

    deferBootstrapRafRef.current = requestAnimationFrame(startSequence);

    return () => {
      cancelled = true;
      clearAnim();
    };
  }, [keyframe, ready, clearAnim, onReverseMorphComplete, listRowsControlled]);

  const showZoomArmHint = ready && vizPointerInside && !mapZoomArmed;

  return (
    <div
      className={className}
      onMouseEnter={() => setVizPointerInside(true)}
      onMouseLeave={() => {
        setVizPointerInside(false);
        disarmMapZoom();
      }}
    >
      {showZoomArmHint ? (
        <div className="scrolly-wg-zoom-hint" role="status">
          Click map to enable zoom
        </div>
      ) : null}
      <svg ref={svgRef} id={svgId} className={ready ? 'scrolly-wg-svg' : 'hidden'} role="img" />
      {!ready && (
        <div className="scrolly-wg-loading" aria-busy="true" aria-live="polite">
          <span className="scrolly-seq-loading-dot" />
          <span className="scrolly-seq-loading-dot" />
          <span className="scrolly-seq-loading-dot" />
        </div>
      )}
    </div>
  );
}
