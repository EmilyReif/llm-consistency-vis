import React from 'react';
import * as d3 from 'd3';
import './node_examples_popup.css';
import * as utils from './utils';
import * as color_utils from './color_utils';
import { NodeDatum } from './single_example_wordgraph';

interface PromptGroup {
    promptId: string;
    generations: string[];
}

interface Props {
    nodes: NodeDatum[];
    hoveredNode: NodeDatum | null;
    promptGroups: PromptGroup[];
    isVisible: boolean;
    onClose: () => void;
    onRemoveNode: (node: NodeDatum) => void;
}

interface HighlightGroup {
    key: string;
    color: string;
    nodeWord: string;
    phrases: string[];
}

interface ExampleItem {
    html: string;
    sentIdx: number;
    promptId: string;
    textColor: string;
}

type ViewState = 'minimized' | 'default' | 'maximized';

const MIN_POPUP_WIDTH = 200;
const MAX_POPUP_WIDTH_RATIO = 0.95;
const DEFAULT_VIEW_RIGHT_INSET = 20;

interface State {
    examples: ExampleItem[];
    matchingCount: number;
    totalGenerations: number;
    viewState: ViewState;
    maximizedWidthPx: number | null;
    defaultWidthPx: number | null;
    isResizing: boolean;
}

class NodeExamplesPopup extends React.Component<Props, State> {
    private popupRef: React.RefObject<HTMLDivElement> = React.createRef();

    constructor(props: Props) {
        super(props);
        this.state = {
            examples: [],
            matchingCount: 0,
            totalGenerations: this.calculateTotalGenerations(props.promptGroups),
            viewState: 'default',
            maximizedWidthPx: null,
            defaultWidthPx: null,
            isResizing: false
        };
    }

    componentDidMount() {
        // Initialize with all outputs if popup is visible
        if (this.props.isVisible) {
            this.updatePopupContent();
        }
    }

    componentWillUnmount() {
        document.removeEventListener('mousemove', this.handleResizeMouseMove);
        document.removeEventListener('mouseup', this.handleResizeMouseUp);
    }

    private handleResizeMouseDown = () => {
        this.setState({ isResizing: true });
        document.body.classList.add('popup-resizing');
        document.addEventListener('mousemove', this.handleResizeMouseMove);
        document.addEventListener('mouseup', this.handleResizeMouseUp);
    };

    private handleResizeMouseMove = (e: MouseEvent) => {
        const { viewState } = this.state;
        const rightEdge = viewState === 'maximized'
            ? window.innerWidth
            : window.innerWidth - DEFAULT_VIEW_RIGHT_INSET;
        const maxWidth = viewState === 'maximized'
            ? window.innerWidth * MAX_POPUP_WIDTH_RATIO
            : window.innerWidth - DEFAULT_VIEW_RIGHT_INSET * 2;
        const rawWidth = rightEdge - e.clientX;
        const width = Math.max(MIN_POPUP_WIDTH, Math.min(maxWidth, rawWidth));
        if (viewState === 'maximized') {
            this.setState({ maximizedWidthPx: width });
        } else {
            this.setState({ defaultWidthPx: width });
        }
    };

    private handleResizeMouseUp = () => {
        this.setState({ isResizing: false });
        document.body.classList.remove('popup-resizing');
        document.removeEventListener('mousemove', this.handleResizeMouseMove);
        document.removeEventListener('mouseup', this.handleResizeMouseUp);
    };

    componentDidUpdate(prevProps: Props) {
        const nodesChanged = !this.areNodeArraysEqual(prevProps.nodes, this.props.nodes);
        const hoveredNodeChanged = prevProps.hoveredNode !== this.props.hoveredNode;
        const visibilityChanged = prevProps.isVisible !== this.props.isVisible;
        const promptGroupsChanged = prevProps.promptGroups !== this.props.promptGroups;

        if ((this.props.isVisible && (nodesChanged || hoveredNodeChanged || visibilityChanged || promptGroupsChanged)) ||
            (!prevProps.isVisible && this.props.isVisible)) {
            this.updatePopupContent();
        }

        if (promptGroupsChanged && !this.props.isVisible) {
            const totalGenerations = this.calculateTotalGenerations(this.props.promptGroups);
            if (totalGenerations !== this.state.totalGenerations) {
                this.setState({ totalGenerations });
            }
        }

        // Always update content when visible, even if visibility didn't change
        if (this.props.isVisible && (nodesChanged || hoveredNodeChanged || promptGroupsChanged)) {
            this.updatePopupContent();
        }
    }

    private updatePopupContent() {
        const { nodes, hoveredNode, promptGroups } = this.props;
        const totalGenerations = this.calculateTotalGenerations(promptGroups);

        // Nodes to use for highlighting: selected nodes + hovered node (if present and not already selected)
        const nodesForHighlight = hoveredNode && !nodes.includes(hoveredNode)
            ? [...nodes, hoveredNode]
            : nodes;

        // If no nodes are selected, show all outputs
        if (!nodes.length) {
            const allSentIndices = this.getAllSentIndices(promptGroups);
            const sentenceHighlightMap = hoveredNode
                ? this.buildSentenceHighlights([hoveredNode], allSentIndices)
                : new Map();
            const examples = this.buildExamples(promptGroups, allSentIndices, sentenceHighlightMap);
            const matchingCount = examples.length;

            if (!this.areExamplesEqual(examples, this.state.examples) ||
                matchingCount !== this.state.matchingCount ||
                totalGenerations !== this.state.totalGenerations) {
                this.setState({
                    examples,
                    matchingCount,
                    totalGenerations
                });
            }
            return;
        }

        const commonSentIndices = this.getCommonSentIndices(nodes);
        if (!commonSentIndices.length) {
            if (this.state.examples.length || this.state.matchingCount || this.state.totalGenerations !== totalGenerations) {
                this.setState({
                    examples: [],
                    matchingCount: 0,
                    totalGenerations
                });
            }
            return;
        }

        const sentenceHighlightMap = this.buildSentenceHighlights(nodesForHighlight, commonSentIndices);
        const examples = this.buildExamples(promptGroups, commonSentIndices, sentenceHighlightMap);
        const matchingCount = examples.length;

        if (!this.areExamplesEqual(examples, this.state.examples) ||
            matchingCount !== this.state.matchingCount ||
            totalGenerations !== this.state.totalGenerations) {
            this.setState({
                examples,
                matchingCount,
                totalGenerations
            });
        }
    }

    private buildExamples(promptGroups: PromptGroup[], sentIndices: number[], highlights: Map<number, HighlightGroup[]>): ExampleItem[] {
        const sentIndexSet = new Set(sentIndices);
        const examples: ExampleItem[] = [];
        let currentSentIdx = -1;

        promptGroups.forEach(group => {
            group.generations.forEach(generation => {
                currentSentIdx++;
                if (!sentIndexSet.has(currentSentIdx)) {
                    return;
                }

                const textColor = this.getPromptColor(group.promptId);
                const highlightGroups = highlights.get(currentSentIdx) || [];
                const html = this.createHighlightedHtml(generation, highlightGroups);

                examples.push({
                    html,
                    sentIdx: currentSentIdx,
                    promptId: group.promptId,
                    textColor
                });
            });
        });

        return examples;
    }

    private buildSentenceHighlights(nodes: NodeDatum[], sentIndices: number[]): Map<number, HighlightGroup[]> {
        const highlightMap = new Map<number, HighlightGroup[]>();
        const sentIndexSet = new Set(sentIndices);

        const nodeMetadata = nodes.map((node, index) => {
            const key = this.getNodeKey(node, index);
            const color = this.getNodeDisplayColor(node, index);
            const infoBySentence = new Map<number, string[]>();

            (node.origSentenceInfo || []).forEach(info => {
                if (!sentIndexSet.has(info.sentIdx)) {
                    return;
                }
                const phrase = info.origWords.join(' ').trim();
                if (!phrase) {
                    return;
                }
                if (!infoBySentence.has(info.sentIdx)) {
                    infoBySentence.set(info.sentIdx, []);
                }
                infoBySentence.get(info.sentIdx)!.push(phrase);
            });

            return {
                node,
                index,
                key,
                color,
                infoBySentence
            };
        });

        sentIndices.forEach(sentIdx => {
            const groups: HighlightGroup[] = [];
            nodeMetadata.forEach(({ node, key, color, infoBySentence }) => {
                const phrases = infoBySentence.get(sentIdx) || [node.word];
                const uniquePhrases = Array.from(new Set(phrases
                    .map(phrase => phrase.trim())
                    .filter(phrase => phrase.length)));

                groups.push({
                    key,
                    color,
                    nodeWord: node.word,
                    phrases: uniquePhrases.length ? uniquePhrases : [node.word]
                });
            });
            highlightMap.set(sentIdx, groups);
        });

        return highlightMap;
    }

    private createHighlightedHtml(text: string, highlightGroups: HighlightGroup[]): string {
        const ranges: { start: number; end: number; color: string }[] = [];

        highlightGroups.forEach(group => {
            const phrases = [...group.phrases].sort((a, b) => b.length - a.length);
            const highlightColor = this.withAlpha(group.color, 0.2);

            phrases.forEach(phrase => {
                const matches = this.findMatches(text, phrase);
                for (const match of matches) {
                    if (!this.overlapsExistingRange(match.start, match.end, ranges)) {
                        ranges.push({
                            start: match.start,
                            end: match.end,
                            color: highlightColor
                        });
                        break;
                    }
                }
            });
        });

        if (!ranges.length) {
            return this.escapeHtml(text);
        }

        ranges.sort((a, b) => a.start - b.start);

        let result = '';
        let cursor = 0;

        ranges.forEach(range => {
            if (range.start > cursor) {
                result += this.escapeHtml(text.slice(cursor, range.start));
            }
            const segment = this.escapeHtml(text.slice(range.start, range.end));
            result += `<b style="background-color: ${range.color};">${segment}</b>`;
            cursor = range.end;
        });

        if (cursor < text.length) {
            result += this.escapeHtml(text.slice(cursor));
        }

        return result;
    }

    private findMatches(text: string, phrase: string): Array<{ start: number; end: number }> {
        const trimmed = phrase.trim();
        if (!trimmed.length) {
            return [];
        }
        const escapedPhrase = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedPhrase, 'gi');
        const matches: Array<{ start: number; end: number }> = [];

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            matches.push({ start: match.index, end: match.index + match[0].length });
            if (regex.lastIndex === match.index) {
                regex.lastIndex++;
            }
        }

        return matches;
    }

    private overlapsExistingRange(start: number, end: number, ranges: { start: number; end: number }[]): boolean {
        return ranges.some(range => !(end <= range.start || start >= range.end));
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\r\n|\r|\n/g, '<br/>');
    }

    private calculateTotalGenerations(promptGroups: PromptGroup[]) {
        return promptGroups.reduce((acc, group) => acc + group.generations.length, 0);
    }

    private getPromptColor(promptId: string) {
        const index = color_utils.getPromptIndexFromId(promptId);
        return color_utils.MILLER_STONE_COLORS[index % color_utils.MILLER_STONE_COLORS.length];
    }

    private getNodeDisplayColor(node: NodeDatum, index: number) {
        if (node.origPromptIds && node.origPromptIds.length) {
            const promptIndex = color_utils.getPromptIndexFromId(node.origPromptIds[0]);
            return color_utils.MILLER_STONE_COLORS[promptIndex % color_utils.MILLER_STONE_COLORS.length];
        }
        const wordSignature = node.word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorIndex = (wordSignature + index * 7) % color_utils.MILLER_STONE_COLORS.length;
        return color_utils.MILLER_STONE_COLORS[colorIndex];
    }

    private getAllSentIndices(promptGroups: PromptGroup[]): number[] {
        const totalGenerations = this.calculateTotalGenerations(promptGroups);
        return Array.from({ length: totalGenerations }, (_, i) => i);
    }

    private getCommonSentIndices(nodes: NodeDatum[]) {
        if (!nodes.length) {
            return [];
        }

        let intersection = Array.from(new Set(nodes[0].origSentIndices || []));
        for (let i = 1; i < nodes.length; i++) {
            const nodeSet = new Set(nodes[i].origSentIndices || []);
            intersection = intersection.filter(idx => nodeSet.has(idx));
            if (!intersection.length) {
                break;
            }
        }
        return intersection;
    }

    private areNodeArraysEqual(a: NodeDatum[], b: NodeDatum[]) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                return false;
            }
        }
        return true;
    }

    private areExamplesEqual(a: ExampleItem[], b: ExampleItem[]) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (a[i].html !== b[i].html ||
                a[i].sentIdx !== b[i].sentIdx ||
                a[i].promptId !== b[i].promptId ||
                a[i].textColor !== b[i].textColor) {
                return false;
            }
        }
        return true;
    }

    private getNodeKey(node: NodeDatum, index: number) {
        return `${node.word}-${index}`;
    }

    private withAlpha(color: string, alpha: number) {
        const parsed = d3.color(color);
        if (!parsed) {
            return color;
        }
        const rgb = parsed.rgb();
        rgb.opacity = alpha;
        return rgb.toString();
    }

    private setViewState = (viewState: ViewState) => {
        this.setState({ viewState });
    };

    render() {
        const { isVisible, onClose, nodes, onRemoveNode } = this.props;
        const { examples, matchingCount, totalGenerations, viewState } = this.state;
        const percentage = totalGenerations > 0 ? Math.round((matchingCount / totalGenerations) * 100) : 0;
        const nodesHTML = <div className="selected-nodes">
            {nodes.map((node, idx) => {
                const color = this.getNodeDisplayColor(node, idx);
                const backgroundColor = this.withAlpha(color, 0.15);
                return (<React.Fragment key={`${node.word}-${idx}`}>
                    <span
                        className="node-chip"
                        style={{
                            borderColor: color,
                            color,
                            backgroundColor
                        }}
                    >
                        <span className="node-chip-label">{utils.unformat(node.word)}</span>
                        <button
                            type="button"
                            className="node-chip-remove"
                            onClick={() => onRemoveNode(node)}
                            aria-label={`Remove ${node.word}`}
                        >
                            ×
                        </button>
                    </span>
                    {idx < nodes.length - 1 && <span>or </span>}
                </React.Fragment>);
            })}
        </div>;

        const classNames = ['node-examples-popup'];
        if (viewState === 'maximized') {
            classNames.push('maximized');
        } else if (viewState === 'minimized') {
            classNames.push('minimized');
        }

        const widthStyle: React.CSSProperties = viewState === 'maximized' && this.state.maximizedWidthPx != null
            ? { width: `${this.state.maximizedWidthPx}px` }
            : viewState === 'default' && this.state.defaultWidthPx != null
                ? { width: `${this.state.defaultWidthPx}px` }
                : {};

        return (
            <div
                ref={this.popupRef}
                className={classNames.join(' ')}
                style={{ display: isVisible ? 'block' : 'none', ...widthStyle }}
            >
                {(viewState === 'maximized' || viewState === 'default') && (
                    <div
                        className="resize-handle"
                        onMouseDown={this.handleResizeMouseDown}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize panel"
                    />
                )}
                <div className="popup-header">
                    <div className="popup-title">
                        <div className="popup-title-main">
                            {nodes.length > 0 ? (
                                <>Examples containing {nodesHTML}: {matchingCount}/{totalGenerations} ({percentage}%)</>
                            ) : (
                                <>All outputs: {matchingCount}/{totalGenerations} ({percentage}%)</>
                            )}
                        </div>

                    </div>
                    <div className="popup-actions">
                        {viewState === 'minimized' && (
                            <button
                                type="button"
                                className="popup-action-button"
                                onClick={() => this.setViewState('default')}
                                title="Restore to default view"
                            >
                                =
                            </button>
                        )}
                        {viewState === 'default' && (
                            <>
                                <button
                                    type="button"
                                    className="popup-action-button"
                                    onClick={() => this.setViewState('minimized')}
                                    title="Minimize"
                                >
                                    ߺ
                                </button>
                                <button
                                    type="button"
                                    className="popup-action-button"
                                    onClick={() => this.setViewState('maximized')}
                                    title="Maximize"
                                >
                                    ≡
                                </button>
                            </>
                        )}
                        {viewState === 'maximized' && (
                            <button
                                type="button"
                                className="popup-action-button"
                                onClick={() => this.setViewState('default')}
                                title="Restore to default view"
                            >
                                =
                            </button>
                        )}
                    </div>
                </div>
                <div className="popup-content">
                    {matchingCount === 0 ? (
                        <div className="no-examples-message">
                            {nodes.length > 0 
                                ? 'No examples found containing all selected nodes.'
                                : 'No outputs available.'}
                        </div>
                    ) : (
                        examples.map(example => {
                            const hoveredNode = this.props.hoveredNode;
                            const isDimmed = hoveredNode != null && !hoveredNode.origSentIndices.includes(example.sentIdx);
                            return (
                                <div
                                    key={`${example.promptId}-${example.sentIdx}`}
                                    className={`example-item${isDimmed ? ' example-item-dimmed' : ''}`}
                                    style={{ color: example.textColor }}
                                    dangerouslySetInnerHTML={{ __html: example.html }}
                                />
                            );
                        })
                    )}
                </div>
            </div>
        );
    }
}

export default NodeExamplesPopup;

