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

const TRANSITION_DURATION = 300;

interface Props {
    // Prompts (grouped inputs for multi-prompt)
    promptGroups: { promptId: string, generations: string[] }[];
    similarityThreshold: number;
    minOpacityThreshold: number;
    spread: number;
    tokenizeMode: utils.TokenizeMode;
}

interface State {
    popupNodes: NodeDatum[];
    isPopupVisible: boolean;
}

const NUM_WORDS_TO_WRAP = 3;
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
class SingleExampleWordGraph extends React.Component<Props, State> {
    private hoveredNode: NodeDatum | null = null;
    private selectedNodes: Set<NodeDatum> = new Set();
    private fontScale: d3.ScaleLinear<number, number> | null = null;
    private opacityScale: d3.ScalePower<number, number> | null = null;
    private simulation: d3.Simulation<NodeDatum, LinkDatum> | null = null;
    private nodesData: NodeDatum[] = [];
    private linksData: LinkDatum[] = [];
    private links: d3.Selection<SVGPathElement, LinkDatum, SVGGElement, unknown> | null = null;
    private nodes: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown> | null = null;
    private defs: d3.Selection<SVGDefsElement, unknown, HTMLElement, any> | null = null;
    private getLinkEndpoints: ((d: LinkDatum) => { sourceX: number; targetX: number; y1: number; y2: number; sourceRightX: number; targetLeftX: number }) | null = null;
    private height: number = 0;
    private width: number = 0;
    private lastTransform: { k: number; x: number; y: number } | null = null;
    private zoomThrottleTimer: number | null = null;
    constructor(props: Props) {
        super(props);
        this.state = {
            popupNodes: [],
            isPopupVisible: false
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
    }

    private handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            this.selectedNodes.clear();
            this.hoveredNode = null;
            this.hidePopup();
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
            .domain([(this.props.minOpacityThreshold - .3) * totalGenerations / 2, totalGenerations / 2])
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
                <NodeExamplesPopup
                    nodes={this.state.popupNodes}
                    promptGroups={this.props.promptGroups}
                    isVisible={this.state.isPopupVisible}
                    onClose={() => this.hidePopup()}
                    onRemoveNode={this.removePopupNode}
                />
            </div>
        );
    }


    async componentDidUpdate(prevProps: Props) {
        const tokenizeModeChanged = prevProps.tokenizeMode !== this.props.tokenizeMode;
        const similarityThresholdChanged = prevProps.similarityThreshold !== this.props.similarityThreshold;
        if (similarityThresholdChanged || tokenizeModeChanged || !utils.objectsAreEqual(prevProps.promptGroups, this.props.promptGroups)) {
            this.rebuildGraph();
        }

        if (prevProps.minOpacityThreshold !== this.props.minOpacityThreshold) {
            this.createFontScale();
            this.update();
            return;
        }
        if (prevProps.spread !== this.props.spread) {
            this.updateSimulation();
            return;
        }
        this.update();

    }

    private toggleLoading(isLoading = false) {
        d3.select("#graph-holder").classed('hidden', isLoading);
        d3.select("#loader").classed('hidden', !isLoading);
    }

    private async rebuildGraph() {
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
        const { nodesData, linksData } = await utils.createGraphDataFromPromptGroups(this.props.promptGroups, this.props.similarityThreshold, state.shuffle, this.props.tokenizeMode);

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
        this.width = Math.min(window.innerWidth, 5000); // 95% of viewport width, max 5000p;x
        this.height = Math.min(window.innerHeight * 0.8, 800); // 70% of viewport height, max 800px
        const svg = d3.select("#graph-holder")
            .html('')
            .attr("width", this.width)
            .attr("height", this.height)
            .style("cursor", "grab") // Change cursor to indicate draggable
            // Add click handler to the SVG background
            .on('click', (event: any) => {
                // Only clear selection if the click was directly on the SVG background
                if (event.target.tagName === 'svg') {
                    if (this.nodeSelected() || this.hoveredNode) {
                        this.selectedNodes.clear();
                        this.hoveredNode = null;
                        this.hidePopup();
                        this.updateSimulation();
                        this.update();
                    }
                }
            });

        // Add a group for all content that will be panned
        const g = svg.append("g");

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
            const strokeColor = edgeColors(d.promptId ? d.promptId.match(/_(\d+)_/)?.[1] || '0' : '0');

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

        // Draw links.
        this.links = g.selectAll(".link")
            .data(linksData).enter()
            .append('path')
            .attr("class", "link")
            .attr("fill", "none")

        // Draw nodes.
        this.nodes = g.selectAll(".node")
            .data(nodesData).enter()
            .append("g")
            .attr("class", "node")
            .on('mouseover', (event: any, d: NodeDatum) => {
                this.hoveredNode = d;
                this.update();
            })
            .on('mouseout', (event: any, d: NodeDatum) => {
                this.hoveredNode = null;
                this.update();
            })
            .on('click', (event: any, d: NodeDatum) => {
                if (!this.nodeIsInSelectedSents(d)) {
                    return;
                }
                if (this.selectedNodes.has(d)) {  // If clicking a selected node, deselect it
                    this.selectedNodes.delete(d);
                    this.hoveredNode = null;
                } else {  // Otherwise, add it to the selection
                    this.selectedNodes.add(d);
                    this.hoveredNode = null;
                }
                this.updateSimulation();
                this.update();
                this.togglePopupNode(d); // Toggle popup node to update the popup content.
                // Log telemetry for node click
                telemetry.logNodeClick(d.word, {
                    count: d.count,
                    origSentIndices: d.origSentIndices,
                });
            });

        this.nodes.append("text")
            .call(this.wrapText)
            .attr("font-size", (d: any) => d.fontSize);

        if (SHOW_DEBUG_ELLIPSES) {
            this.nodes.append("ellipse")
                .attr("cx", (d: NodeDatum) => d.rx)   // x-position of the node
                // .attr("cy", (d: NodeDatum) => d.ry)   // y-position of the node
                .attr("rx", (d: NodeDatum) => d.rx)
                .attr("ry", (d: NodeDatum) => d.ry)
                .attr("fill", "rgba(123, 123, 1, 0.5)")
        }
    }
    private update(firstTime: boolean = false) {
        if (!this.links || !this.nodes || !this.defs || !this.getLinkEndpoints) {
            return;
        }

        const getBlur = (d: (LinkDatum | NodeDatum)) => {
            const blurFn = (opacity: number) => `blur(2px) opacity(${opacity})`;
            const isNode = (d: any): d is NodeDatum => d.word !== undefined;
            const isInSentsFn = isNode(d) ? (d: NodeDatum) => this.nodeIsInSelectedSents(d) : (d: LinkDatum) => this.linkIsInSents(d);
            // If nothing is selected or hovered, return no blur.
            if (!this.nodeSelected() && !this.hoveredNode) return '';
            const fullBlur = blurFn(.2);
            const lightBlur = blurFn(.5);
            if (this.hoveredNode) {
                return !isInSentsFn(d as any) ? lightBlur : '';
            }
            if (this.nodeSelected()) {
                return !isInSentsFn(d as any) ? fullBlur : '';
            }
            return '';
        }
        this.links
            .transition().duration(firstTime ? 0 : TRANSITION_DURATION).ease(d3.easeSinInOut)
            .attr("d", (d: LinkDatum) => {
                const { sourceX, targetX, y1, y2, sourceRightX, targetLeftX } = this.getLinkEndpoints!(d);
                const points = [
                    { x: sourceX, y: y1 },
                    { x: sourceRightX, y: y1 },
                    { x: targetLeftX, y: y2 },
                    { x: targetX, y: y2 }
                ];
                return d3.line<{ x: number, y: number }>()
                    .x(d => d.x)
                    .y(d => d.y)
                    .curve(d3.curveMonotoneY)(points);
            })
            .attr("stroke", (d: LinkDatum, i: number) => {
                return `url(#gradient-${i})`;
            })
            .attr("stroke-width", (d: any) => {
                return 2;
            })
            .style('filter', (d: LinkDatum) => getBlur(d));

        // Choose opacity based on 
        const opacity = (d: NodeDatum) => {
            if ((d as any).word === '' || !this.opacityScale) return 0;
            return this.opacityScale(d.count);
        }

        // Update gradient opacity when selection/hover changes
        this.links.each((d: LinkDatum, i: number) => {
            const gradient = this.defs!.select(`#gradient-${i}`);
            const multiplier = .2;
            const stops = gradient.selectAll("stop");
            stops.filter((_: any, j: number) => j === 0).attr("stop-opacity", opacity(d.source) * multiplier);
            stops.filter((_: any, j: number) => j === 1).attr("stop-opacity", opacity(d.target) * multiplier);
        });

        this.nodes
            .transition().duration(firstTime ? 0 : TRANSITION_DURATION).ease(d3.easeSinInOut)
            .attr("transform", (d: any) => `translate(${d.x}, ${d.y})`)
            .attr('fill', (d: NodeDatum) => {
                return getNodeColor(d, this.linksData);
            })
            .style('opacity', (d: NodeDatum) => {
                return opacity(d);
            })
            .style('font-weight', (d: NodeDatum) => {
                return this.selectedNodes.has(d) || this.hoveredNode === d ? 'bold' : 'normal';
            })
            .style('filter', (d: NodeDatum) => getBlur(d));
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
        this.simulation
            .nodes(selectedNodes)
            .force("collide", ellipseForce(selectedNodes, 10, 5, 5))
            .force("link", d3.forceLink(selectedLinks)
                .id((d: any) => d.word)
                .strength(.4))
            // .force('y', () => selectedNodes.forEach((d: NodeDatum) => d.origSentIndices.includes(0) && (d.y = this.height /2)))
            .force("y", d3.forceY(this.height / 2).strength((d: any) => d.count / 100)) // Center nodes vertically
            .force("x", () => selectedNodes.forEach((d: NodeDatum) => d.x = this.getExpectedX(d, selectedNodes)))
        this.simulation.on("tick", () => this.update());

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
        console.log(`Simulation converged after ${iteration} iterations`);
    }

    private linkIsInSents(d: any) {
        if (this.nodeSelected()) {
            // Check if link is in any of the selected nodes' sentences
            return Array.from(this.selectedNodes).some(node => node.origSentIndices.includes(d.sentIdx));
        }
        const activeNode = this.hoveredNode;
        return activeNode?.origSentIndices.includes(d.sentIdx);
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
        if (!this.hoveredNode) return false;
        const activeSents = [...this.hoveredNode.origSentIndices];
        const sents = d.origSentIndices;
        const sharedElements = activeSents.filter(e => sents.includes(e));
        return sharedElements.length > 0;
    }

    /** Add a bounding box rectangle to each node (for collision calculation) */
    private addBoundingBoxData(nodes: NodeDatum[]) {
        nodes.forEach((node) => {
            node.rx = node.textLength / 2;
            node.ry = this.textHeight(node) / 2;
        });
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

        return scale(this.props.spread);
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
            const chunks = chunkText(d.word)

            text.text(null)
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
                isPopupVisible: popupNodes.length > 0
            };
        });
    }

    private removePopupNode = (node: NodeDatum) => {
        this.setState(prevState => {
            const popupNodes = prevState.popupNodes.filter(selected => selected !== node);
            return {
                popupNodes,
                isPopupVisible: popupNodes.length > 0
            };
        });
    }

    private hidePopup() {
        if (!this.state.isPopupVisible && this.state.popupNodes.length === 0) {
            return;
        }
        this.setState({
            popupNodes: [],
            isPopupVisible: false
        });
    }
}

// Cache for chunkText results
const chunkTextCache = new Map<string, string[]>();

function chunkText(text: string) {
    // Check cache first
    if (chunkTextCache.has(text)) {
        return chunkTextCache.get(text)!;
    }

    const words = utils.unformat(text).split(' ');
    // Group words into chunks of maxWords
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += NUM_WORDS_TO_WRAP) {
        chunks.push(words.slice(i, i + NUM_WORDS_TO_WRAP).join(' '));
    }

    // Store in cache
    chunkTextCache.set(text, chunks);
    return chunks;
}


export default observer(SingleExampleWordGraph);
