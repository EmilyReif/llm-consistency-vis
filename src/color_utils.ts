import * as d3 from "d3";
import { NodeDatum, LinkDatum } from './single_example_wordgraph';

export const MILLER_STONE_COLORS = [
    "#4f6980", // Blue
    "#d7ce9f", // Light Yellow
    "#a2ceaa", // Light Green
    "#fbb04e", // Light Orange
    "#f47942", // Orange
    "#849db1", // Light Blue
    "#638b66", // Green
    "#bfbb60", // Yellow-Green
    "#b66353", // Brown
    "#b9aa97", // Light Brown
    "#7e756d"  // Gray
  ];
/**
 * Calculate the weighted average color for a node based on its connected edges.
 * @param node - The node to calculate color for
 * @param linksData - Array of all links in the graph
 * @param edgeColors - D3 ordinal scale mapping promptId to color
 * @returns The blended color as a string
 */
export function getNodeColor(
    node: NodeDatum, 
    linksData: LinkDatum[], 
    edgeColors: d3.ScaleOrdinal<string, string>
): string {
    // Get all edges connected to this node
    const connectedEdges = linksData.filter(link => 
        link.source === node || link.target === node
    );

    if (connectedEdges.length === 0) {
        return 'black'; // Default color if no edges
    }

    // Count edges by promptId
    const promptCounts: { [promptId: string]: number } = {};
    connectedEdges.forEach(edge => {
        if (edge.promptId) {
            promptCounts[edge.promptId] = (promptCounts[edge.promptId] || 0) + 1;
        }
    });

    // Calculate weights (proportions)
    const totalEdges = connectedEdges.length;
    const weights: { [promptId: string]: number } = {};
    Object.keys(promptCounts).forEach(promptId => {
        weights[promptId] = promptCounts[promptId] / totalEdges;
    });

    // Get colors for each promptId
    const colors: { [promptId: string]: string } = {};
    Object.keys(weights).forEach(promptId => {
        colors[promptId] = edgeColors(promptId);
    });

    // Blend colors based on weights
    return blendColors(colors, weights);
}

/**
 * Blend multiple colors using weighted averaging.
 * @param colors - Object mapping promptId to color string
 * @param weights - Object mapping promptId to weight (0-1)
 * @returns The blended color as a string
 */
export function blendColors(colors: { [promptId: string]: string }, weights: { [promptId: string]: number }): string {
    const promptIds = Object.keys(colors);
    
    if (promptIds.length === 0) return 'black';
    if (promptIds.length === 1) return colors[promptIds[0]];

    // Parse colors using d3.color() and calculate weighted average
    let totalR = 0, totalG = 0, totalB = 0;
    
    promptIds.forEach(promptId => {
        const colorStr = colors[promptId];
        const weight = weights[promptId];
        const d3Color = d3.color(colorStr);
        
        if (d3Color) {
            // Convert to RGB to ensure we have r, g, b properties
            const rgbColor = d3Color.rgb();
            
            totalR += rgbColor.r * weight;
            totalG += rgbColor.g * weight;
            totalB += rgbColor.b * weight;
        }
    });

    // Create the blended color using d3.rgb
    const blendedColor = d3.rgb(
        Math.round(totalR),
        Math.round(totalG),
        Math.round(totalB)
    );

    return blendedColor.toString();
}