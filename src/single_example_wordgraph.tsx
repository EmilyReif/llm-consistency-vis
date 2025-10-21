import React from "react";
import './single_example_wordgraph.css';
import { observer } from "mobx-react";
import * as utils from './utils';
import * as color_utils from './color_utils';
import * as d3 from "d3";
import { ellipseForce } from "./force_collide_ellipse";
import { getNodeColor } from './color_utils';
import { state } from './state';

interface Props {
    // Prompts (grouped inputs for multi-prompt)
    promptGroups: { promptId: string, generations: string[] }[];
    similarityThreshold: number;
}

const NUM_WORDS_TO_WRAP = 3;
const SHOW_DEBUG_ELLIPSES = false;

// The structure of each node in the graph.
export interface NodeDatum {
    word: string;

    // Number of times the word appears overall.
    count: number;
    origWordIndices: number[];
    origSentIndices: number[];
    // Optional: which prompts contributed to this node
    origPromptIds?: string[];

    // Parent and child nodes.
    children: NodeDatum[];
    parents: NodeDatum[];

    isEnd?: boolean;
    isRoot?: boolean;

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
class SingleExampleWordGraph extends React.Component<Props> {
    private hoveredNode: NodeDatum | null = null;
    private selectedNode: NodeDatum | null = null;  // Add this new property
    private fontScale: d3.ScaleLinear<number, number> | null = null;

    componentDidMount() {
        window.addEventListener('resize', this.handleResize);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
    }

    private handleResize = () => {
        this.componentDidUpdate();
    }

    private createFontScale() {
        const totalGenerations = this.props.promptGroups.reduce((acc, group) => acc + group.generations.length, 0);
        const minFontSize = 11;
        const maxFontSize = 50;

        this.fontScale = d3.scaleLinear()
            .domain([1, totalGenerations])
            .range([minFontSize, maxFontSize])
            .clamp(true);
    }

    render() {
        // Empty svg element that will be populated with the graph.
        return <svg id='graph-holder'></svg>;
    }

    async componentDidUpdate() {
        // Create color scale that matches the state's color assignment
        // Use the same logic as state.getPromptColor() for consistency
        const edgeColors = (originalIndex: string) => {
            const index = parseInt(originalIndex);
            const color = color_utils.MILLER_STONE_COLORS[index % color_utils.MILLER_STONE_COLORS.length];
            return color;
        };

        // Generate graph data from all text
        const { nodesData, linksData } = utils.createGraphDataFromPromptGroups(this.props.promptGroups, this.props.similarityThreshold, state.shuffle, state.tokenizeMode);
        this.createFontScale(); // Create font scale based on total generations
        this.addBoundingBoxData(nodesData);

        const width = Math.min(window.innerWidth , 5000); // 95% of viewport width, max 5000p;x
        const height = Math.min(window.innerHeight * 0.8, 800); // 70% of viewport height, max 800px
        const svg = d3.select("#graph-holder")
            .html('')
            .attr("width", width)
            .attr("height", height)
            .style("cursor", "grab") // Change cursor to indicate draggable
            // Add click handler to the SVG background
            .on('click', (event: any) => {
                // Only clear selection if the click was directly on the SVG background
                if (event.target.tagName === 'svg') {
                    this.selectedNode = null;
                    this.hoveredNode = null;
                    updateSimulation();
                    update();
                }
            });

        // Add a group for all content that will be panned
        const g = svg.append("g");

        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.5, 3]) // Allow zoom from 0.5x to 3x
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoom as any);

        // Draw links.
        const links = g.selectAll(".link")
            .data(linksData).enter()
            .append('path')
            .attr("class", "link")
            .attr("fill", "none")

        // Draw nodes.
        const nodes = g.selectAll(".node")
            .data(nodesData).enter()
            .append("g")
            .attr("class", "node")
            .on('mouseover', (event: any, d: NodeDatum) => {
                if (!this.selectedNode) {  // Only update hover if nothing is selected
                    this.hoveredNode = d;
                    this.showHoveredNodeInfo();
                    update();
                }
            })
            .on('mouseout', (event: any, d: NodeDatum) => {
                if (!this.selectedNode) {  // Only update hover if nothing is selected
                    this.hoveredNode = null;
                    update();
                }
            })
            .on('click', (event: any, d: NodeDatum) => {
                if (this.selectedNode === d) {  // If clicking the selected node, deselect it
                    this.selectedNode = null;
                    this.hoveredNode = null;
                } else {  // Otherwise, select the clicked node
                    this.selectedNode = d;
                    this.hoveredNode = null;
                }
                updateSimulation();
                update();
            });

        nodes.append("text")
            .call(this.wrapText)
            .attr("font-size", (d: any) => this.fontSize(d));

        if (SHOW_DEBUG_ELLIPSES) {
            nodes.append("ellipse")
                .attr("cx", d => d.rx)   // x-position of the node
                // .attr("cy", d => d.ry)   // y-position of the node
                .attr("rx", d => d.rx)
                .attr("ry", d => d.ry)
                .attr("fill", "rgba(123, 123, 1, 0.5)")
        }


        const update = () => {
            nodesData.forEach((d: NodeDatum) => d.x = this.getExpectedX(d));

            links.attr("d", (d: any, i) => this.renderPath(d))
                .attr("stroke", (d: any) => {
                    // Extract original prompt index from promptId for consistent coloring
                    // Format: ${prompt.text}_${originalIndex}_${prompt.modelFamily}_${prompt.model}
                    const match = d.promptId.match(/_(\d+)_/);
                    const originalIndex = match ? match[1] : '0';
                    return edgeColors(originalIndex);
                })
                .attr("stroke-width", (d: any) => {
                    return 2;
                })
                .attr("stroke-opacity", (d: any) => {
                    if (d.source.word === '') return 0;
                    return this.linkIsInSents(d) ? .5 : 0.2;
                })
                .classed('blur', (d: LinkDatum) => this.selectedNode ? !this.linkIsInSents(d) : false)

            nodes
                .attr("transform", (d: any) => `translate(${d.x}, ${d.y})`)
                .attr('fill', (d: NodeDatum) => {
                    return getNodeColor(d, linksData, edgeColors);
                })
                .style('opacity', (d: NodeDatum) => {
                    const activeNode = this.selectedNode || this.hoveredNode;
                    if (!activeNode) {
                        return 1;
                    }
                    return this.nodeIsInSents(d) ? 1 : 0.2;
                })
                .classed('blur', (d: NodeDatum) => this.selectedNode ? !this.nodeIsInSents(d) : false)
        };

        // Create the simulation.
        const updateSimulation = () => {
            simulation.stop();

            const selectedLinks = this.selectedNode ? linksData.filter(d => this.linkIsInSents(d)) : linksData;
            const selectedNodes = this.selectedNode ? nodesData.filter(d => this.nodeIsInSents(d)) : nodesData;

            // Set initial Y positions
            // nodesData.forEach((d: NodeDatum) => {
            //     d.y = this.getExpectedY(d, height);
            // });

            simulation
                .nodes(selectedNodes)
                .force("collide", ellipseForce(selectedNodes, 10, 5, 5))
                .force("link", d3.forceLink(selectedLinks)
                    .id((d: any) => d.word)
                    .strength(.4))
            .force("y", d3.forceY(height / 2).strength((d: any) => d.count/20)) // Center nodes vertically
            .force('y', d3.forceY((d: NodeDatum) => this.getExpectedY(d, height)).strength(0.1))

            this.runSimulationToConvergence(simulation, nodesData, update);
        }
        // Create the simulation.
        const simulation = d3.forceSimulation(nodesData);
        updateSimulation();

        simulation.on("tick", () => update());
        this.runSimulationToConvergence(simulation, nodesData, update);
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
        simulation: d3.Simulation<NodeDatum, LinkDatum>,
        nodesData: NodeDatum[],
        update: () => void,
        animateSteps: boolean = true,
        convergenceThreshold: number = 1,
        maxIterations: number = 1000
    ): void {
        simulation.stop();
        if (animateSteps) {
            simulation.alpha(1).restart();
            return;
        }

        // Store previous positions to detect convergence
        const prevPositions = nodesData.map(d => ({ x: d.x, y: d.y }));

        let converged = false;
        let iteration = 0;

        while (!converged && iteration < maxIterations) {
            simulation.tick();
            update(); // Manually call update since tick events aren't fired

            // Check if positions have converged
            converged = true;
            for (let i = 0; i < nodesData.length; i++) {
                const node = nodesData[i];
                const prev = prevPositions[i];
                const dx = Math.abs(node.x - prev.x);
                const dy = Math.abs(node.y - prev.y);

                if (dx > convergenceThreshold || dy > convergenceThreshold) {
                    converged = false;
                    break;
                }
            }

            // Update previous positions for next iteration
            nodesData.forEach((d, i) => {
                prevPositions[i] = { x: d.x, y: d.y };
            });

            iteration++;
        }

        console.log(`Simulation converged after ${iteration} iterations`);
        // Simulation remains stopped for stable positioning
    }

    private linkIsInSents(d: any) {
        const activeNode = this.selectedNode || this.hoveredNode;
        return activeNode?.origSentIndices.includes(d.sentIdx);
    }

    private nodeIsInSents(d: NodeDatum) {
        const activeNode = this.selectedNode || this.hoveredNode;
        if (!activeNode) return false;
        const activeSents = [...activeNode.origSentIndices];
        const sents = d.origSentIndices;
        const sharedElements = activeSents.filter(e => sents.includes(e));
        return sharedElements.length > 0;
    }

    /** Add a bounding box rectangle to each node (for collision calculation) */
    private addBoundingBoxData(nodes: NodeDatum[]) {
        nodes.forEach((node) => {
            node.rx = this.textLength(node) / 2;
            node.ry = this.textHeight(node) / 2;
        });
    }


    private getExpectedX(d: NodeDatum) {
        const padBetweenWords = 50;
        // const padBetweenWords = this.fontSize(d) * 5;
        const parents = d.parents.filter(p => this.selectedNode ? this.nodeIsInSents(p) : true);
        if (d.isRoot && !parents.length) {
            return padBetweenWords;
        }
        if (!parents.length) {
            return d.x;
        }
        if ((this.selectedNode && !this.nodeIsInSents(d))) {
            return d.x;
        }
        // Count occurrences of each parent
        const parentCounts = new Map<NodeDatum, number>();
        parents.forEach((p: NodeDatum) => {
            parentCounts.set(p, (parentCounts.get(p) || 0) + 1);
        });
        
        // Find the most frequent parent
        let mostFrequentParent = parents[0];
        let maxCount = 0;
        parentCounts.forEach((count, parent) => {
            if (count > maxCount) {
                maxCount = count;
                mostFrequentParent = parent;
            }
        });
        
        return mostFrequentParent.x + this.textLength(mostFrequentParent) + padBetweenWords;
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

    /**
     * For a given link, render the path that connects the source and target nodes.
     * The path is a cubic Bezier curve that starts at the source node, curves towards the target node,
     * and ends at the target node.
     */
    private renderPath(d: LinkDatum) {
        const getY = (node: NodeDatum) => {
            const lineHeight = 0.75;
            // Calculate the offset for this line compared to the other lines in this node.
            const percentage = [...node.origSentIndices].indexOf(d.sentIdx) / node.origSentIndices.length;
            const offsetY = (percentage - lineHeight) * this.fontSize(node);
            return node.y + offsetY;
        };
        const [y1, y2] = [getY(d.source), getY(d.target)];

        // Calculate the x positions of the source and target nodes.
        const getXLeftRightCenter = (node: NodeDatum) => {
            const textLength = this.textLength(node);
            const leftX = node.x;
            const rightX = leftX + textLength;
            const centerX = (leftX + rightX) / 2;
            return [leftX, rightX, centerX];
        };
        const [sourceLeftX, sourceRightX, sourceCenterX] = getXLeftRightCenter(d.source);
        const [targetLeftX, targetRightX, targetCenterX] = getXLeftRightCenter(d.target);

        // If the source is a root node, we want to align the line to the left edge of the text.
        const sourceEnd = d.source?.isRoot ? sourceLeftX : sourceCenterX;
        // If the target is an end node, we want to align the line to the right edge of the text.
        const targetEnd = d.target.isEnd ? targetRightX : targetCenterX;

        const points = [
            { x: sourceEnd, y: y1 },
            { x: sourceRightX, y: y1 },
            { x: targetLeftX, y: y2 },
            { x: targetEnd, y: y2 }

        ];
        const lineGenerator = d3.line<{ x: number, y: number }>()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveMonotoneY);

        return lineGenerator(points);
    }
    private fontSize(d: any) {
        if (!this.fontScale) {
            return 10; // Default font size
        }
        return this.fontScale(d.count);
    }

    private textLength(d: any) {
        const chunkLengths = chunkText(d.word).map(chunk => {
            return chunk.length * this.fontSize(d) * 0.6; // Adjusted
        });
        return d3.max(chunkLengths) || 0;
    }

    private textHeight(d: any) {
        return chunkText(d.word).length * this.fontSize(d);
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

    private showHoveredNodeInfo() {
        if (!this.hoveredNode) return;
        const generations = this.hoveredNode.origSentIndices;
    }
}

function chunkText(text: string) {
    const words = utils.unformat(text).split(' ');
    // Group words into chunks of maxWords
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += NUM_WORDS_TO_WRAP) {
        chunks.push(words.slice(i, i + NUM_WORDS_TO_WRAP).join(' '));
    }
    return chunks;
}


export default observer(SingleExampleWordGraph);
