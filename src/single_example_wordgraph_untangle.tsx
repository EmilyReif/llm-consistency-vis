import React from "react";
import './single_example_wordgraph.css';
import { observer } from "mobx-react";
import * as utils from './utils';
import * as color_utils from './color_utils';
import * as d3 from "d3";
import { ellipseForce } from "./force_collide_ellipse";
import { getNodeColor } from './color_utils';
import { state } from './state';
import NodeExamplesPopup from './node_examples_popup';
import { telemetry } from "./telemetry";
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import { urlParams, URLParam, TokenizeMode } from "./url_params_manager";

const TRANSITION_DURATION = 300;
/** Duration (ms) for untangle toggle animation */
const UNTANGLE_ANIMATION_DURATION = 1000;
const SLIDER_WIDTH = 150;
const LAYOUT_MARGIN = 60;
/** Pixel spacing between rows in 1D mode */
const ROW_SPACING_1D = 20;
/** Extra vertical gap between prompt groups in 1D mode (when separate by prompt is unchecked) */
const PROMPT_SEPARATOR_1D = 24;
const UNIFORM_FONT_SIZE = 11; // Used when fully untangled (1D view)
const GRAPH_THRESHOLD = 1; // At or above this, use collapsed nodes; keep 1 so collapse happens only at end (avoids jump)
const INTERACT_THRESHOLD = 0.7; // Below this, disable hover/click/select in graph mode
/** Pixel width per character fallback when measurement unavailable */
const PX_PER_CHAR_1D = 2;
/** Scale measured width to match layout density (measured ~2.5x larger than char*2 at 11px) */
const MEASURED_WIDTH_SCALE = 0.3;
/** Gap between words in 1D mode */
const GAP_PX_1D = 4;
/** Fixed reference width for 1D layout scale - keeps spacing visually consistent across different prompts/datasets */
const REFERENCE_ROW_WIDTH_1D = 500;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_MIN_OPACITY_THRESHOLD = 0;
const DEFAULT_SPREAD = 0.5;

interface Props {
    // Prompts (grouped inputs for multi-prompt)
    promptGroups: { promptId: string, generations: string[] }[];
}

interface State {
    popupNodes: NodeDatum[];
    hoveredNode: NodeDatum | null;
    hoveredSentIndices: number[] | null;
    isPopupVisible: boolean;
    similarityThreshold: number;
    minOpacityThreshold: number;
    spread: number;
    tokenizeMode: TokenizeMode;
    separateByPrompt: boolean;
    animatingGeneration: boolean;
    animationWordIdx: number;
    animationPhase: 'first' | 'all';
    /** true = 1D text lines, false = full computed graph */
    isUntangled: boolean;
    /** Animated 0–1, drives smooth transition when toggling */
    interpolationFraction: number;
}

const NUM_WORDS_TO_WRAP = 5;
const SHOW_DEBUG_ELLIPSES = false;

// Information about how a node appears in a specific sentence
export interface OrigSentenceInfo {
    sentIdx: number;
    wordIdx: number; // position in the tokenized sentence
    origWords: string[]; // the actual word(s) from the original sentence
}

// The structure of each node in the graph.
export interface NodeDatum {
    word: string;

    // Number of times the word appears overall.
    count: number;
    // Derived from origSentenceInfo: unique sentence indices where this word appears
    // (maintained separately for efficient lookups)
    origSentIndices: number[];
    // Optional: which prompts contributed to this node
    origPromptIds?: string[];
    // Detailed info about each occurrence in original sentences
    // origSentIndices is derived from this data after parsing
    origSentenceInfo?: OrigSentenceInfo[];

    // Parent and child nodes.
    children: NodeDatum[];
    parents: NodeDatum[];

    isEnd?: boolean;
    isRoot?: boolean;

    fontSize: number;
    textLength: number;

    // Used by force simulation.
    x: number;
    y: number;
    vx: number;
    vy: number;

    // Used by ellipsis collide function.
    rx: number;
    ry: number;
}

export interface LinkDatum {
    source: NodeDatum;
    target: NodeDatum;
    // Optional: for multi-prompt coloring
    promptId?: string;
    sentIdx: number;
}

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
class SingleExampleWordGraphUntangle extends React.Component<Props, State> {
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
    private lastTransform: { k: number; x: number; y: number } | null = null;
    private zoomThrottleTimer: number | null = null;
    /** Cached 1D layout for interpolation: one instance per (node, sentIdx) */
    private nodeInstances1D: NodeInstance1D[] = [];
    /** Cached 1D endpoints per link for interpolation */
    private link1DEndpoints: Map<LinkDatum, Link1DEndpoints> = new Map();
    private mainGroup: d3.Selection<SVGGElement, unknown, HTMLElement, any> | null = null;
    constructor(props: Props) {
        super(props);
        // Parse URL parameter for separate_graphs using URLParamsManager
        const separateByPrompt = urlParams.getBoolean(URLParam.SEPARATE_GRAPHS);
        
        this.state = {
            popupNodes: [],
            hoveredNode: null,
            hoveredSentIndices: null,
            isPopupVisible: true,
            similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
            minOpacityThreshold: DEFAULT_MIN_OPACITY_THRESHOLD,
            spread: DEFAULT_SPREAD,
            tokenizeMode: state.tokenizeMode,
            separateByPrompt,
            animatingGeneration: false,
            animationWordIdx: -1,
            animationPhase: 'first',
            isUntangled: false,
            interpolationFraction: 1,
        };
    }

    componentDidMount() {
        this.rebuildGraph();
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
        // Clean up throttle timer
        if (this.zoomThrottleTimer !== null) {
            clearTimeout(this.zoomThrottleTimer);
            this.zoomThrottleTimer = null;
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
        if (event.key === 'Escape') {
            this.selectedNodes.clear();
            this.setState({ popupNodes: [], hoveredNode: null, hoveredSentIndices: null });
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

        // Create opacity scale where count maps to opacity from 0 to 1
        this.opacityScale = d3.scalePow()
            .exponent(.5)
            .domain([(this.state.minOpacityThreshold - .3) * totalGenerations / 2, totalGenerations / 2])
            .range([0, 1])
            .clamp(true)
            .nice();

        this.nodesData.forEach((node) => node.fontSize = this.fontSize(node));
        this.nodesData.forEach((node) => node.textLength = this.textLength(node));
    }

    render() {
        // Empty svg element that will be populated with the graph.
        return (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <span id='loader' className="loader"></span>
                <svg id='graph-holder'></svg>
                {!state.isUserStudy && <div className="graph-controls-overlay">
                    <div className="checkbox-container">
                        <label title="Switch between graph view and simple 1D text lines per generation">
                            <input
                                type="checkbox"
                                checked={this.state.isUntangled}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    this.setState({ isUntangled: checked });
                                    telemetry.logSliderChange('interpolation', checked ? 0 : 1);
                                }}
                            />
                            Untangle
                        </label>
                    </div>

                    <div className="slider-container">
                        <label>Graph spread</label>
                        <div className="tooltip">
                            How spread out the graph is. Higher values means every output is rendered more like standard LTR text, lower values means the graph is more compact.
                        </div>
                        <Box sx={{ width: SLIDER_WIDTH }}>
                            <Slider
                                size="small"
                                min={0}
                                max={1}
                                step={0.1}
                                value={this.state.spread}
                                onChange={(e, value) => {
                                    this.setState({ spread: value as number });
                                    telemetry.logSliderChange('spread', value as number);
                                }}
                                valueLabelDisplay="off"
                                aria-label="Graph spread"
                            />
                        </Box>
                    </div>

                    <div className="slider-container">
                        <label>Hide Rare Outputs</label>
                        <div className="tooltip">
                            How strongly rare outputs are faded. Higher values hide nodes and edges that appear infrequently across outputs.
                        </div>
                        <Box sx={{ width: SLIDER_WIDTH }}>
                            <Slider
                                size="small"
                                min={0}
                                max={1}
                                step={0.1}
                                value={this.state.minOpacityThreshold}
                                onChange={(e, value) => {
                                    this.setState({ minOpacityThreshold: value as number });
                                    telemetry.logSliderChange('minOpacityThreshold', value as number);
                                }}
                                valueLabelDisplay="off"
                                aria-label="Hide Rare Outputs"
                            />
                        </Box>
                    </div>

                    <div className="slider-container">
                        <label>Token merging threshold</label>
                        <div className="tooltip">
                            How similar words need to be to be merged in the graph. Lower values merge more words together, higher values keep more words separate.
                        </div>
                        <Box sx={{ width: SLIDER_WIDTH }}>
                            <Slider
                                size="small"
                                min={0}
                                max={1}
                                step={0.1}
                                value={this.state.similarityThreshold}
                                onChange={(e, value) => {
                                    this.setState({ similarityThreshold: value as number });
                                    telemetry.logSliderChange('similarityThreshold', value as number);
                                }}
                                valueLabelDisplay="auto"
                                aria-label="Merging coefficient"
                            />
                        </Box>
                    </div>

                    <div className="dropdown-container">
                        <label>Tokenize Mode:</label>
                        <select
                            value={this.state.tokenizeMode}
                            onChange={(e) => {
                                const newMode = e.target.value as TokenizeMode;
                                this.setState({ tokenizeMode: newMode });
                                state.setTokenizeMode(newMode);
                                // Note: URL sync happens automatically via MobX reaction in state.tsx
                                telemetry.logDropdownChange('tokenizeMode', newMode);
                            }}
                        >
                            <option value="space">Space</option>
                            <option value="comma">Comma</option>
                            <option value="sentence">Sentence</option>
                        </select>
                    </div>

                    <div className="checkbox-container">
                        <label>
                            <input
                                type="checkbox"
                                checked={this.state.separateByPrompt}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    this.setState({ separateByPrompt: checked });
                                    // Sync to URL
                                    urlParams.set(URLParam.SEPARATE_GRAPHS, checked);
                                    telemetry.logDropdownChange('separateByPrompt', checked ? 'true' : 'false');
                                }}
                            />
                            Separate graphs by prompt
                        </label>
                    </div>

                    <div className="button-container">
                        <button
                            onClick={this.animateGeneration}
                            disabled={this.state.animatingGeneration}
                        >
                            {this.state.animatingGeneration ? 'Animating...' : 'Animate Generation'}
                        </button>
                    </div>
                </div>}
                {!urlParams.getBoolean(URLParam.HIDE_POPUPS) && (
                    <NodeExamplesPopup
                        nodes={this.state.popupNodes}
                        hoveredNode={this.state.hoveredNode}
                        hoveredSentIndices={this.state.hoveredSentIndices}
                        promptGroups={this.props.promptGroups}
                        isVisible={true}
                        defaultViewState="minimized"
                        onClose={() => this.hidePopup()}
                        onRemoveNode={this.removePopupNode}
                        onExampleHover={(sentIdx) => this.setState({
                            hoveredNode: null,
                            hoveredSentIndices: sentIdx != null ? [sentIdx] : null
                        })}
                    />
                )}
            </div>
        );
    }


    async componentDidUpdate(prevProps: Props, prevState: State) {
        // Sync tokenizeMode with global state if it changed externally
        if (state.tokenizeMode !== this.state.tokenizeMode && state.tokenizeMode !== prevState.tokenizeMode) {
            this.setState({ tokenizeMode: state.tokenizeMode });
            // Return early to let the state update trigger another update cycle
            return;
        }

        const tokenizeModeChanged = prevState.tokenizeMode !== this.state.tokenizeMode;
        const similarityThresholdChanged = prevState.similarityThreshold !== this.state.similarityThreshold;
        const separateByPromptChanged = prevState.separateByPrompt !== this.state.separateByPrompt;
        const promptGroupsChanged = !utils.objectsAreEqual(prevProps.promptGroups, this.props.promptGroups);
        
        // Clear selected/filtered words when prompts change
        if (promptGroupsChanged) {
            this.selectedNodes.clear();
            this.setState({ popupNodes: [], hoveredNode: null, hoveredSentIndices: null });
        }
        
        if (similarityThresholdChanged || tokenizeModeChanged || promptGroupsChanged || separateByPromptChanged) {
            this.rebuildGraph();
        }

        if (prevState.minOpacityThreshold !== this.state.minOpacityThreshold) {
            this.createFontScale();
            this.update();
            return;
        }
        if (prevState.spread !== this.state.spread) {
            this.updateSimulation();
            return;
        }
        if (prevState.isUntangled !== this.state.isUntangled) {
            if (this.state.isUntangled) {
                this.selectedNodes.clear();
                this.setState({ popupNodes: [], hoveredNode: null, hoveredSentIndices: null });
            }
            this.startInterpAnimation(prevState.interpolationFraction, this.state.isUntangled ? 0 : 1);
            return;
        }
        if (prevState.interpolationFraction !== this.state.interpolationFraction) {
            this.update();
            return;
        }
        this.update();

    }

    private toggleLoading(isLoading = false) {
        d3.select("#graph-holder").classed('hidden', isLoading);
        d3.select("#loader").classed('hidden', !isLoading);
    }

    private async rebuildGraph() {
        if (this.interpAnimationFrame !== null) {
            cancelAnimationFrame(this.interpAnimationFrame);
            this.interpAnimationFrame = null;
        }
        this.setState({ interpolationFraction: this.state.isUntangled ? 0 : 1 });
        this.toggleLoading(true);
        setTimeout(async () => {
            // Rebuild the graph.
            await this.rebuildGraphContent();

            // Create the simulation.
            this.updateSimulation(true);
            this.toggleLoading(false);
        }, 0);
    }

    private async rebuildGraphContent() {
        // Generate graph data from all text
        const { nodesData, linksData } = await utils.createGraphDataFromPromptGroups(this.props.promptGroups, this.state.similarityThreshold, state.shuffle, this.state.tokenizeMode, this.state.separateByPrompt);

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
        this.width = Math.min(window.innerWidth, 5000); // 95% of viewport width, max 5000p;x
        this.height = Math.min(window.innerHeight * 0.8, 800); // 70% of viewport height, max 800px
        // Ensure height accommodates row spacing and prompt gaps in 1D mode
        const totalSents = this.props.promptGroups.reduce((acc, g) => acc + g.generations.length, 0);
        const nPrompts = this.props.promptGroups.length;
        const promptGapRows = (nPrompts > 1 && !this.state.separateByPrompt)
            ? (nPrompts - 1) * (PROMPT_SEPARATOR_1D / ROW_SPACING_1D) : 0;
        const minHeight1D = totalSents > 1 ? 2 * LAYOUT_MARGIN + ((totalSents - 1) + promptGapRows) * ROW_SPACING_1D : this.height;
        this.height = Math.max(this.height, minHeight1D);
        const svg = d3.select("#graph-holder")
            .html('')
            .attr("width", this.width)
            .attr("height", this.height)
            .style("cursor", "grab") // Change cursor to indicate draggable
            // Add click handler to the SVG background
            .on('click', (event: any) => {
                // Only clear selection if the click was directly on the SVG background
                if (event.target.tagName === 'svg') {
                    if (this.nodeSelected() || this.state.hoveredNode || this.state.hoveredSentIndices) {
                        this.selectedNodes.clear();
                        this.setState({ popupNodes: [], hoveredNode: null, hoveredSentIndices: null });
                        this.updateSimulation();
                        this.update();
                    }
                }
            });

        // Add a group for all content that will be panned (will-change hints GPU layer for transforms)
        const g = svg.append("g").attr("style", "will-change: transform");
        this.mainGroup = g;

        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.5, 3]) // Allow zoom from 0.5x to 3x
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
                
                // Log telemetry for pan/zoom with throttling
                const transform = event.transform;
                const currentScale = transform.k;
                const currentX = transform.x;
                const currentY = transform.y;
                
                if (this.lastTransform) {
                    const scaleChanged = Math.abs(currentScale - this.lastTransform.k) > 0.01;
                    const panChanged = Math.abs(currentX - this.lastTransform.x) > 1 || Math.abs(currentY - this.lastTransform.y) > 1;
                    
                    // Clear existing throttle timer
                    if (this.zoomThrottleTimer !== null) {
                        clearTimeout(this.zoomThrottleTimer);
                    }
                    
                    // Throttle logging to avoid excessive events
                    this.zoomThrottleTimer = window.setTimeout(() => {
                        if (scaleChanged) {
                            // Log zoom event
                            telemetry.logGraphZoom(currentScale, currentX, currentY);
                        } else if (panChanged) {
                            // Log pan event (only if scale didn't change)
                            telemetry.logGraphPan(currentX, currentY);
                        }
                        this.zoomThrottleTimer = null;
                    }, 100); // Throttle to once per 100ms
                }
                
                this.lastTransform = { k: currentScale, x: currentX, y: currentY };
            });

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
            const strokeColor = edgeColors(String(d.promptId ? color_utils.getPromptIndexFromId(d.promptId) : 0));

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
            if (!this.nodeSelected() && !this.state.hoveredSentIndices) return '';
            const fullBlur = blurFn(.2);
            const lightBlur = blurFn(.5);
            if (this.state.hoveredSentIndices) return !isInSents ? lightBlur : '';
            if (this.nodeSelected()) return !isInSents ? fullBlur : '';
            return '';
        }
        // Use 1 second transition for phase 2 fade-in. During interp animation, update instantly each frame.
        // At endpoints (0 or 1) use 0 to avoid extra transition after animation completes.
        const atEndpoint = interp <= 0 || interp >= 1;
        const transitionDuration = firstTime ? 0 : 
            (interpOverride !== undefined) || atEndpoint ? 0 :
            (this.state.animatingGeneration && this.state.animationPhase === 'all') ? 1000 : 
            TRANSITION_DURATION;
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
        const opacity = (d: NodeDisplayDatum) => {
            const node = getNode(d);
            if (node.word === '' || !this.opacityScale) return 0;
            if (this.state.animatingGeneration) {
                if (this.state.animationPhase === 'first') {
                    const step = this.getFirstGenStep(node);
                    if (step > this.state.animationWordIdx) return 0;
                }
            }
            return this.opacityScale(node.count);
        };
        const linkOpacity = (d: LinkDatum) => {
            const o = (opacity(d.source) + opacity(d.target)) / 2;
            if (this.state.animatingGeneration && this.state.animationPhase === 'first') {
                if (!this.isInFirstGeneration(d.source) || !this.isInFirstGeneration(d.target)) return 0;
            }
            return o * 0.2; // match gradient multiplier from graph mode
        };
        this.links.select('.link-visible')
            .attr("stroke", (d: LinkDatum, i: number) => {
                if (interp < 0.35) {
                    const idx = d.promptId ? color_utils.getPromptIndexFromId(d.promptId) : 0;
                    return color_utils.MILLER_STONE_COLORS[idx % color_utils.MILLER_STONE_COLORS.length];
                }
                return `url(#gradient-${i})`;
            })
            .attr("stroke-width", 2)
            .attr("stroke-opacity", (d: LinkDatum) => (interp < 0.35 ? linkOpacity(d) : 1))
            .style('filter', (d: LinkDatum) => isUntangled ? 'none' : getBlur(d));
        this.links.style('pointer-events', isUntangled ? 'none' : 'auto');

        // Update gradient opacity when selection/hover changes (skip when in 1D mode - uses solid stroke)
        if (interp >= 0.35) {
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
                const n = getNode(d);
                if (!this.nodeIsInSelectedSents(n)) return;
                if (this.selectedNodes.has(n)) {
                    this.selectedNodes.delete(n);
                    this.setState({ hoveredNode: null, hoveredSentIndices: null });
                } else {
                    this.selectedNodes.add(n);
                    this.setState({ hoveredNode: null, hoveredSentIndices: null });
                }
                this.updateSimulation();
                this.update();
                this.togglePopupNode(n);
                telemetry.logNodeClick(n.word, { count: n.count, origSentIndices: n.origSentIndices });
            });

        entered.append("text").attr("font-size", 14);

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

        const merged = entered.merge(nodeSelection);
        if (useUniformFont) {
            // In untangle (1D) mode: no wrapping, single line per word
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
            merged.select("text").call(this.wrapText as any);
        }
        const nodeFontSize = (d: NodeDisplayDatum) => (getNode(d) as NodeDatum).fontSize;
        merged.select("text")
            .attr("font-size", (d: NodeDisplayDatum) =>
                UNIFORM_FONT_SIZE + interp * (nodeFontSize(d) - UNIFORM_FONT_SIZE)
            )
            .attr("text-anchor", "start");

        const nodeOpacity = (d: NodeDisplayDatum) => {
            const o = opacity(d);
            return isUntangled ? 1 : o;
        };

        const nodeColor = (d: NodeDisplayDatum) => getNodeColor(getNode(d), this.linksData);
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
    private updateSimulation(firstTime: boolean = false) {
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
            const spacing = this.height / numPrompts;
            
            yForce = d3.forceY((d: any) => {
                // Get the first prompt ID from the node's origPromptIds
                const firstPromptId = d.origPromptIds?.[0];
                if (firstPromptId && promptIdToIndex.has(firstPromptId)) {
                    const promptIndex = promptIdToIndex.get(firstPromptId)!;
                    return spacing * (promptIndex + 0.5);
                }
                return this.height / 2;
            }).strength(0.5);
        } else {
            yForce = d3.forceY(this.height / 2).strength((d: any) => d.count / 100);
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
                cumul += this.measureTextWidth(origWords[i]) + (i < origWords.length - 1 ? GAP_PX_1D : 0);
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

    /** Measure text width for 1D layout; uses SVG for accurate handling of special chars (e.g. hyphen) */
    private measureTextWidth(text: string): number {
        const svg = document.getElementById('graph-holder');
        if (!svg || svg.namespaceURI !== 'http://www.w3.org/2000/svg') {
            return ((text ?? '').replace(/^##/, '')).length * PX_PER_CHAR_1D;
        }
        let el = svg.querySelector('.text-measure-1d') as SVGTextElement | null;
        if (!el) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.setAttribute('class', 'text-measure-1d');
            el.setAttribute('font-size', String(UNIFORM_FONT_SIZE));
            el.style.visibility = 'hidden';
            el.style.position = 'absolute';
            svg.appendChild(el);
        }
        el.textContent = text ?? '';
        return el.getComputedTextLength() * MEASURED_WIDTH_SCALE;
    }

    /** Scale 1D coords to layout pixel space; x is normalized 0-1, y is row index for fixed line height */
    private scale1DToLayout(xNorm: number, yRowIndex: number): { x: number; y: number } {
        const x = LAYOUT_MARGIN + xNorm * (this.width - 2 * LAYOUT_MARGIN);
        const y = LAYOUT_MARGIN + yRowIndex * ROW_SPACING_1D;
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
        const chunkLengths = chunkText(d.word).map(chunk => {
            return chunk.length * d.fontSize * 0.6; // Adjusted
        });
        return d3.max(chunkLengths) || 0;
    }

    private textHeight(d: any) {
        return chunkText(d.word).length * d.fontSize;
    }


    private wrapText(selection: d3.Selection<SVGTextElement, any, any, any>) {
        selection.each(function (d) {
            const text = d3.select(this);
            const chunks = chunkText(d.word);

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

    private togglePopupNode = (node: NodeDatum) => {
        this.setState(prevState => {
            const exists = prevState.popupNodes.some(selected => selected === node);
            const popupNodes = exists
                ? prevState.popupNodes.filter(selected => selected !== node)
                : [...prevState.popupNodes, node];

            return {
                popupNodes,
                isPopupVisible: true // Always keep popup visible
            };
        });
    }

    private removePopupNode = (node: NodeDatum) => {
        this.setState(prevState => {
            const popupNodes = prevState.popupNodes.filter(selected => selected !== node);
            return {
                popupNodes,
                isPopupVisible: true // Always keep popup visible
            };
        });
    }

    private hidePopup() {
        // Clear popup nodes but keep popup visible to show all outputs
        if (this.state.popupNodes.length > 0) {
            this.setState({
                popupNodes: [],
                isPopupVisible: true
            });
        }
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
        
        this.firstGenStepMapping = new Map();
        firstGenNodes.forEach(({ node }, index) => {
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

        // Build mapping of first generation nodes to sequential steps
        this.firstGenStepMapping = null;
        this.buildFirstGenStepMapping();
        const maxStep = this.firstGenStepMapping!.size - 1;

        // Start animation
        this.setState({ 
            animatingGeneration: true, 
            animationWordIdx: -1,
            animationPhase: 'first'
        });

        let currentStep = 0;
        
        const animateFirstGenStep = () => {
            if (currentStep > maxStep) {
                // Phase 1 complete, fade in everything else
                this.setState({ 
                    animationPhase: 'all',
                    animationWordIdx: Infinity
                });
                this.update();
                
                // End animation after 1 second fade-in
                this.animationTimer = window.setTimeout(() => {
                    this.setState({ 
                        animatingGeneration: false,
                        animationWordIdx: -1,
                        animationPhase: 'first'
                    });
                    this.animationTimer = null;
                }, 1000);
                return;
            }

            this.setState({ animationWordIdx: currentStep });
            this.update();

            currentStep++;
            this.animationTimer = window.setTimeout(animateFirstGenStep, 500);
        };

        // Start with a delay to show all transparent
        this.animationTimer = window.setTimeout(animateFirstGenStep, 800);
    }
}

// Cache for chunkText results
const chunkTextCache = new Map<string, string[]>();

function chunkText(text: string) {
    const safeKey = text ?? '';
    if (chunkTextCache.has(safeKey)) {
        return chunkTextCache.get(safeKey)!;
    }

    // unformat maps token keys to display text; if already display text, use as-is
    const displayStr = (utils.unformat(text) ?? text ?? '').toString();
    const words = displayStr.split(' ');
    // Group words into chunks of maxWords
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += NUM_WORDS_TO_WRAP) {
        chunks.push(words.slice(i, i + NUM_WORDS_TO_WRAP).join(' '));
    }

    chunkTextCache.set(safeKey, chunks);
    return chunks;
}


export default observer(SingleExampleWordGraphUntangle);
