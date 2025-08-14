import React from "react";
import './single_example_wordgraph.css';
import { observer } from "mobx-react";
import * as utils from './utils';
import * as d3 from "d3";
import { ellipseForce } from "./force_collide_ellipse";

interface Props {
    generations: string[];
    expectedOutput?: string; // Optional since it may not always be provided
}

const NUM_WORDS_TO_WRAP = 4;
const SHOW_DEBUG_ELLIPSES = false;

// The structure of each node in the graph.
export interface NodeDatum {
    word: string;

    // Number of times the word appears overall.
    count: number;
    origWordIndices: Set<number>;
    origSentIndices: Set<number>;
    origSentences: Set<string>;

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
}
class SingleExampleWordGraph extends React.Component<Props> {
    private hoveredNode: NodeDatum | null = null;
    private selectedNode: NodeDatum | null = null;  // Add this new property

    componentDidMount() {
        window.addEventListener('resize', this.handleResize);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
    }

    private handleResize = () => {
        this.componentDidUpdate();
    }

    render() {
        // Empty svg element that will be populated with the graph.
        return <svg id='graph-holder'></svg>;
    }

    async componentDidUpdate() {
        const generations = this.props.generations;
        const expectedOutput = this.props.expectedOutput;
        
        // Special color for expected output
        const expectedOutputColor = "#781eba"; // Magenta or any color that stands out
        
        const edgeColors = d3.scaleOrdinal(d3.schemeTableau10.slice(0, 9)).domain(generations);
        
        const selectedColor = 'black';
        const defaultColor = 'black';
        
        // Create a combined array with both generations and expected output (if it exists)
        const allTextToProcess = [...generations];
        if (expectedOutput && expectedOutput.trim() !== '') {
            allTextToProcess.push(expectedOutput);
        }
        
        // Generate graph data from all text
        const { nodesData, linksData } = utils.createGraphDataFromGenerations(allTextToProcess);
        this.addBoundingBoxData(nodesData);

        const width = Math.min(window.innerWidth * 0.95, 5000); // 95% of viewport width, max 5000px
        const height = Math.min(window.innerHeight * 0.6, 800); // 70% of viewport height, max 800px
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

        // Create the simulation.

        const updateSimulation = () => {
            simulation.stop();

            const selectedLinks = this.selectedNode ? linksData.filter(d => this.linkIsInSents(d)) : linksData;
            const selectedNodes = this.selectedNode ? nodesData.filter(d => this.nodeIsInSents(d)) : nodesData;

            simulation
                .nodes(selectedNodes)
                .force("collide", ellipseForce(selectedNodes, 0, 0.5, 0.5))
                .force("link", d3.forceLink(selectedLinks)
                    .id((d: any) => d.word)
                    .strength(.01))
                .force("y", d3.forceY(height / 2))
                // .force('y', d3.forceY((d: NodeDatum) => this.getExpectedY(d, height)).strength(0.1))

            simulation.alpha(1).restart();
        }
        // Create the simulation.
        const simulation = d3.forceSimulation(nodesData);
        updateSimulation();

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
                .attr("cx", d => this.textLength(d) / 2)
                .attr("cy", d => -this.textHeight(d) / 2)
                .attr("rx", d => d.rx)
                .attr("ry", d => d.ry)
                .attr("fill", "rgba(123, 123, 1, 0.5)")
        }


        const update = () => {
            nodesData.forEach((d: NodeDatum) => d.x = this.getExpectedX(d));

            links.attr("d", (d: any) => this.renderPath(d))
                .attr("stroke", (d: any) => {
                    if (expectedOutput && d.sentence === expectedOutput) return expectedOutputColor;
                    return this.linkIsInSents(d) ? edgeColors(d.sentence) : defaultColor;
                })
                .attr("stroke-width", (d: any) => {
                    return this.linkIsInSents(d) ? 2 : 1;
                })
                .attr("stroke-opacity", (d: any) => {
                    if (d.source.word === '') return 0;
                    return this.linkIsInSents(d) ? .5 : .2;
                })
                .classed('blur', (d: LinkDatum) => this.selectedNode ? !this.linkIsInSents(d) : false)

            nodes
                .attr("transform", (d: any) => `translate(${d.x}, ${d.y})`)
                .attr('fill', (d: NodeDatum) => {
                    if (expectedOutput && d.origSentences.has(expectedOutput)) return expectedOutputColor;
                    return this.nodeIsInSents(d) ? selectedColor : defaultColor;
                })
                .style('opacity', (d: NodeDatum) => {
                    const activeNode = this.selectedNode || this.hoveredNode;
                    if (!activeNode) {
                        return 1;
                    }
                    if (expectedOutput && d.origSentences.has(expectedOutput)) return 1;
                    return this.nodeIsInSents(d) ? 1 : 0.2;
                })
                .classed('blur', (d: NodeDatum) => this.selectedNode ? !this.nodeIsInSents(d) : false)
        };

        simulation.on("tick", () => update());
    }

    private linkIsInSents(d: any) {
        const activeNode = this.selectedNode || this.hoveredNode;
        return activeNode?.origSentences.has(d.sentence);
    }

    private nodeIsInSents(d: NodeDatum) {
        const activeNode = this.selectedNode || this.hoveredNode;
        if (!activeNode) return false;
        const activeSents = [...activeNode.origSentences];
        const sents = d.origSentences;
        const sharedElements = activeSents.filter(e => sents.has(e));
        return sharedElements.length > 0;
    }

    /** Add a bounding box rectangle to each node (for collision calculation) */
    private addBoundingBoxData(nodes: NodeDatum[]) {
        nodes.forEach((node) => {
            node.rx = this.textLength(node);
            node.ry = this.textHeight(node);
        });
    }


    private getExpectedX(d: NodeDatum) {
        const padBetweenWords = 100;
        const parents = d.parents.filter(p => this.selectedNode ? this.nodeIsInSents(p) : true);
        if (d.isRoot) {
            return padBetweenWords;
        }
        if (!parents.length) {
            return d.x;
        }
        if ((this.selectedNode && !this.nodeIsInSents(d))) {
            return d.x;
        }
        const parentLefts = parents.flatMap((p: NodeDatum) => {
            return p.x + this.textLength(p) + padBetweenWords;
        });
        return (d3.min(parentLefts) || d.x);
    }

    private getExpectedY(d: NodeDatum, height: number) {
        const avgSentIndex = d3.min(d.origSentIndices || []) || 0;
        const percentage = (avgSentIndex / this.props.generations.length);
        const pad = height * 0.1;
        return pad + percentage * (height - 2 * pad);
    }

    /**
     * For a given link, render the path that connects the source and target nodes.
     * The path is a cubic Bezier curve that starts at the source node, curves towards the target node,
     * and ends at the target node.
     */
    private renderPath(d: any) {
        const getY = (node: NodeDatum) => {
            const lineHeight = this.fontSize(node) * 0.5;
            // Calculate the offset for this line compared to the other lines in this node.
            const offsetY = [...node.origSentences].indexOf(d.sentence) * this.fontSize(node) * 0.05;
            return node.y - lineHeight + offsetY;
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
        const minFontSize = 11;
        const maxFontSize = 20;
        return Math.min(Math.max(minFontSize, d.count * 5), maxFontSize);
    }

    private textLength(d: any) {
        return chunkText(d.word)[0].length * this.fontSize(d) * .6;
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
