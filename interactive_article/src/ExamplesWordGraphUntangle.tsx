import React from "react";
import Box from '@mui/material/Box';
import './single_example_wordgraph.css';
import { CommitOnReleaseSlider } from './CommitOnReleaseSlider';
import * as utils from './lib/articleUtils';
import * as color_utils from './lib/articleColorUtils';
import * as d3 from "d3";
import { ellipseForce } from "./lib/force_collide_ellipse";
import { getNodeColor } from './lib/articleColorUtils';
import { TokenizeMode, NodeDatum, LinkDatum } from './lib/graphTypes';
import { wordGraphZoomEventFilter } from './lib/wordGraphZoomArm';

const TRANSITION_DURATION = 300;
/** Duration (ms) for untangle toggle animation */
const UNTANGLE_ANIMATION_DURATION = 1000;
const LAYOUT_MARGIN = 60;
/** Pixel spacing between rows in 1D mode */
const ROW_SPACING_1D = 20;
/** Extra vertical gap between prompt groups in 1D mode (when separate by prompt is unchecked) */
const PROMPT_SEPARATOR_1D = 24;
/** Max height used for graph-mode y-force when separating by prompt; avoids graphs being too far apart with many generations */
const MAX_GRAPH_LAYOUT_HEIGHT = 500;
const UNIFORM_FONT_SIZE = 11; // Used when fully untangled (1D view)
/** When true, all text in linear (List) mode uses UNIFORM_FONT_SIZE. When false, uses same variable scale as graph (font size encodes frequency). */
const UNIFORM_FONT_IN_LINEAR_MODE = true;
const GRAPH_THRESHOLD = 1; // At or above this, use collapsed nodes; keep 1 so collapse happens only at end (avoids jump)
const INTERACT_THRESHOLD = 0.7; // Below this, disable hover/click/select in graph mode
/** Pixel width per character fallback when measurement unavailable */
const PX_PER_CHAR_1D = 2;
/** Gap between words in 1D mode */
const GAP_PX_1D = 4;
/** Fixed reference width for 1D layout - used for normalization; layout spacing is content-based, not scaled to window */
const REFERENCE_ROW_WIDTH_1D = 500;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_MIN_OPACITY_THRESHOLD = 0;
const DEFAULT_SPREAD = 0.5;
/** Toolbar slider track width for article motivating overlay */
const MOTIVATING_SLIDER_WIDTH = 162;

interface Props {
    promptGroups: { promptId: string; generations: string[] }[];
    svgId?: string;
    className?: string;
    startInListView?: boolean;
    autoRevealGraphDelayMs?: number;
    /** When false, hide Graph/List toggle (e.g. scrolly forces list-only or graph-only). */
    showUntangleToggle?: boolean;
    /** After first graph build, run list-view token reveal (single-generation demos). */
    animateFirstGenerationOnMount?: boolean;
    /** Words per wrapped line in list/graph labels (1 = one word per line chunk, token-style). */
    listViewWordWrapChunk?: number;
    /** Delay before each step when animating the first generation (ms). */
    animationStepMs?: number;
    /** Pause before the first token appears (ms). */
    animationInitialDelayMs?: number;
    /** Only the first N nodes (by word order) animate in phase 1; rest appear in phase 2. */
    animateFirstGenerationMaxSteps?: number;
    /**
     * After first graph build, reveal each completion row (sentIdx) one after another in list view.
     * Uses animationStepMs / animationInitialDelayMs. Mutually exclusive with animateFirstGenerationOnMount in scrolly.
     */
    animateGenerationsSequentially?: boolean;
    /** When false, disable zoom, pan, and node pointer interaction (e.g. early scrolly steps). */
    allowChartInteraction?: boolean;
    /** Article motivating examples: extra sliders (hide rare outputs, graph spread) next to list/graph toggle. */
    showMotivatingControls?: boolean;
    /**
     * When set with `showMotivatingControls`, adds a discrete “Number of generations” slider to the overlay.
     * Value is capped by `maxCached` stored completions.
     */
    motivatingGenerations?: {
        maxCached: number;
        value: number;
        onChange: (n: number) => void;
    };
    /**
     * Fixed SVG pixel height (width still follows container). Clamped up to list-view minimum so rows are not clipped.
     */
    fixedSvgHeightPx?: number;
    /** Multi-prompt layouts: start with prompts laid out in separate vertical bands (e.g. presidents comparison). */
    initialSeparateByPrompt?: boolean;
    /** List (1D) mode font size in px; defaults to built-in uniform list size. */
    listUniformFontSize?: number;
    /**
     * Uniform inset from SVG edges for 1D rows (px); default 60. Ignored for an axis when the axis-specific prop is set.
     */
    layoutMarginPx?: number;
    /** Left inset (px); falls back to `layoutMarginPx` then 60. */
    layoutMarginLeftPx?: number;
    /** Top inset (px); falls back to `layoutMarginPx` then 60. */
    layoutMarginTopPx?: number;
    /** Bottom inset for min-height (px); falls back to `layoutMarginPx` then matches left inset. */
    layoutMarginBottomPx?: number;
    /** Horizontal gap between tokens in 1D list view (px); default 4. */
    listViewGapPx?: number;
    /** Rendered inside the graph pane, left of the sidebar (e.g. motivating-example prompt card). */
    floatingPrompt?: React.ReactNode;
}

interface State {
    hoveredNode: NodeDatum | null;
    hoveredSentIndices: number[] | null;
    similarityThreshold: number;
    minOpacityThreshold: number;
    spread: number;
    tokenizeMode: TokenizeMode;
    separateByPrompt: boolean;
    animatingGeneration: boolean;
    animationWordIdx: number;
    animationPhase: 'first' | 'rows' | 'all';
    /** true = 1D text lines, false = full computed graph */
    isUntangled: boolean;
    /** Animated 0–1, drives smooth transition when toggling */
    interpolationFraction: number;
    /** True until rebuild finishes simulation + draw for this build. */
    pendingGraphLayout: boolean;
    /** Wheel/pan zoom after click; reset on mouse leave (see word graph article UX). */
    chartZoomArmed: boolean;
    chartPointerInside: boolean;
}

const NUM_WORDS_TO_WRAP = 5;

export type { NodeDatum, LinkDatum, OrigSentenceInfo } from './lib/graphTypes';

/** 1D layout: one entry per (node, sentIdx) for basic text view */
interface NodeInstance1D {
    node: NodeDatum;
    sentIdx: number;
    x: number;
    y: number;
    /** Original word(s) from this generation (before fuzzy merge) */
    origWord: string;
}

interface Link1DEndpoints {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
}
class ExamplesWordGraphUntangle extends React.Component<Props, State> {
    private selectedNodes: Set<NodeDatum> = new Set();
    private fontScale: d3.ScaleLinear<number, number> | null = null;
    private opacityScale: d3.ScalePower<number, number> | null = null;
    private simulation: d3.Simulation<NodeDatum, LinkDatum> | null = null;
    private nodesData: NodeDatum[] = [];
    private linksData: LinkDatum[] = [];
    private links: d3.Selection<SVGGElement, LinkDatum, SVGGElement, unknown> | null = null;
    private nodes: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown> | null = null;
    private defs: d3.Selection<SVGDefsElement, unknown, HTMLElement, any> | null = null;
    private getLinkEndpoints: ((d: LinkDatum) => { sourceX: number; targetX: number; y1: number; y2: number; sourceRightX: number; targetLeftX: number }) | null = null;
    private height: number = 0;
    private width: number = 0;
    private autoRevealTimer: number | null = null;
    private firstGenAnimationScheduled = false;
    private generationRowAnimationScheduled = false;
    /** Bumps on each rebuild start and on unmount so overlapping rebuildGraph timeouts are ignored */
    private liveRebuildId = 0;
    /** Cached 1D layout for interpolation: one instance per (node, sentIdx) */
    private nodeInstances1D: NodeInstance1D[] = [];
    /** Cached 1D endpoints per link for interpolation */
    private link1DEndpoints: Map<LinkDatum, Link1DEndpoints> = new Map();
    private mainGroup: d3.Selection<SVGGElement, unknown, HTMLElement, any> | null = null;
    private svgRoot: d3.Selection<SVGSVGElement, unknown, HTMLElement, any> | null = null;
    private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
    /** Synchronous mirror of `state.chartZoomArmed` for d3-zoom’s filter. */
    private chartZoomArmedSync = false;
    constructor(props: Props) {
        super(props);
        this.state = {
            hoveredNode: null,
            hoveredSentIndices: null,
            similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
            minOpacityThreshold: DEFAULT_MIN_OPACITY_THRESHOLD,
            spread: DEFAULT_SPREAD,
            tokenizeMode: 'space',
            separateByPrompt: props.initialSeparateByPrompt ?? false,
            animatingGeneration: false,
            animationWordIdx: -1,
            animationPhase: 'first',
            isUntangled: props.startInListView ?? false,
            interpolationFraction: props.startInListView ? 0 : 1,
            pendingGraphLayout: true,
            chartZoomArmed: false,
            chartPointerInside: false,
        };
    }

    private armChartZoom() {
        if (this.props.allowChartInteraction === false) return;
        if (this.chartZoomArmedSync) return;
        this.chartZoomArmedSync = true;
        this.setState({ chartZoomArmed: true });
    }

    private disarmChartZoom() {
        this.chartZoomArmedSync = false;
        this.setState({ chartZoomArmed: false });
    }

    private sid(): string {
        return this.props.svgId ?? 'article-graph';
    }

    private wrapChunkSize(): number {
        return this.props.listViewWordWrapChunk ?? NUM_WORDS_TO_WRAP;
    }

    private linearFontSize(): number {
        return this.props.listUniformFontSize ?? UNIFORM_FONT_SIZE;
    }

    private layoutMarginLeft(): number {
        return this.props.layoutMarginLeftPx ?? this.props.layoutMarginPx ?? LAYOUT_MARGIN;
    }

    private layoutMarginTop(): number {
        return this.props.layoutMarginTopPx ?? this.props.layoutMarginPx ?? LAYOUT_MARGIN;
    }

    private layoutMarginBottom(): number {
        return (
            this.props.layoutMarginBottomPx ??
            this.props.layoutMarginPx ??
            this.layoutMarginLeft()
        );
    }

    private listGapPx(): number {
        return this.props.listViewGapPx ?? GAP_PX_1D;
    }

    componentDidMount() {
        this.rebuildGraph();
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
        this.liveRebuildId++;
        if (this.autoRevealTimer !== null) {
            clearTimeout(this.autoRevealTimer);
            this.autoRevealTimer = null;
        }
        // Clean up animation timer if running
        if (this.animationTimer !== null) {
            clearTimeout(this.animationTimer);
            this.animationTimer = null;
        }
        if (this.interpAnimationFrame !== null) {
            cancelAnimationFrame(this.interpAnimationFrame);
            this.interpAnimationFrame = null;
        }
    }

    private animationTimer: number | null = null;
    private interpAnimationFrame: number | null = null;

    private handleKeyDown = (event: KeyboardEvent) => {
        if (this.props.allowChartInteraction === false) {
            return;
        }
        if (event.key === 'Escape') {
            this.selectedNodes.clear();
            this.setState({ hoveredNode: null, hoveredSentIndices: null });
            // Trigger a re-render by rebuilding the graph
            this.rebuildGraph();
        }
    }

    private nodeSelected(): boolean {
        return this.selectedNodes.size > 0;
    }

    private handleResize = () => {
        this.rebuildGraph();
    }

    /** SVG user-space viewport (viewBox when set; else width/height attrs). */
    private getSvgViewportUserSize(): { w: number; h: number } {
        const el = this.svgRoot?.node();
        if (!el) return { w: this.width, h: this.height };
        const vb = el.viewBox?.baseVal;
        if (vb && vb.width > 0 && vb.height > 0) {
            return { w: vb.width, h: vb.height };
        }
        const w = el.width.baseVal.value;
        const h = el.height.baseVal.value;
        if (w > 0 && h > 0) return { w, h };
        const cw = el.clientWidth;
        const ch = el.clientHeight;
        if (cw > 0 && ch > 0) return { w: cw, h: ch };
        return { w: this.width, h: this.height };
    }

    /**
     * viewBox aspect ratio must match the SVG element's laid-out box (clientWidth/clientHeight) so
     * preserveAspectRatio="meet" fills the red wrapper instead of pillarboxing/letterboxing inside it.
     * The box always covers the simulation canvas (this.width × this.height).
     */
    private computeDisplayMatchedViewBox(): { vbW: number; vbH: number } {
        const el = this.svgRoot?.node();
        const simW = this.width;
        const simH = this.height;
        if (!el) return { vbW: simW, vbH: simH };
        const cw = el.clientWidth;
        const ch = el.clientHeight;
        if (cw <= 0 || ch <= 0) return { vbW: simW, vbH: simH };
        const ar = cw / ch;
        let vbH = Math.max(simH, simW / ar);
        let vbW = vbH * ar;
        if (vbW < simW) {
            vbW = simW;
            vbH = vbW / ar;
        }
        return { vbW, vbH };
    }

    private refreshSvgViewBox() {
        if (!this.svgRoot) return;
        const { vbW, vbH } = this.computeDisplayMatchedViewBox();
        this.svgRoot
            .attr('viewBox', `0 0 ${vbW} ${vbH}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');
    }

    /**
     * Flex layout can change the SVG’s rendered width before the next full rebuild; keep the width
     * attribute aligned with clientWidth so fit/zoom use the current horizontal viewport. Height is
     * left to layout + fixedSvgHeightPx (changing it here would desync the force layout).
     */
    private syncSvgWidthAttrFromClient() {
        const el = this.svgRoot?.node();
        if (!el) return;
        const cw = el.clientWidth;
        if (cw <= 0) return;
        const w0 = el.width.baseVal.value;
        if (Math.abs(cw - w0) < 1) return;
        this.width = Math.max(320, Math.min(cw, 5000));
        this.svgRoot!.attr('width', this.width);
        this.refreshSvgViewBox();
    }

    /** Center and scale the pan layer so all nodes/links fit in the SVG (user units match width/height attrs). */
    private fitGraphToViewport() {
        if (!this.mainGroup || !this.svgRoot || !this.zoomBehavior) return;
        const gSel = this.mainGroup;
        const gNode = gSel.node();
        if (!gNode) return;

        this.syncSvgWidthAttrFromClient();
        this.refreshSvgViewBox();

        gSel.attr('transform', null);
        let bbox: DOMRect;
        try {
            bbox = gNode.getBBox();
        } catch {
            this.svgRoot.call(this.zoomBehavior.transform, d3.zoomIdentity);
            return;
        }
        if (
            !Number.isFinite(bbox.width) ||
            !Number.isFinite(bbox.height) ||
            bbox.width <= 0 ||
            bbox.height <= 0
        ) {
            this.svgRoot.call(this.zoomBehavior.transform, d3.zoomIdentity);
            return;
        }

        const { w, h } = this.getSvgViewportUserSize();
        /** Extra inset on the left; small symmetric inset elsewhere. “Contain” fit touches one axis of the inner rect. */
        const padL = 0.028;
        const padR = 0.002;
        const padY = 0.002;
        const innerLeft = w * padL;
        const innerRight = w * (1 - padR);
        const innerTop = h * padY;
        const innerBottom = h * (1 - padY);
        const innerW = innerRight - innerLeft;
        const innerH = innerBottom - innerTop;
        const inkSlop = 4;
        const fitW = bbox.width + 2 * inkSlop;
        const fitH = bbox.height + 2 * inkSlop;
        let scale = Math.min(innerW / fitW, innerH / fitH);
        const kMin = 0.02;
        const kMax = 64;
        scale = Math.max(kMin, Math.min(kMax, scale));
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;
        const cxTarget = (innerLeft + innerRight) / 2;
        const cyTarget = (innerTop + innerBottom) / 2;
        const tx = cxTarget - scale * cx;
        const ty = cyTarget - scale * cy;
        const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
        this.svgRoot.call(this.zoomBehavior.transform, t);
    }

    /** Animate interpolationFraction from start to target over UNTANGLE_ANIMATION_DURATION */
    private startInterpAnimation(start: number, target: number) {
        if (this.interpAnimationFrame !== null) {
            cancelAnimationFrame(this.interpAnimationFrame);
        }
        const startTime = performance.now();
        const ease = (t: number) => t * (2 - t); // easeOutQuad
        const step = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, elapsed / UNTANGLE_ANIMATION_DURATION);
            const eased = ease(t);
            const value = start + (target - start) * eased;
            // Direct update instead of setState to avoid React re-renders every frame
            this.updateWithInterp(value);
            if (t < 1) {
                this.interpAnimationFrame = requestAnimationFrame(step);
            } else {
                this.interpAnimationFrame = null;
                this.setState({ interpolationFraction: value });
            }
        };
        this.interpAnimationFrame = requestAnimationFrame(step);
    }
    private updateWithInterp = (value: number) => this.update(false, value);

    private createFontScale() {
        const totalGenerations = this.props.promptGroups.reduce((acc, group) => acc + group.generations.length, 0);
        const minFontSize = 11;
        const maxFontSize = 30;

        this.fontScale = d3.scaleLinear()
            .domain([1, totalGenerations])
            .range([minFontSize, maxFontSize])
            .clamp(true);

        // Opacity: gradient by count (rarer=lighter). Slider hides nodes with count≤threshold.
        // Slider 0=show all, 0.2=hide count≤1, 0.4=hide count≤2, 0.6=hide count≤3, etc.
        const hideThreshold = Math.min(totalGenerations, Math.floor(this.state.minOpacityThreshold * 5));
        const minVisibleCount = hideThreshold + 1;
        this.opacityScale = d3.scalePow()
            .exponent(0.6)
            .domain([minVisibleCount, totalGenerations])
            .range([0.6, 1]) // lowest-visible is faint, highest is full
            .clamp(true);

        this.nodesData.forEach((node) => node.fontSize = this.fontSize(node));
        this.nodesData.forEach((node) => node.textLength = this.textLength(node));
    }

    render() {
        const sid = this.sid();
        const showToggle = this.props.showUntangleToggle !== false;
        const showMotivating = !!this.props.showMotivatingControls;
        const genSlider = this.props.motivatingGenerations;
        const showGenSlider =
            showMotivating && genSlider != null && genSlider.maxCached >= 2;
        const genValue = Math.min(genSlider?.value ?? 2, genSlider?.maxCached ?? 2);
        const showOverlay = showToggle || showMotivating;
        const { pendingGraphLayout, chartZoomArmed, chartPointerInside } = this.state;
        const allowZoomArm = this.props.allowChartInteraction !== false;
        const showZoomArmHint =
            allowZoomArm && chartPointerInside && !chartZoomArmed && !pendingGraphLayout;
        const rootClass = [
            this.props.className,
            this.props.allowChartInteraction === false ? 'article-wordgraph-no-interaction' : '',
            showMotivating ? 'article-example-untangle--motivating' : '',
            showMotivating ? 'article-example-untangle--sidebar' : '',
        ]
            .filter(Boolean)
            .join(' ');

        const sliderTrackSx = showMotivating ? { width: '100%', maxWidth: '100%' } : { width: MOTIVATING_SLIDER_WIDTH };

        const toggleEl = showToggle && (
            <div
                className={`toggle-switch-container toggle-state-${this.state.isUntangled ? 'list' : 'graph'}`}
                title="Switch between graph view and list view"
            >
                <span className="toggle-label toggle-label-graph">Graph</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={this.state.isUntangled}
                    aria-label="Toggle between graph and list view"
                    className={`toggle-switch ${this.state.isUntangled ? 'toggle-switch-list' : 'toggle-switch-graph'}`}
                    onClick={() => {
                        const checked = !this.state.isUntangled;
                        this.setState({ isUntangled: checked });
                    }}
                >
                    <span className="toggle-switch-track">
                        <span className="toggle-switch-thumb" />
                    </span>
                </button>
                <span className="toggle-label toggle-label-list">List</span>
            </div>
        );

        const loaderEl = (
            <span
                id={`${sid}-loader`}
                className={`loader article-wordgraph-loader${pendingGraphLayout ? '' : ' hidden'}`}
                role="status"
                aria-live="polite"
            >
                <span className="article-wordgraph-loader__inner">
                    <span className="article-wordgraph-loader__spinner" aria-hidden="true" />
                    <span className="article-wordgraph-loader__label">Loading</span>
                </span>
            </span>
        );

        const motivatingControlsEl = showMotivating && (
            <>
                {showGenSlider && genSlider && (
                    <div className="slider-container slider-container--outputs">
                        <label className="slider-label-outputs">
                            <span>Number of outputs</span>
                            <span className="slider-value-narrow">{genValue}</span>
                        </label>
                        <Box sx={sliderTrackSx}>
                            <CommitOnReleaseSlider
                                size="small"
                                min={2}
                                max={genSlider.maxCached}
                                step={1}
                                value={genValue}
                                valueLabelDisplay="off"
                                onChangeCommitted={(_e, value) => genSlider.onChange(value as number)}
                                aria-label="Number of outputs to include"
                            />
                        </Box>
                    </div>
                )}
                <div className="slider-container slider-container--nowrap-label">
                    <label>Hide rare outputs</label>
                    <Box sx={sliderTrackSx}>
                        <CommitOnReleaseSlider
                            size="small"
                            min={0}
                            max={1}
                            step={0.1}
                            value={this.state.minOpacityThreshold}
                            valueLabelDisplay="off"
                            onChangeCommitted={(_e, value) =>
                                this.setState({ minOpacityThreshold: value as number })
                            }
                            aria-label="Hide rare outputs"
                        />
                    </Box>
                </div>
                <div className="slider-container slider-container--nowrap-label">
                    <label>Graph spread</label>
                    <Box sx={sliderTrackSx}>
                        <CommitOnReleaseSlider
                            size="small"
                            min={0}
                            max={1}
                            step={0.1}
                            value={this.state.spread}
                            valueLabelDisplay="off"
                            onChangeCommitted={(_e, value) => this.setState({ spread: value as number })}
                            aria-label="Graph spread"
                        />
                    </Box>
                </div>
            </>
        );

        return (
            <div
                className={rootClass || undefined}
                style={
                    showMotivating
                        ? {
                              display: 'flex',
                              /* flex-direction: row | column from .article-example-untangle--sidebar in CSS (inline row would break mobile) */
                              alignItems: 'stretch',
                              width: '100%',
                              height: '100%',
                          }
                        : { position: 'relative', width: '100%', height: '100%' }
                }
            >
                {showMotivating ? (
                    <>
                        <div
                            className="article-wordgraph-viz-pane"
                            onMouseEnter={() => this.setState({ chartPointerInside: true })}
                            onMouseLeave={() => {
                                this.setState({ chartPointerInside: false });
                                this.disarmChartZoom();
                            }}
                        >
                            {showZoomArmHint ? (
                                <div className="scrolly-wg-zoom-hint" role="status">
                                    Click map to enable zoom
                                </div>
                            ) : null}
                            {loaderEl}
                            <div className="wordgraph-svg-clip-wrap">
                                <svg id={sid} className={pendingGraphLayout ? 'hidden' : undefined}></svg>
                            </div>
                            {this.props.floatingPrompt ? (
                                <div className="article-wordgraph-floating-prompt">{this.props.floatingPrompt}</div>
                            ) : null}
                        </div>
                        {showOverlay && (
                            <aside
                                className="graph-controls-sidebar graph-controls-sidebar--article-motivating"
                                aria-label="Graph controls"
                            >
                                {toggleEl}
                                {motivatingControlsEl}
                            </aside>
                        )}
                    </>
                ) : (
                    <>
                        <div
                            style={{ position: 'relative', width: '100%', height: '100%' }}
                            onMouseEnter={() => this.setState({ chartPointerInside: true })}
                            onMouseLeave={() => {
                                this.setState({ chartPointerInside: false });
                                this.disarmChartZoom();
                            }}
                        >
                            {showZoomArmHint ? (
                                <div className="scrolly-wg-zoom-hint" role="status">
                                    Click map to enable zoom
                                </div>
                            ) : null}
                            {loaderEl}
                            <div className="wordgraph-svg-clip-wrap">
                                <svg id={sid} className={pendingGraphLayout ? 'hidden' : undefined}></svg>
                            </div>
                        </div>
                        {showOverlay && (
                            <div className="graph-controls-overlay">
                                {toggleEl}
                                {motivatingControlsEl}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    async componentDidUpdate(prevProps: Props, prevState: State) {
        const tokenizeModeChanged = prevState.tokenizeMode !== this.state.tokenizeMode;
        const similarityThresholdChanged = prevState.similarityThreshold !== this.state.similarityThreshold;
        const separateByPromptChanged = prevState.separateByPrompt !== this.state.separateByPrompt;
        const promptGroupsChanged = !utils.objectsAreEqual(prevProps.promptGroups, this.props.promptGroups);
        const fixedSvgHeightChanged = prevProps.fixedSvgHeightPx !== this.props.fixedSvgHeightPx;

        if (promptGroupsChanged) {
            this.firstGenAnimationScheduled = false;
            this.generationRowAnimationScheduled = false;
            if (this.autoRevealTimer !== null) {
                clearTimeout(this.autoRevealTimer);
                this.autoRevealTimer = null;
            }
            this.selectedNodes.clear();
            this.setState({ hoveredNode: null, hoveredSentIndices: null });
        }
        
        if (
            similarityThresholdChanged ||
            tokenizeModeChanged ||
            promptGroupsChanged ||
            separateByPromptChanged ||
            fixedSvgHeightChanged
        ) {
            this.rebuildGraph();
        }

        if (prevState.minOpacityThreshold !== this.state.minOpacityThreshold) {
            this.createFontScale();
            this.update();
            this.fitGraphToViewport();
            return;
        }
        if (prevState.animatingGeneration && !this.state.animatingGeneration) {
            this.update();
            this.fitGraphToViewport();
            return;
        }
        if (prevState.spread !== this.state.spread) {
            this.updateSimulation(false, true);
            return;
        }
        if (prevState.isUntangled !== this.state.isUntangled) {
            if (this.state.isUntangled) {
                this.selectedNodes.clear();
                this.setState({ hoveredNode: null, hoveredSentIndices: null });
            }
            this.startInterpAnimation(prevState.interpolationFraction, this.state.isUntangled ? 0 : 1);
            return;
        }
        if (prevState.interpolationFraction !== this.state.interpolationFraction) {
            this.update();
            if (this.interpAnimationFrame === null) {
                this.fitGraphToViewport();
            }
            return;
        }
        if (prevState.pendingGraphLayout && !this.state.pendingGraphLayout) {
            this.update();
            requestAnimationFrame(() => this.fitGraphToViewport());
            return;
        }
        this.update();

    }

    private async rebuildGraph() {
        if (this.autoRevealTimer !== null) {
            clearTimeout(this.autoRevealTimer);
            this.autoRevealTimer = null;
        }
        if (this.interpAnimationFrame !== null) {
            cancelAnimationFrame(this.interpAnimationFrame);
            this.interpAnimationFrame = null;
        }
        this.disarmChartZoom();
        const rebuildId = ++this.liveRebuildId;
        this.setState((prev) => ({
            interpolationFraction: prev.isUntangled ? 0 : 1,
            pendingGraphLayout: true,
        }));
        setTimeout(async () => {
            try {
                if (rebuildId !== this.liveRebuildId) return;
                await this.rebuildGraphContent();
                if (rebuildId !== this.liveRebuildId) return;

                let runFirstGenTimers = false;
                let runRowTimers = false;
                if (this.props.animateFirstGenerationOnMount && !this.firstGenAnimationScheduled) {
                    this.firstGenAnimationScheduled = true;
                    runFirstGenTimers = true;
                    await new Promise<void>((resolve) => {
                        this.setState(
                            {
                                animatingGeneration: true,
                                animationWordIdx: -1,
                                animationPhase: 'first',
                            },
                            () => resolve()
                        );
                    });
                } else if (
                    this.props.animateGenerationsSequentially &&
                    !this.generationRowAnimationScheduled &&
                    !this.props.animateFirstGenerationOnMount
                ) {
                    this.generationRowAnimationScheduled = true;
                    runRowTimers = true;
                    await new Promise<void>((resolve) => {
                        this.setState(
                            {
                                animatingGeneration: true,
                                animationWordIdx: -1,
                                animationPhase: 'rows',
                            },
                            () => resolve()
                        );
                    });
                }

                if (rebuildId !== this.liveRebuildId) return;
                this.updateSimulation(true, true);
                if (rebuildId !== this.liveRebuildId) return;
                this.scheduleAutoRevealAndFirstGenAnimation();
                if (runFirstGenTimers) {
                    this.startFirstGenStepTimers();
                } else if (runRowTimers) {
                    this.startGenerationRowRevealTimers();
                }
            } catch (e) {
                console.error(e);
            } finally {
                if (rebuildId === this.liveRebuildId) {
                    requestAnimationFrame(() => {
                        if (rebuildId === this.liveRebuildId) {
                            this.setState({ pendingGraphLayout: false });
                        }
                    });
                }
            }
        }, 0);
    }

    private scheduleAutoRevealAndFirstGenAnimation() {
        const delay = this.props.autoRevealGraphDelayMs;
        if (delay == null || delay < 0) return;
        if (!(this.props.startInListView ?? false)) return;

        if (this.autoRevealTimer !== null) {
            clearTimeout(this.autoRevealTimer);
            this.autoRevealTimer = null;
        }

        this.autoRevealTimer = window.setTimeout(() => {
            this.autoRevealTimer = null;
            this.setState((prev) => {
                if (!prev.isUntangled) return null;
                return { isUntangled: false };
            });
        }, delay);
    }

    private promptOrder(): string[] {
        return this.props.promptGroups.map((g) => g.promptId);
    }

    private async rebuildGraphContent() {
        // Generate graph data from all text
        const { nodesData, linksData } = await utils.createGraphDataFromPromptGroups(this.props.promptGroups, this.state.similarityThreshold, false, this.state.tokenizeMode, this.state.separateByPrompt);

        const promptOrder = this.promptOrder();

        // Create color scale that matches the state's color assignment
        // Use the same logic as state.getPromptColor() for consistency
        const edgeColors = (originalIndex: string) => {
            const index = parseInt(originalIndex);
            const color = color_utils.MILLER_STONE_COLORS[index % color_utils.MILLER_STONE_COLORS.length];
            return color;
        };

        this.nodesData = nodesData;
        this.linksData = linksData;
        this.createFontScale(); // Create font scale based on total generations
        this.addBoundingBoxData(nodesData);
        this.build1DLayout();
        const svgMount = document.getElementById(this.sid());
        const parentW = svgMount?.parentElement?.clientWidth;
        const baseW =
            parentW && parentW > 0 ? parentW : Math.min(window.innerWidth, 5000);
        this.width = Math.max(320, Math.min(baseW, 5000));
        const defaultH = Math.min(window.innerHeight * 0.8, 800);
        const totalSents = this.props.promptGroups.reduce((acc, g) => acc + g.generations.length, 0);
        const nPrompts = this.props.promptGroups.length;
        const promptGapRows = (nPrompts > 1 && !this.state.separateByPrompt)
            ? (nPrompts - 1) * (PROMPT_SEPARATOR_1D / ROW_SPACING_1D) : 0;
        const minHeight1D =
            totalSents > 1
                ? this.layoutMarginTop() +
                  this.layoutMarginBottom() +
                  ((totalSents - 1) + promptGapRows) * ROW_SPACING_1D
                : defaultH;
        const fixed = this.props.fixedSvgHeightPx;
        this.height =
            fixed != null ? Math.max(fixed, minHeight1D) : Math.max(defaultH, minHeight1D);
        const svg = d3.select(`#${this.sid()}`) as d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
        this.svgRoot = svg;
        svg
            .html('')
            .attr("width", this.width)
            .attr("height", this.height)
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .style("cursor", "grab") // Change cursor to indicate draggable
            // Add click handler to the SVG background
            .on('click', (event: any) => {
                const zoomWasArmed = this.chartZoomArmedSync;
                this.armChartZoom();
                // First click only arms zoom; clearing selection is for later clicks on the SVG root.
                if (event.target.tagName === 'svg' && zoomWasArmed) {
                    if (this.nodeSelected() || this.state.hoveredNode || this.state.hoveredSentIndices) {
                        this.selectedNodes.clear();
                        this.setState({ hoveredNode: null, hoveredSentIndices: null });
                        this.updateSimulation();
                        this.update();
                    }
                }
            });

        // Add a group for all content that will be panned (will-change hints GPU layer for transforms)
        const g = svg.append("g").attr("style", "will-change: transform");
        this.mainGroup = g;

        // Add zoom behavior (wide scale range so initial fit can shrink large graphs)
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.02, 64])
            .on("zoom", (event) => {
                g.attr("transform", String(event.transform));
            });
        if (this.props.allowChartInteraction !== false) {
            zoom.filter((event) => wordGraphZoomEventFilter(event, this.chartZoomArmedSync));
        }

        this.zoomBehavior = zoom;
        svg.call(zoom as any)
            .on("dblclick.zoom", null);


        // Add defs section for gradients
        this.defs = svg.append("defs");

        // Create a gradient for each link
        const gradientId = (d: LinkDatum, i: number) => `gradient-${i}`;

        // Helper function to create gradient for a link
        const createGradient = (d: LinkDatum, i: number, isInSents: boolean) => {
            const grad = this.defs!.append("linearGradient")
                .attr("id", gradientId(d, i))
                .attr("gradientUnits", "objectBoundingBox")

            // Get stroke color
            const strokeColor = edgeColors(
                String(d.promptId ? color_utils.getPromptIndexFromId(d.promptId, promptOrder) : 0)
            );

            grad.append("stop")
                .attr("offset", "0%")
                .attr("stop-color", strokeColor)

            grad.append("stop")
                .attr("offset", "100%")
                .attr("stop-color", strokeColor)

            return grad;
        };

        // Initialize gradients with temporary coordinates (will be updated during simulation)
        linksData.forEach((d: LinkDatum, i: number) => {
            createGradient(d, i, !!this.linkIsInSents(d));
        });

        // Helper function to get link endpoints (reusable for paths and gradients)
        this.getLinkEndpoints = (d: LinkDatum) => {
            const getY = (node: NodeDatum) => {
                const lineHeight = 0.75;
                const percentage = [...node.origSentIndices].indexOf(d.sentIdx) / node.origSentIndices.length;
                const offsetY = (percentage - lineHeight) * node.fontSize;
                return node.y + offsetY;
            };

            const getXLeftRightCenter = (node: NodeDatum) => {
                const leftX = node.x;
                const rightX = leftX + node.textLength;
                const centerX = (leftX + rightX) / 2;
                return [leftX, rightX, centerX];
            };

            const [sourceLeftX, sourceRightX, sourceCenterX] = getXLeftRightCenter(d.source);
            const [targetLeftX, targetRightX, targetCenterX] = getXLeftRightCenter(d.target);
            const sourceX = d.source?.isRoot ? sourceLeftX : sourceCenterX;
            const targetX = d.target.isEnd ? targetRightX : targetCenterX;
            const [y1, y2] = [getY(d.source), getY(d.target)];

            return { sourceX, targetX, y1, y2, sourceRightX, targetLeftX };
        };

        // Draw links (g wrapper with visible path + invisible hit area for hover).
        this.links = g.selectAll(".link")
            .data(linksData).enter()
            .append("g")
            .attr("class", "link")
            .on('mouseover', (event: any, d: LinkDatum) => {
                this.setState({ hoveredNode: null, hoveredSentIndices: [d.sentIdx] });
            })
            .on('mouseout', (event: any, d: LinkDatum) => {
                this.setState({ hoveredSentIndices: null });
            })
            .style('cursor', 'pointer');

        this.links.append('path')
            .attr("class", "link-visible")
            .attr("fill", "none")
            .attr("shape-rendering", "optimizeSpeed");

        this.links.append('path')
            .attr("class", "link-hit")
            .attr("fill", "none")
            .attr("stroke", "transparent")
            .attr("stroke-width", 12)
            .attr("shape-rendering", "optimizeSpeed");

        // Nodes are created only in update() via the data join - avoids ghost/duplicate text
        // when switching between collapsed (graph) and exploded (1D) views.
        this.nodes = g.selectAll<SVGGElement, NodeDatum>(".node").data([]) as any;
    }
    /** Update graph; use interpOverride to avoid setState during animation */
    private update(firstTime: boolean = false, interpOverride?: number) {
        if (!this.links || !this.defs || !this.getLinkEndpoints || !this.mainGroup) {
            return;
        }

        const interp = interpOverride ?? this.state.interpolationFraction;

        type NodeDisplayDatum = NodeDatum | (NodeInstance1D & { word: string });
        const getNode = (d: NodeDisplayDatum): NodeDatum => ('origSentIndices' in d ? d : d.node);
        const getBlur = (d: (LinkDatum | NodeDisplayDatum)) => {
            const blurFn = (opacity: number) => `blur(2px) opacity(${opacity})`;
            const isLink = (x: any): x is LinkDatum => x && x.source !== undefined && x.target !== undefined;
            const isInSents = isLink(d) ? this.linkIsInSents(d) : this.nodeIsInSelectedSents(getNode(d as NodeDisplayDatum));
            // Selection: blur non-selected. Hover only: no blur, just bold the token.
            if (!this.nodeSelected() && !this.state.hoveredSentIndices) return '';
            if (this.nodeSelected()) return !isInSents ? blurFn(.2) : '';
            if (this.state.hoveredSentIndices) return ''; // Pure hover: just bold, no blur
            return '';
        }
        // Use 1 second transition for phase 2 fade-in. During interp animation, update instantly each frame.
        // At endpoints (0 or 1) use 0 to avoid extra transition after animation completes.
        const atEndpoint = interp <= 0 || interp >= 1;
        const genAnimReveal =
            this.state.animatingGeneration &&
            (this.state.animationPhase === 'first' || this.state.animationPhase === 'rows');
        const transitionDuration = firstTime
            ? 0
            : (interpOverride !== undefined) || atEndpoint
              ? 0
              : genAnimReveal
                ? 0
                : this.state.animatingGeneration && this.state.animationPhase === 'all'
                  ? 1000
                  : TRANSITION_DURATION;
        const isUntangled = interp < INTERACT_THRESHOLD;
        const linkPathD = (d: LinkDatum) => {
            const ep = this.getLinkEndpoints!(d);
            let sourceX = ep.sourceX, targetX = ep.targetX, y1 = ep.y1, y2 = ep.y2;
            let sourceRightX = ep.sourceRightX, targetLeftX = ep.targetLeftX;
            if (this.link1DEndpoints.has(d)) {
                const e1d = this.link1DEndpoints.get(d)!;
                const s1 = this.scale1DToLayout(e1d.sourceX, e1d.sourceY);
                const t1 = this.scale1DToLayout(e1d.targetX, e1d.targetY);
                sourceX = interp * ep.sourceX + (1 - interp) * s1.x;
                targetX = interp * ep.targetX + (1 - interp) * t1.x;
                y1 = interp * ep.y1 + (1 - interp) * s1.y;
                y2 = interp * ep.y2 + (1 - interp) * t1.y;
                sourceRightX = interp * ep.sourceRightX + (1 - interp) * s1.x;
                targetLeftX = interp * ep.targetLeftX + (1 - interp) * t1.x;
            }
            const points = [
                { x: sourceX, y: y1 },
                { x: sourceRightX, y: y1 },
                { x: targetLeftX, y: y2 },
                { x: targetX, y: y2 }
            ];
            // When nearly horizontal (1D view), curveMonotoneY can produce degenerate paths - use Linear
            const horizSpan = Math.abs(sourceRightX - targetLeftX);
            const vertSpan = Math.abs(y1 - y2);
            const isHorizontal = vertSpan < 2 || (horizSpan > 1 && vertSpan / (horizSpan || 1) < 0.05);
            return d3.line<{ x: number, y: number }>()
                .x((p: { x: number; y: number }) => p.x)
                .y((p: { x: number; y: number }) => p.y)
                .curve(isHorizontal ? d3.curveLinear : d3.curveMonotoneY)(points);
        };

        // Transition path in sync with nodes to avoid edges leading/lagging
        const linkPaths = this.links.select('.link-visible').transition().duration(transitionDuration).ease(d3.easeSinInOut);
        linkPaths.attr("d", (d: LinkDatum) => linkPathD(d));
        this.links.select('.link-hit')
            .transition().duration(transitionDuration).ease(d3.easeSinInOut)
            .attr("d", (d: LinkDatum) => linkPathD(d));


        // Choose opacity based on animation state
        const totalGen = this.props.promptGroups.reduce((acc, g) => acc + g.generations.length, 0);
        const hideThreshold = Math.min(totalGen, Math.floor(this.state.minOpacityThreshold * 5));
        const opacity = (d: NodeDisplayDatum) => {
            const node = getNode(d);
            if (node.word === '' || !this.opacityScale) return 0;
            if (node.count <= hideThreshold) return 0;
            if (this.state.animatingGeneration) {
                if (this.state.animationPhase === 'first') {
                    const step = this.getFirstGenStep(node);
                    if (step > this.state.animationWordIdx) return 0;
                }
                if (this.state.animationPhase === 'rows') {
                    let sent: number;
                    if ('sentIdx' in d && typeof (d as NodeInstance1D).sentIdx === 'number') {
                        sent = (d as NodeInstance1D).sentIdx;
                    } else {
                        sent =
                            node.origSentIndices?.length > 0
                                ? Math.min(...node.origSentIndices)
                                : 0;
                    }
                    if (sent > this.state.animationWordIdx) return 0;
                }
            }
            return this.opacityScale(node.count);
        };
        const nodeOpacity = (d: NodeDisplayDatum) => {
            const o = opacity(d);
            if (this.state.animatingGeneration && this.state.animationPhase === 'first') {
                return o;
            }
            return isUntangled ? 1 : o;
        };
        const linkOpacity = (d: LinkDatum) => {
            const so = opacity(d.source);
            const to = opacity(d.target);
            // Hide edge entirely when either endpoint node is hidden
            if (so === 0 || to === 0) return 0;
            if (this.state.animatingGeneration && this.state.animationPhase === 'first') {
                if (!this.isInFirstGeneration(d.source) || !this.isInFirstGeneration(d.target)) return 0;
            }
            return ((so + to) / 2) * 0.2; // match gradient multiplier from graph mode
        };
        const nPrompts = this.props.promptGroups.length;
        /** Multi-prompt figures: solid per-prompt stroke tracks text color; URL gradients key off link index and can mismatch. */
        const usePromptSolidEdges = nPrompts > 1 && interp >= 0.35;
        this.links.select('.link-visible')
            .attr("stroke", (d: LinkDatum, i: number) => {
                const idx = d.promptId ? color_utils.getPromptIndexFromId(d.promptId, this.promptOrder()) : 0;
                const color = color_utils.MILLER_STONE_COLORS[idx % color_utils.MILLER_STONE_COLORS.length];
                if (interp < 0.35) {
                    return color;
                }
                if (usePromptSolidEdges) {
                    return color;
                }
                return `url(#gradient-${i})`;
            })
            .attr("stroke-width", 2)
            .attr("stroke-opacity", (d: LinkDatum) => {
                if (interp < 0.35) return linkOpacity(d);
                if (usePromptSolidEdges) return linkOpacity(d);
                return 1;
            })
            .style('filter', (d: LinkDatum) => isUntangled ? 'none' : getBlur(d));
        this.links.style('pointer-events', isUntangled ? 'none' : 'auto');

        // Update gradient opacity when selection/hover changes (skip when in 1D mode - uses solid stroke)
        if (interp >= 0.35 && !usePromptSolidEdges) {
            const multiplier = .2;
            this.links.each((d: LinkDatum, i: number) => {
                let sourceOpacity = opacity(d.source);
                let targetOpacity = opacity(d.target);
                if (this.state.animatingGeneration && this.state.animationPhase === 'first') {
                    if (!this.isInFirstGeneration(d.source) || !this.isInFirstGeneration(d.target)) {
                        sourceOpacity = 0;
                        targetOpacity = 0;
                    }
                }
                // Hide edge entirely when either endpoint node is hidden
                if (sourceOpacity === 0 || targetOpacity === 0) {
                    sourceOpacity = 0;
                    targetOpacity = 0;
                }
                this.defs!.selectAll(`#gradient-${i} stop`)
                    .attr("stop-opacity", (_: any, j: number) => (j === 0 ? sourceOpacity : targetOpacity) * multiplier);
            });
        }

        // interp >= GRAPH_THRESHOLD: collapsed (one per graph node). Otherwise: exploded (one per path position).
        // Use original node refs (not spread copies) so getNodeColor link.source===node matches
        const useCollapsed = interp >= GRAPH_THRESHOLD || this.nodeInstances1D.length === 0;
        const nodeData: NodeDisplayDatum[] = useCollapsed
            ? this.nodesData.filter((n) => n != null)
            : this.nodeInstances1D
                .filter((ni) => ni?.node != null)
                .map((ni) => ({ ...ni, word: ni.origWord })); // use original word from generation
        const nodeKey = (d: NodeDisplayDatum) => {
            if (d == null) return '__undefined__';
            if ('node' in d && d.node != null) {
                return `${(d as NodeInstance1D).node.word}-${(d as NodeInstance1D).sentIdx}`;
            }
            return ((d as NodeDatum).word ?? '__missing__') as string;
        };
        const useUniformFont = !useCollapsed;

        const nodeSelection = this.mainGroup!.selectAll<SVGGElement, NodeDisplayDatum>(".node")
            .data(nodeData, nodeKey as any);

        const entered = nodeSelection.enter().append("g")
            .attr("class", "node")
            .on('mouseover', (event: any, d: NodeDisplayDatum) => {
                this.setState({ hoveredNode: getNode(d), hoveredSentIndices: getNode(d).origSentIndices });
            })
            .on('mouseout', () => {
                this.setState({ hoveredNode: null, hoveredSentIndices: null });
            })
            .on('click', (event: any, d: NodeDisplayDatum) => {
                const zoomWasArmed = this.chartZoomArmedSync;
                this.armChartZoom();
                if (!zoomWasArmed) return;
                const n = getNode(d);
                // When nodes are selected, only allow clicking nodes in same sentences. First click: allow any node.
                if (this.nodeSelected() && !this.nodeIsInSelectedSents(n)) return;
                if (this.selectedNodes.has(n)) {
                    this.selectedNodes.delete(n);
                    this.setState({ hoveredNode: null, hoveredSentIndices: null });
                } else {
                    this.selectedNodes.add(n);
                    this.setState({ hoveredNode: null, hoveredSentIndices: null });
                }
                this.updateSimulation();
                this.update();
            });

        entered.append("text").attr("font-size", this.linearFontSize());

        const getTransform = (d: NodeDisplayDatum) => {
            const node = getNode(d);
            if (!useCollapsed && 'sentIdx' in d) {
                const ni = d as NodeInstance1D & { word: string };
                const s = this.scale1DToLayout(ni.x, ni.y);
                const x = interp * node.x + (1 - interp) * s.x;
                const y = interp * node.y + (1 - interp) * s.y;
                return `translate(${x}, ${y})`;
            }
            const avg1d = this.getNodeAvg1DPos(node);
            if (avg1d && interp < 1) {
                const s = this.scale1DToLayout(avg1d.x, avg1d.y);
                const x = interp * node.x + (1 - interp) * s.x;
                const y = interp * node.y + (1 - interp) * s.y;
                return `translate(${x}, ${y})`;
            }
            return `translate(${node.x}, ${node.y})`;
        };

        // Set initial transform on entered nodes so they don't animate from (0,0)
        entered.attr("transform", getTransform);
        entered.style('opacity', (d: NodeDisplayDatum) => nodeOpacity(d));

        const merged = entered.merge(nodeSelection);
        if (useUniformFont) {
            // In untangle (1D) mode: single line per word; font size is uniform or variable per UNIFORM_FONT_IN_LINEAR_MODE
            merged.select("text").each(function (d: NodeDisplayDatum) {
                const text = d3.select(this);
                text.text(null)
                    .attr("text-anchor", "start")
                    .append("tspan")
                    .attr("x", 0)
                    .attr("dy", 0)
                    .text(d.word);
            });
        } else {
            merged
                .select<SVGTextElement>("text")
                .call((sel) => this.wrapText(sel as d3.Selection<SVGTextElement, any, any, any>));
        }
        const nodeFontSize = (d: NodeDisplayDatum) => (getNode(d) as NodeDatum).fontSize;
        merged.select("text")
            .attr("font-size", (d: NodeDisplayDatum) =>
                useUniformFont
                    ? (UNIFORM_FONT_IN_LINEAR_MODE ? this.linearFontSize() : nodeFontSize(d))
                    : this.linearFontSize() + interp * (nodeFontSize(d) - this.linearFontSize())
            )
            .attr("text-anchor", "start");

        const nodeColor = (d: NodeDisplayDatum) =>
            getNodeColor(getNode(d), this.linksData, this.promptOrder());
        merged.attr('fill', nodeColor);

        merged
            .transition().duration(transitionDuration).ease(d3.easeSinInOut)
            .attr("transform", getTransform)
            .attr('fill', nodeColor)
            .style('opacity', (d: NodeDisplayDatum) => nodeOpacity(d))
            .style('font-weight', (d: NodeDisplayDatum) =>
                !isUntangled && (this.selectedNodes.has(getNode(d)) || this.state.hoveredNode === getNode(d)) ? 'bold' : 'normal'
            )
            .style('filter', (d: NodeDisplayDatum) => isUntangled ? 'none' : getBlur(d))
            .style('pointer-events', isUntangled ? 'none' : 'auto');

        nodeSelection.exit().remove();

        this.nodes = merged as any;
    };

    // Create the simulation.
    private updateSimulation(firstTime: boolean = false, fitViewport: boolean = false) {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation.force('x', null);
            this.simulation.force('y', null);
            this.simulation.force('link', null);
            this.simulation.force('collide', null);
        }
        this.simulation = d3.forceSimulation(this.nodesData);

        const selectedLinks = this.nodeSelected() ? this.linksData.filter(d => this.linkIsInSents(d)) : this.linksData;
        const selectedNodes = this.nodeSelected() ? this.nodesData.filter(d => this.nodeIsInSelectedSents(d)) : this.nodesData;
        
        // If separating by prompt, add a force to separate graphs vertically
        let yForce: any;
        if (this.state.separateByPrompt && this.props.promptGroups.length > 1) {
            // Create vertical spacing based on prompt ID
            const promptIdToIndex = new Map<string, number>();
            this.props.promptGroups.forEach((group, idx) => {
                promptIdToIndex.set(group.promptId, idx);
            });
            
            const numPrompts = this.props.promptGroups.length;
            // Cap layout height so graphs stay reasonably close when SVG is tall (many generations in 1D mode)
            const layoutHeight = Math.min(this.height, MAX_GRAPH_LAYOUT_HEIGHT);
            const spacing = layoutHeight / numPrompts;
            // Center the prompt bands vertically in the SVG (avoid top-aligned offset when height > layoutHeight)
            const bandTop = (this.height - layoutHeight) / 2;
            const baseY = bandTop;

            yForce = d3.forceY((d: any) => {
                // Get the first prompt ID from the node's origPromptIds
                const firstPromptId = d.origPromptIds?.[0];
                if (firstPromptId && promptIdToIndex.has(firstPromptId)) {
                    const promptIndex = promptIdToIndex.get(firstPromptId)!;
                    return baseY + spacing * (promptIndex + 0.5);
                }
                return this.height / 2;
            }).strength(0.5);
        } else {
            // Uniform Y pull so the cluster centers in the viewport (count-weighted strength skews rare nodes up/down)
            yForce = d3.forceY(this.height / 2).strength(0.12);
        }
        
        this.simulation
            .nodes(selectedNodes)
            .force("collide", ellipseForce(selectedNodes, 10, 5, 5))
            .force("link", d3.forceLink(selectedLinks)
                .id((d: any) => d.word)
                .strength(.4))
            .force("y", yForce)
            .force("x", () => selectedNodes.forEach((d: NodeDatum) => d.x = this.getExpectedX(d, selectedNodes)));

        // Run convergence without tick handler to avoid 1000s of DOM updates; render once at end
        this.runSimulationToConvergence();
        this.update(firstTime);
        if (fitViewport) {
            this.fitGraphToViewport();
            // First paint often runs before flex/CSS layout is final; refit once the SVG has real client metrics.
            requestAnimationFrame(() => this.fitGraphToViewport());
        }
    }

    /**
     * Runs a D3 simulation until it converges to stable positions
     * @param simulation - The D3 force simulation
     * @param nodesData - Array of node data
     * @param update - Function to call after each tick for visual updates
     * @param convergenceThreshold - Stop when movement is less than this threshold (default: 1 pixel)
     * @param maxIterations - Maximum number of iterations (default: 1000)
     */
    private runSimulationToConvergence(
        epsilon: number = 0.1,
        maxIterations: number = 1000
    ): void {
        if (!this.simulation) {
            return;
        }
        this.simulation.stop();
        let converged = false;
        let iteration = 0;

        while (!converged && iteration < maxIterations) {
            this.simulation.tick();
            converged = this.simulation.nodes().every(n =>
                Math.abs(n.vx) < epsilon && Math.abs(n.vy) < epsilon
            );
            iteration++;
        }
    }

    private linkIsInSents(d: any) {
        if (this.nodeSelected()) {
            // Check if link is in any of the selected nodes' sentences
            return Array.from(this.selectedNodes).some(node => node.origSentIndices.includes(d.sentIdx));
        }
        const hovered = this.state.hoveredSentIndices;
        return hovered != null && hovered.includes(d.sentIdx);
    }

    private nodeIsInSelectedSents(d: NodeDatum) {
        if (this.nodeSelected()) {
            // Check if node shares sentences with any selected node
            const selectedSents = new Set<number>();
            Array.from(this.selectedNodes).forEach(node => {
                node.origSentIndices.forEach(sentIdx => selectedSents.add(sentIdx));
            });
            return d.origSentIndices.some(sentIdx => selectedSents.has(sentIdx));
        }
        const hovered = this.state.hoveredSentIndices;
        if (!hovered) return false;
        return d.origSentIndices.some(sentIdx => hovered.includes(sentIdx));
    }

    /** Add a bounding box rectangle to each node (for collision calculation) */
    private addBoundingBoxData(nodes: NodeDatum[]) {
        nodes.forEach((node) => {
            node.rx = node.textLength / 2;
            node.ry = this.textHeight(node) / 2;
        });
    }

    /** Build 1D layout: one row per generation, words placed with pixel-based spacing */
    private build1DLayout() {
        this.nodeInstances1D = [];
        this.link1DEndpoints.clear();
        if (!this.linksData.length) return;

        const nRows = this.props.promptGroups.reduce((acc, g) => acc + g.generations.length, 0);
        if (nRows === 0) return;

        const linksForSent = (sentIdx: number) => this.linksData.filter((d) => d.sentIdx === sentIdx);

        // Build path + origWords per sentIdx
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
                return (raw === ' ' || raw === '') ? '' : raw;
            });
            pathsBySent.set(sentIdx, { path, origWords });
        }

        const sentIdxs = [...pathsBySent.keys()].sort((a, b) => a - b);
        // Map sentIdx -> promptIndex (for extra vertical spacing between prompts when separateByPrompt is false)
        const sentIdxToPromptIndex = new Map<number, number>();
        let runningIdx = 0;
        for (let g = 0; g < this.props.promptGroups.length; g++) {
            for (let i = 0; i < this.props.promptGroups[g].generations.length; i++) {
                sentIdxToPromptIndex.set(runningIdx, g);
                runningIdx++;
            }
        }
        const rowData: { sentIdx: number; path: NodeDatum[]; origWords: string[]; xPx: number[] }[] = [];

        for (const sentIdx of sentIdxs) {
            const { path, origWords } = pathsBySent.get(sentIdx)!;
            const xPx: number[] = [];
            let cumul = 0;
            for (let i = 0; i < origWords.length; i++) {
                xPx.push(cumul);
                const fs = UNIFORM_FONT_IN_LINEAR_MODE ? this.linearFontSize() : path[i].fontSize;
                cumul +=
                    this.measureTextWidth(origWords[i], fs) +
                    (i < origWords.length - 1 ? this.listGapPx() : 0);
            }
            rowData.push({ sentIdx, path, origWords, xPx });
        }

        // Use fixed REFERENCE_ROW_WIDTH_1D so spacing looks consistent across different prompts
        // Y uses row index + prompt offset so lines follow each other with gaps between prompt groups
        const xNorm = (v: number) => v / REFERENCE_ROW_WIDTH_1D;
        const nPrompts = this.props.promptGroups.length;
        const promptOffset = (nPrompts > 1 && !this.state.separateByPrompt)
            ? PROMPT_SEPARATOR_1D / ROW_SPACING_1D
            : 0; // extra "logical rows" per prompt boundary
        for (const { sentIdx, path, origWords, xPx } of rowData) {
            const rowIndex = sentIdxs.indexOf(sentIdx);
            const promptIndex = sentIdxToPromptIndex.get(sentIdx) ?? 0;
            const yLogical = rowIndex + promptIndex * promptOffset;

            for (let i = 0; i < path.length; i++) {
                this.nodeInstances1D.push({
                    node: path[i],
                    sentIdx,
                    x: xNorm(xPx[i]),
                    y: yLogical,
                    origWord: origWords[i],
                });
            }
            for (let i = 0; i < path.length - 1; i++) {
                const link = this.linksData.find(
                    (d) => d.sentIdx === sentIdx && d.source === path[i] && d.target === path[i + 1]
                );
                if (link) {
                    this.link1DEndpoints.set(link, {
                        sourceX: xNorm(xPx[i]),
                        sourceY: yLogical,
                        targetX: xNorm(xPx[i + 1]),
                        targetY: yLogical,
                    });
                }
            }
        }
    }

    /** Measure text width for 1D layout; font-size-based so it's consistent across window sizes */
    private measureTextWidth(text: string, fontSize?: number): number {
        const fs = fontSize ?? this.linearFontSize();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return ((text ?? '').replace(/^##/, '')).length * PX_PER_CHAR_1D;
        }
        ctx.font = `${fs}px monospace`;
        return ctx.measureText((text ?? '').replace(/^##/, '')).width;
    }

    /** Scale 1D coords to layout pixel space; font-size-based, no window dependency */
    private scale1DToLayout(xNorm: number, yRowIndex: number): { x: number; y: number } {
        const x = this.layoutMarginLeft() + xNorm * REFERENCE_ROW_WIDTH_1D;
        const y = this.layoutMarginTop() + yRowIndex * ROW_SPACING_1D;
        return { x, y };
    }

    /** Average 1D position for a node (across all generations it appears in) */
    private getNodeAvg1DPos(node: NodeDatum): { x: number; y: number } | null {
        const instances = this.nodeInstances1D.filter((ni) => ni.node === node);
        if (instances.length === 0) return null;
        const sumX = instances.reduce((s, ni) => s + ni.x, 0);
        const sumY = instances.reduce((s, ni) => s + ni.y, 0);
        return {
            x: sumX / instances.length,
            y: sumY / instances.length,
        };
    }

    private getExpectedX(d: NodeDatum, nodesData: NodeDatum[]) {
        const padBetweenWords = 30;
        // const padBetweenWords = this.fontSize(d) * 5;
        const parents = d.parents.filter(p => nodesData.includes(p));
        if (d.isRoot && !parents.length) {
            return padBetweenWords;
        }
        if (!parents.length) {
            return d.x;
        }
        const parentLefts = parents.map(p => p.x + p.textLength + padBetweenWords);
        const min = d3.min(parentLefts) || 0;
        const max = d3.max(parentLefts) || 0;
        const mean = d3.mean(parentLefts) || 0;
        const scale = d3.scaleLinear()
            .domain([0, 0.5, 1])
            .range([min, mean, max]);

        return scale(this.state.spread);
    }

    private getExpectedY(d: NodeDatum, height: number) {
        const avgSentIndex = d3.min(d.origSentIndices || []) || 0;
        const totalSents = this.props.promptGroups.reduce((acc, g) => acc + g.generations.length, 0);

        // Use D3 linear scale for Y positioning
        const yScale = d3.scaleLinear()
            .domain([0, totalSents])
            .range([height * 0.1, height * 0.9]);

        return yScale(avgSentIndex);
    }

    private fontSize(d: any) {
        if (!this.fontScale) {
            return 10; // Default font size
        }
        return this.fontScale(d.count);
    }

    private textLength(d: any) {
        const chunkLengths = chunkText(d.word, this.wrapChunkSize()).map(chunk => {
            return chunk.length * d.fontSize * 0.6; // Adjusted
        });
        return d3.max(chunkLengths) || 0;
    }

    private textHeight(d: any) {
        return chunkText(d.word, this.wrapChunkSize()).length * d.fontSize;
    }


    private wrapText(selection: d3.Selection<SVGTextElement, any, any, any>) {
        const wrap = this.wrapChunkSize();
        selection.each(function (d) {
            const text = d3.select(this);
            const chunks = chunkText(d.word, wrap);

            text.text(null)
                .attr("text-anchor", "start")
                .selectAll("tspan")
                .data(chunks)
                .enter()
                .append("tspan")
                .attr("x", 0)
                .attr("dy", (_d, i) => `${i === 0 ? 0 : 1.2}em`)
                .text((line: any) => line);
        });
    }

    private firstGenStepMapping: Map<NodeDatum, number> | null = null;

    private buildFirstGenStepMapping(): void {
        // Get the first generation sentIdx from each prompt group
        const firstGenSentIndices = new Set<number>();
        let currentSentIdx = 0;
        for (const group of this.props.promptGroups) {
            if (group.generations.length > 0) {
                firstGenSentIndices.add(currentSentIdx);
            }
            currentSentIdx += group.generations.length;
        }
        
        // Find all nodes in first generation and assign sequential step numbers
        const firstGenNodes = this.nodesData
            .filter(node => node.origSentenceInfo?.some(info => firstGenSentIndices.has(info.sentIdx)))
            .map(node => {
                const firstGenInfo = node.origSentenceInfo!.find(info => firstGenSentIndices.has(info.sentIdx));
                return { node, startWordIdx: firstGenInfo!.wordIdx };
            })
            .sort((a, b) => a.startWordIdx - b.startWordIdx);
        
        const cap = this.props.animateFirstGenerationMaxSteps;
        this.firstGenStepMapping = new Map();
        firstGenNodes.forEach(({ node }, index) => {
            if (cap != null && index >= cap) return;
            this.firstGenStepMapping!.set(node, index);
        });
    }

    private isInFirstGeneration(node: NodeDatum): boolean {
        if (!this.firstGenStepMapping) {
            this.buildFirstGenStepMapping();
        }
        return this.firstGenStepMapping!.has(node);
    }

    private getFirstGenStep(node: NodeDatum): number {
        if (!this.firstGenStepMapping) {
            this.buildFirstGenStepMapping();
        }
        return this.firstGenStepMapping!.get(node) ?? Infinity;
    }

    private animateGeneration = () => {
        if (this.state.animatingGeneration) return;

        this.firstGenStepMapping = null;
        this.buildFirstGenStepMapping();
        if (this.firstGenStepMapping!.size === 0) return;

        this.setState(
            {
                animatingGeneration: true,
                animationWordIdx: -1,
                animationPhase: 'first',
            },
            () => {
                this.update();
                this.startFirstGenStepTimers();
            }
        );
    };

    private startFirstGenStepTimers() {
        if (this.animationTimer !== null) {
            clearTimeout(this.animationTimer);
            this.animationTimer = null;
        }
        this.firstGenStepMapping = null;
        this.buildFirstGenStepMapping();
        const maxStep = this.firstGenStepMapping!.size - 1;
        if (maxStep < 0) {
            this.setState(
                {
                    animatingGeneration: false,
                    animationWordIdx: -1,
                    animationPhase: 'first',
                },
                () => this.update()
            );
            return;
        }

        const stepMs = this.props.animationStepMs ?? 500;
        const startDelay = this.props.animationInitialDelayMs ?? 800;

        let currentStep = 0;

        const animateFirstGenStep = () => {
            if (currentStep > maxStep) {
                this.setState({
                    animationPhase: 'all',
                    animationWordIdx: Infinity,
                });
                this.update();

                this.animationTimer = window.setTimeout(() => {
                    this.setState({
                        animatingGeneration: false,
                        animationWordIdx: -1,
                        animationPhase: 'first',
                    });
                    this.animationTimer = null;
                }, 1000);
                return;
            }

            this.setState({ animationWordIdx: currentStep });
            this.update();

            currentStep++;
            this.animationTimer = window.setTimeout(animateFirstGenStep, stepMs);
        };

        this.animationTimer = window.setTimeout(animateFirstGenStep, startDelay);
    }

    /** Reveal list rows in sentIdx order (0, 1, …); uses animationWordIdx as max visible sent index. */
    private startGenerationRowRevealTimers() {
        if (this.animationTimer !== null) {
            clearTimeout(this.animationTimer);
            this.animationTimer = null;
        }
        const totalSents = this.props.promptGroups.reduce((acc, g) => acc + g.generations.length, 0);
        const maxIdx = totalSents - 1;
        if (maxIdx < 0) {
            this.setState(
                {
                    animatingGeneration: false,
                    animationWordIdx: -1,
                    animationPhase: 'first',
                },
                () => this.update()
            );
            return;
        }

        const stepMs = this.props.animationStepMs ?? 500;
        const startDelay = this.props.animationInitialDelayMs ?? 800;
        let current = 0;

        const tick = () => {
            if (current > maxIdx) {
                this.setState(
                    {
                        animatingGeneration: false,
                        animationWordIdx: -1,
                        animationPhase: 'first',
                    },
                    () => this.update()
                );
                this.animationTimer = null;
                return;
            }
            this.setState({ animationWordIdx: current }, () => this.update());
            current++;
            this.animationTimer = window.setTimeout(tick, stepMs);
        };

        this.animationTimer = window.setTimeout(tick, startDelay);
    }
}

// Cache for chunkText results
const chunkTextCache = new Map<string, string[]>();

function chunkText(text: string, wordsPerChunk: number = NUM_WORDS_TO_WRAP) {
    const safeKey = `${text ?? ''}\0${wordsPerChunk}`;
    if (chunkTextCache.has(safeKey)) {
        return chunkTextCache.get(safeKey)!;
    }

    const displayStr = (utils.unformat(text) ?? text ?? '').toString();
    const words = displayStr.split(/\s+/).filter((w) => w.length > 0);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    if (chunks.length === 0) {
        chunks.push('');
    }

    chunkTextCache.set(safeKey, chunks);
    return chunks;
}


export default ExamplesWordGraphUntangle;
