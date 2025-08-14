import React from "react";
import './single_example_wordtree.css';
import { observer } from "mobx-react";
import * as d3 from 'd3';
import { Trie, TrieNode } from './trie';
interface Props {
    generations: string[];
}

class SingleExampleWordtree extends React.Component<Props> {
    trie = new Trie();
    state = { hoveredToken: '' };

    render() {
        const generations = this.props.generations;
        if (!generations) {
            return;
        }
        this.trie = new Trie();
        this.trie.insertSents(generations);
        const totalVisHeight = 35*generations.length;
        const heightPerChild = totalVisHeight / this.trie.root.numTotalChildren;
        const minFontSize = 12;


        const renderTrieNode = (trieNode: TrieNode, x: number, y: number, parentEndX: number, parentEndY: number) => {
            const childrenNodes = Object.entries(trieNode.children);

            const totalHeightForParent = trieNode.numTotalChildren * heightPerChild;
            const numChildren = childrenNodes.length;

            // Calculate heights
            let runningHeightTotal = 0;
            const heights = childrenNodes.reverse().map(value => {
                const [word, node] = value;
                const percentageOfSpace = node.numTotalChildren / trieNode.numTotalChildren / 2 || 0;
                runningHeightTotal += percentageOfSpace;
                return runningHeightTotal;
            });


            const range = totalHeightForParent / 2;
            const locMap = d3.scaleLinear().range([range, -range]).domain([0, 1]);

            return childrenNodes.map((value, i) => {
                const [word, node] = value;
                // const nodeImportance = node.numTotalChildren / this.trie.root.numTotalChildren;
                const nodeImportance = node.weight / 10;
                const fontSize = Math.ceil(Math.max(minFontSize, nodeImportance * 30));
                const charWidth = fontSize * .6; //TODO: what is the actual width of the word?

                const offsetY = locMap(heights[i])
                const endOfWordOffset = word.length * charWidth;
                const numSpacesAfterWord = Object.keys(node.children).length === 1 ? 1 : 5;
                const nextWordOffset = endOfWordOffset + charWidth * numSpacesAfterWord;

                const selfY = y + offsetY;
                const selfX = x;

                const selfEndX = selfX + endOfWordOffset;
                const selfEndY = selfY - fontSize / 2;

                const noLine = numChildren === 1 || trieNode === this.trie.root;
                const line = noLine ? '' : (
                    <path
                        d={`M ${parentEndX} ${parentEndY} 
                            C ${(parentEndX + selfX) / 2} ${parentEndY}, 
                              ${(parentEndX + selfX) / 2} ${selfEndY}, 
                              ${selfX - 5} ${selfEndY}`}
                        stroke="black"
                        fill="transparent"
                    />
                );
                const hoverColor = this.state.hoveredToken === word ? 'rgb(163, 198, 250)' : 'rgba(0, 0, 0, 0)';
                return (
                    <g>
                        {line}
                        <rect
                            x={selfX} y={selfY - fontSize} 
                            width={endOfWordOffset} height={fontSize}
                            fill={hoverColor}
                        ></rect>
                        <text
                            x={selfX} y={selfY}
                            key={word + x + y}
                            onMouseEnter={() => this.setState(state => ({ ...state, hoveredToken:word}))                        }
                            fontSize={fontSize}>{word}
                            <title>{i} {numChildren} {word}</title>
                            
                        </text>
                        {renderTrieNode(node, selfX + nextWordOffset, selfY, selfEndX + 5, selfEndY)}
                    </g>
                )
            })

        }


        return <svg className="wordtree-holder" style={{height: totalVisHeight * .6  }}>
            {renderTrieNode(this.trie.root, 0, totalVisHeight / 8 + 5, 0, 0)}
        </svg>;
    }

    async componentDidUpdate() {
        // this.trie = new Trie();
        // this.trie.insertSents(this.props.generations);
    }


}



export default observer(SingleExampleWordtree);
