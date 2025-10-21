import React from 'react';
import * as d3 from 'd3';
import './node_examples_popup.css';
import * as color_utils from './color_utils';
import { NodeDatum } from './single_example_wordgraph';

interface Props {
    node: NodeDatum | null;
    promptGroups: { promptId: string, generations: string[] }[];
    isVisible: boolean;
    onClose: () => void;
}

class NodeExamplesPopup extends React.Component<Props> {
    private popupRef: React.RefObject<HTMLDivElement> = React.createRef();

    componentDidUpdate(prevProps: Props) {
        // Update popup content when node or visibility changes
        if (this.props.isVisible && this.props.node && 
            (prevProps.node !== this.props.node || !prevProps.isVisible)) {
            this.updatePopupContent();
        }
    }

    private updatePopupContent() {
        const { node, promptGroups } = this.props;
        if (!node || !this.popupRef.current) return;

        // Get all generations that contain this node
        const sentIndices = node.origSentIndices;
        const sentenceInfoMap = new Map<number, string[]>();
        
        // Create a map of sentIdx to origWords for quick lookup
        if (node.origSentenceInfo) {
            node.origSentenceInfo.forEach(info => {
                if (!sentenceInfoMap.has(info.sentIdx)) {
                    sentenceInfoMap.set(info.sentIdx, []);
                }
                sentenceInfoMap.get(info.sentIdx)!.push(...info.origWords);
            });
        }
        
        // Calculate total number of generations
        const totalGenerations = promptGroups.reduce((acc, group) => acc + group.generations.length, 0);
        
        // Flatten all generations from all prompt groups and get the ones matching sentIndices
        // Note: sentIdx in utils.tsx starts at 0 and increments BEFORE processing each generation
        let currentSentIdx = 0;
        const examples: { text: string, sentIdx: number, promptId: string }[] = [];
        promptGroups.forEach(group => {
            group.generations.forEach(generation => {
                currentSentIdx++; // Increment first to match the logic in utils.tsx
                if (sentIndices.includes(currentSentIdx)) {
                    examples.push({ text: generation, sentIdx: currentSentIdx, promptId: group.promptId });
                }
            });
        });
        
        // Calculate percentage
        const percentage = totalGenerations > 0 ? Math.round((examples.length / totalGenerations) * 100) : 0;
        
        // Update popup title with percentage
        const popupTitle = this.popupRef.current.querySelector('.popup-title');
        if (popupTitle) {
            popupTitle.textContent = `Examples containing this node: ${examples.length}/${totalGenerations} (${percentage}%)`;
        }
        
        // Update popup content with bold highlighting
        const popupContent = this.popupRef.current.querySelector('.popup-content');
        if (popupContent) {
            popupContent.innerHTML = examples
                .map(({ text, sentIdx, promptId }) => {
                    const wordsToHighlight = sentenceInfoMap.get(sentIdx) || [];
                    // Extract original prompt index from promptId for consistent coloring
                    const match = promptId.match(/_(\d+)_/);
                    const originalIndex = match ? match[1] : '0';
                    const color = color_utils.MILLER_STONE_COLORS[parseInt(originalIndex) % color_utils.MILLER_STONE_COLORS.length];
                    const highlightedText = this.highlightWordsInText(text, wordsToHighlight, color);
                    return `<div class="example-item" style="color: ${color};">${highlightedText}</div>`;
                })
                .join('');
        }
    }

    private highlightWordsInText(text: string, wordsToHighlight: string[], color: string): string {
        if (!wordsToHighlight || wordsToHighlight.length === 0) {
            return text;
        }
        
        // Convert color to rgba with alpha for background using d3
        const d3Color = d3.rgb(color);
        d3Color.opacity = 0.2;
        const bgColor = d3Color.toString();
        
        // Create a combined pattern from all words to highlight
        // Sort by length descending to match longer phrases first
        const sortedWords = [...wordsToHighlight].sort((a, b) => b.length - a.length);
        
        // Try to find the exact sequence of words in the text
        const combinedPhrase = wordsToHighlight.join(' ');
        
        // First, try to find the exact combined phrase
        let highlightedText = text;
        const phraseIndex = text.toLowerCase().indexOf(combinedPhrase.toLowerCase());
        
        if (phraseIndex !== -1) {
            // Found the exact phrase
            const beforePhrase = text.substring(0, phraseIndex);
            const phrase = text.substring(phraseIndex, phraseIndex + combinedPhrase.length);
            const afterPhrase = text.substring(phraseIndex + combinedPhrase.length);
            highlightedText = `${beforePhrase}<b style="background-color: ${bgColor};">${phrase}</b>${afterPhrase}`;
        } else {
            // Couldn't find exact phrase, try to highlight each word individually
            // Use a case-insensitive regex that matches word boundaries
            sortedWords.forEach(word => {
                if (word.trim()) {
                    // Escape special regex characters
                    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Create a regex that matches the word with optional punctuation
                    const regex = new RegExp(`(${escapedWord})`, 'gi');
                    highlightedText = highlightedText.replace(regex, `<b style="background-color: ${bgColor};">$1</b>`);
                }
            });
        }
        
        return highlightedText;
    }

    render() {
        const { isVisible, onClose } = this.props;

        return (
            <div 
                ref={this.popupRef} 
                className="node-examples-popup" 
                style={{ display: isVisible ? 'block' : 'none' }}
            >
                <div className="popup-header">
                    <div className="popup-title">Examples containing this node:</div>
                    <button className="popup-close" onClick={onClose}>×</button>
                </div>
                <div className="popup-content"></div>
            </div>
        );
    }
}

export default NodeExamplesPopup;

