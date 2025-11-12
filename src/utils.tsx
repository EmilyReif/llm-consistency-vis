import { NodeDatum, LinkDatum, OrigSentenceInfo } from './single_example_wordgraph';
import * as d3 from "d3";
import { getEmbeddings } from './embed'

export type TokenizeMode = "space" | "comma" | "sentence";

// Maps token keys to their original word from the source text
const tokensToOrigWord: { [key: string]: string } = {};
const embsDict: { [key: string]: { word: string, prevWords: string[], nextWords: string[], idx: number } } = {};
const CONTEXT_WINDOW_SIZE = 1; // Number of words on either side to consider
const CLEAN_TEXT = false;

// Common English stopwords to ignore when building context windows
export const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'or', 'but', 'not', 'this', 'these',
    'those', 'i', 'you', 'we', 'they', 'them', 'their', 'our', 'your',
    'been', 'being', 'have', 'had', 'do', 'does', 'did', 'am'
]);

function isStopword(word: string): boolean {
    const normalized = word.toLowerCase().replace(/[^\w\s\'.!?]|_/g, "").replace(/\s+/g, " ").trim();
    return STOPWORDS.has(normalized);
}

/** Strip all whitespace and punctuation from a string. */
function stripWhitespaceAndPunctuation(str: string): string {
    return str.replace(/[\s\p{P}]/gu, '');
}

export function unformat(word: string) {
    return tokensToOrigWord[word];
}

export function arraysAreEqual(a: any[], b: any[]) {
    return a.length === b.length &&
        a.every((element, index) => element === b[index]);
}
export function tokenize(
    sent: string,
    sentenceIdx?: number,
    mode: TokenizeMode = "space"
): string[] {
    // normalize text

    let chunks: string[] = [];

    if (mode === "space") {
        chunks = sent.split(/\s+/);
    } else if (mode === "comma") {
        chunks = sent.split(/\s*,\s*/);
    } else if (mode === "sentence") {
        chunks = sent.split(/(?<=[.!?])\s+/);  // split on sentence boundaries
    }

    // clean out empty strings
    chunks = chunks.filter(c => c.length > 0);

    // wrap into tokenKeys
    let tokens: string[] = chunks.map((chunk, i) => {
        const originalChunk = chunk; // Store the original before any cleaning

        if (CLEAN_TEXT) {
            chunk = chunk.replace(/[^\w\s\'.!?]|_/g, "").replace(/\s+/g, " ");
            chunk = chunk.toLowerCase().trim();
        }

        let tokenKey = chunk + sentenceIdx + i;

        // Collect n non-stopword words before and after the current word
        const prevWords: string[] = [];
        const nextWords: string[] = [];

        // Collect previous words (skipping stopwords)
        let prevCount = 0;
        let prevOffset = 1;
        while (prevCount < CONTEXT_WINDOW_SIZE && i - prevOffset >= 0) {
            const prevWord = chunks[i - prevOffset];
            if (!isStopword(prevWord)) {
                prevWords.unshift(prevWord);
            }
            prevOffset++;
        }

        // Collect next words (skipping stopwords)
        let nextCount = 0;
        let nextOffset = 1;
        while (nextCount < CONTEXT_WINDOW_SIZE && i + nextOffset < chunks.length) {
            const nextWord = chunks[i + nextOffset];
            if (!isStopword(nextWord)) {
                nextWords.push(nextWord);
                nextCount++;
            }
            nextOffset++;
        }

        embsDict[tokenKey] = {
            word: chunk,
            prevWords,
            nextWords,
            idx: i
        };

        tokensToOrigWord[tokenKey] = originalChunk; // Store the original unmodified word
        return tokenKey;
    });

    return tokens;
}

/** Calculate Levenshtein distance between two strings. */
function levenshteinDistance(str1: string, str2: string): number {
    if (!str1) return str2 ? str2.length : 0;
    if (!str2) return str1.length;

    const matrix: number[][] = [];

    // Initialize first column and row
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

/** Convert Levenshtein distance to a similarity score (0 to 1, higher is more similar). */
function levenshteinSimilarity(str1: string, str2: string): number {
    // Strip out all punctuation and whitespace
    const cleanStr1 = stripWhitespaceAndPunctuation(str1);
    const cleanStr2 = stripWhitespaceAndPunctuation(str2);

    if (!cleanStr1 || !cleanStr2) return 0;
    const distance = levenshteinDistance(cleanStr1, cleanStr2);
    const maxLength = Math.max(cleanStr1.length, cleanStr2.length);
    return 1 - (distance / maxLength);
}

/** A hack to approximate contextual similarity between two tokens.
 * TODO: Replace with a real embedding model.
 */
function similarity(a: string, b: string): number {
    const embA = embsDict[a] || { word: '', prevWords: [], nextWords: [], idx: 0 };
    const embB = embsDict[b] || { word: '', prevWords: [], nextWords: [], idx: 0 };
    let counter = 0;

    // Check if the words themselves are stopwords
    const aIsStopword = isStopword(embA.word);
    const bIsStopword = isStopword(embB.word);
    const bothStopwords = aIsStopword && bIsStopword;

    // Adjust context weights if both words are stopwords (give more weight to context)
    const weight = 0.8;
    const isStartOrEnd = embA.prevWords.length === 0 || embB.prevWords.length === 0 || embA.nextWords.length === 0 || embB.nextWords.length === 0;
    if (bothStopwords && !isStartOrEnd) {
        const similarityPrevWords = levenshteinSimilarity(embA.prevWords.join(' '), embB.prevWords.join(' ')) * weight;
        const similarityNextWords = levenshteinSimilarity(embA.nextWords.join(' '), embB.nextWords.join(' ')) * weight;
        counter += Math.max(similarityPrevWords + similarityNextWords);
    }
    else {
        counter += levenshteinSimilarity(embA.word, embB.word) * weight;
    }
    counter -= Math.abs(embA.idx - embB.idx) / 20; // They have similar positions in the sentence.
    return counter;
}

/** Create graph data from prompt groups. */
export function createGraphDataFromPromptGroups(
    groups: { promptId: string; generations: string[] }[],
    similarityThreshold: number = 0.5,
    shuffle: boolean = false,
    tokenizeMode: TokenizeMode = "space"
): { nodesData: NodeDatum[]; linksData: LinkDatum[] } {
    const linksDict: { [key: string]: { [key: string]: { sentIdx: number, promptId: string }[] } } = {};
    const nodesDict: { [key: string]: NodeDatum } = {};
    let sentIdx = 0;
    groups.forEach(({ promptId, generations }) => {
        generations.forEach((generation) => {
            sentIdx++;
            let prevWord = '';
            const words = tokenize(generation, sentIdx, tokenizeMode);
            words.forEach((word, j) => {
                const currentWords = Object.keys(nodesDict);
                let similarNodes = currentWords.map((existingWord) => [similarity(existingWord, word), existingWord]).sort((a: any, b: any) => b[0] - a[0]) as any;
                similarNodes = similarNodes.filter((pair: any) => {
                    const [similarityScore, similarWord] = pair;
                    const isAboveThreshold = similarityScore > similarityThreshold;
                    const isFromSameSentence = nodesDict[similarWord]?.origSentIndices.includes(sentIdx);
                    // const isFromSameSentence = false;
                    return isAboveThreshold && !isFromSameSentence;
                });
                const similarNode = similarNodes?.[0]?.[1] || null;
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
                        origWordIndices: [],
                        origSentIndices: [],
                        // @ts-ignore augment at runtime for multi-prompt support
                        origPromptIds: [],
                        origSentenceInfo: [],
                        isRoot: j === 0,
                        children: [],
                        parents: [],
                    };
                };
                nodesDict[word].count += 1;
                nodesDict[word].origWordIndices.push(j);
                nodesDict[word].origSentIndices.push(sentIdx);
                // @ts-ignore optional field present when type extended
                nodesDict[word].origPromptIds && nodesDict[word].origPromptIds.push(promptId);

                // Track the original word(s) from the sentence
                // Get the original word that was tokenized
                const origWord = unformat(words[j]);
                nodesDict[word].origSentenceInfo!.push({
                    sentIdx,
                    wordIdx: j,
                    origWords: [origWord]
                });

                if (j === 0) {
                    nodesDict[word].isRoot = true;
                }
                if (j === words.length - 1) {
                    nodesDict[word].isEnd = true;
                }

                // Add a link from the previous word.
                if (j > 0) {
                    linksDict[prevWord] = linksDict[prevWord] || {};
                    const entries = linksDict[prevWord][word] || [];
                    entries.push({ sentIdx, promptId });
                    linksDict[prevWord][word] = entries;
                }
                prevWord = word;
            });
        });
    });

    merge(nodesDict as any, linksDict as any);

    const nodesData = Object.values(nodesDict);
    const linksData: LinkDatum[] = Object.entries(linksDict).flatMap(([source, targets]) => {
        return Object.entries(targets).flatMap(([target, entries]) => {
            const targetNode = nodesDict[target];
            const sourceNode = nodesDict[source];
            if (shuffle) {
                sourceNode.origSentIndices = d3.shuffle(sourceNode.origSentIndices);
                targetNode.origSentIndices = d3.shuffle(targetNode.origSentIndices);
            }
            if (!nodesDict[target]) {
                console.log('target not found', target);
            }
            return [...entries].map(({ sentIdx, promptId }) => {
                sourceNode?.children?.push(targetNode);
                targetNode?.parents?.push(sourceNode);
                return {
                    source: sourceNode,
                    target: targetNode,
                    sentIdx,
                    // @ts-ignore optional coloring field
                    promptId,
                };
            });
        });
    });

    return { nodesData, linksData };
}

/** Merge words that are sequential when there are no other branches. */
function merge(nodesDict: { [key: string]: NodeDatum }, linksDict: { [key: string]: { [key: string]: any[] } }) {
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

                // Merge the origSentenceInfo: combine consecutive words from the same sentence
                const sourceInfo = nodesDict[source].origSentenceInfo;
                const targetInfo = nodesDict[target].origSentenceInfo;

                if (sourceInfo && targetInfo) {
                    const mergedInfo: OrigSentenceInfo[] = [];

                    // For each source occurrence, find the corresponding target occurrence in the same sentence
                    sourceInfo.forEach(sInfo => {
                        // The target should be right after the last word in the source
                        const expectedTargetIdx = sInfo.wordIdx + sInfo.origWords.length;
                        const matchingTarget = targetInfo.find(tInfo =>
                            tInfo.sentIdx === sInfo.sentIdx && tInfo.wordIdx === expectedTargetIdx
                        );

                        if (matchingTarget) {
                            // Merge the words
                            mergedInfo.push({
                                sentIdx: sInfo.sentIdx,
                                wordIdx: sInfo.wordIdx,
                                origWords: [...sInfo.origWords, ...matchingTarget.origWords]
                            });
                        } else {
                            // If no matching target, just keep the source
                            mergedInfo.push(sInfo);
                        }
                    });

                    nodesDict[word].origSentenceInfo = mergedInfo;
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