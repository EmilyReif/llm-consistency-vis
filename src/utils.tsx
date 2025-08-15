import { NodeDatum, LinkDatum } from './single_example_wordgraph';
import * as d3 from "d3";
import {getEmbeddings} from './embed'

const tokensToOrigWord: { [key: string]: string } = {};
const embsDict: { [key: string]: { word: string, prevWord: string, nextWord: string, idx: number } } = {};


export function unformat(word: string) {
    return tokensToOrigWord[word];
}

export function arraysAreEqual(a: string[], b: string[]) {
    return a.length === b.length &&
        a.every((element, index) => element === b[index]);
}

export function tokenize(sent: string, sentenceIdx?: number): string[] {
    sent = sent.replace(/[^\w\s\']|_/g, "").replace(/\s+/g, " ")
    sent = sent.toLowerCase();
    let words = sent.split(' ');
    words = words.map((origWord, i) => {
        let tokenKey = origWord + sentenceIdx + i;

        // Eventually, use a real contextual embedding.
        embsDict[tokenKey] = { word: origWord, prevWord: words[i - 1], nextWord: words[i - 2], idx: i }
        // Pad the embeddings dict with the actual word itself.
        // (This is a hack to fix a bug where the first words of each sentence are likely to be seen as "matches")


        tokensToOrigWord[tokenKey] = origWord;
        return tokenKey;
    });
    return words;
}

/** A hack to approximate contextual similarity between two tokens.
 * TODO: Replace with a real embedding model.
 */
function similarity(a: string, b: string): number {
    const embA = embsDict[a] || [];
    const embB = embsDict[b] || [];
    let counter = 0;
    if (embA.prevWord === embB.prevWord) {
        counter += .25; // First word match
    }
    if (embA.word === embB.word) {
        counter += .5; // Actual word exact match
    }
    if (embA.nextWord === embB.nextWord) {
        counter += .25; // Third word match
    }
    counter -= Math.abs(embA.idx - embB.idx) / 20; // They have similar positions in the sentence.

    return counter
}


export function createGraphDataFromGenerations(generations: string[]): { nodesData: NodeDatum[], linksData: LinkDatum[] } {
    // getEmbeddings('this is a test')
    // Intermediate data structures for parsing.
    const linksDict: { [key: string]: { [key: string]: Set<string> } } = {};
    const nodesDict: { [key: string]: NodeDatum } = {};

    // Process generations to create nodes and links.
    generations.forEach((generation, i) => {
        let prevWord = '';
        const words = tokenize(generation, i);
        words.forEach((word, j) => {
            const currentWords = Object.keys(nodesDict);

            // Check if the word is similar to any existing node.
            const similarityThreshold = 0.5;
            let similarNodes = currentWords.map((existingWord) => [similarity(existingWord, word), existingWord]).sort((a: any, b: any) => b[0] - a[0]) as any;
            similarNodes = similarNodes.filter((pair: any) => {
                const [similarityScore, similarWord] = pair;
                const isAboveThreshold = similarityScore > similarityThreshold;
                const isFromSameSentence = nodesDict[similarWord]?.origSentIndices.has(i);
                return isAboveThreshold && !isFromSameSentence;
            });
            const similarNode = similarNodes?.[0]?.[1] || null;
            // const similarNode = similarNodes?.[0]?.[0] > similarityThreshold ? similarNodes?.[0][1] : null;
            
            if (similarNode && similarNode !== prevWord) {
                word = similarNode;
            }

            if (!nodesDict[word]) {
                nodesDict[word] = {
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    rx: 0,
                    ry: 0,
                    count: 0,
                    word,
                    origSentences: new Set<string>(),
                    origWordIndices: new Set<number>(),
                    origSentIndices: new Set<number>(),
                    isRoot: j === 0,
                    children: [],
                    parents: [],
                };
            };
            nodesDict[word].count += 1;
            nodesDict[word].origSentences.add(generation);
            nodesDict[word].origWordIndices.add(j);
            nodesDict[word].origSentIndices.add(i);
            if (j === 0) {
                nodesDict[word].isRoot = true;
            }
            if (j === words.length - 1) {
                nodesDict[word].isEnd = true;
            }

            // Add a link from the previous word.
            if (j > 0) {
                linksDict[prevWord] = linksDict[prevWord] || {};
                const sentences = linksDict[prevWord][word] || new Set<string>();
                sentences.add(generation);
                linksDict[prevWord][word] = sentences;
            }
            prevWord = word;
        });
    });
    merge(nodesDict, linksDict);

    // Process nodes and links to create data arrays.
    const nodesData = Object.values(nodesDict);

    const linksData: LinkDatum[] = Object.entries(linksDict).flatMap(([source, targets]) => {
        return Object.entries(targets).flatMap(([target, sentences]) => {
            const targetNode = nodesDict[target];
            const sourceNode = nodesDict[source];
            if (!nodesDict[target]) {
                console.log('target not found', target);
            }
            sourceNode?.children?.push(targetNode);
            targetNode?.parents?.push(sourceNode);
            return [...sentences].map((sentence) => {
                return {
                    source: sourceNode,
                    target: targetNode,
                    sentence,
                };
            });
        });
    });


    return { nodesData, linksData };
}

/** Merge words that are sequential when there are no other branches. */
function merge(nodesDict: { [key: string]: NodeDatum }, linksDict: { [key: string]: { [key: string]: Set<string> } }) {
    for (let i = 0; i < Object.keys(nodesDict).length; i++) {
        for (const source in nodesDict) {

            // Skip if we already merged this node.
            if (!(source in linksDict)) {
                continue;
            }

            const targets = Object.keys(linksDict[source]);

            // We found an edge to be merged
            const target = targets[0];
            const inEdgesForTarget = Object.keys(linksDict).filter(otherSource => linksDict[otherSource][target]);
            const shouldMerge = targets.length === 1 && inEdgesForTarget.length === 1;
            if (shouldMerge) {
                const word = source + ' ' + target;
                tokensToOrigWord[word] = unformat(source) + ' ' + unformat(target);
                // Create a new node with the merged word.
                nodesDict[word] = { ...nodesDict[source], word };

                if (nodesDict[target].isEnd) {
                    nodesDict[word].isEnd = true;
                }

                // Delete the old nodes.
                delete nodesDict[target];
                delete nodesDict[source];

                // Merge the edges.
                linksDict[word] = { ...linksDict[target] };
                delete linksDict[target];
                delete linksDict[source];

                // Update the links to point to the new node.
                for (const otherSource in linksDict) {
                    let otherTargets = linksDict[otherSource];
                    if (source in otherTargets) {
                        otherTargets[word] = otherTargets[source];
                        delete otherTargets[source];
                    }
                }
            }
        }
    }
}

export function parseUrlParam(urlParamName: string): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    const paramValue = urlParams.get(urlParamName);
    return paramValue ? decodeURIComponent(paramValue) : null;
}

export function setUrlParam(urlParamName: string, value: string): void {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set(urlParamName, encodeURIComponent(value));
    const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.pushState({}, '', newUrl);
}