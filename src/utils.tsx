import { NodeDatum, LinkDatum, OrigSentenceInfo } from './single_example_wordgraph';
import * as d3 from "d3";
import { getEmbeddings } from './embed'
import { cosineSimilarity } from "fast-cosine-similarity";
import { ReachabilityChecker } from './reachability';

export type TokenizeMode = "space" | "comma" | "sentence";

// Global flag to use embeddings instead of Levenshtein distance
const USE_EMBS = true;

// Maps token keys to their original word from the source text
const tokensToOrigWord: { [key: string]: string } = {};
export type EmbEntry = { word: string, prevWord: string, nextWord: string, prevWordEmb?: number[], nextWordEmb?: number[], idx: number, embedding?: number[] };
const embsDict: { [key: string]: EmbEntry } = {};

// Common English stopwords to ignore when building context windows
export const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'or', 'but', 'not', 'this', 'these',
    'those', 'i', 'you', 'we', 'they', 'them', 'their', 'our', 'your',
    'been', 'being', 'have', 'had', 'do', 'does', 'did', 'am'
]);

function isStopword(word: string): boolean {
    const normalized = stripWhitespaceAndPunctuation(word);
    return STOPWORDS.has(normalized);
}

/** Strip all whitespace and punctuation from a string. */
export function stripWhitespaceAndPunctuation(str: string): string {
    return str.toLowerCase().replace(/[^\w\s'.!?]|_/g, "").replace(/\s+/g, " ").trim();
    // return str.toLowerCase().replace(/[\s\p{P}]/gu, '');
}

export function unformat(word: string) {
    return tokensToOrigWord[word];
}

export function arraysAreEqual(a: any[], b: any[]) {
    return a.length === b.length &&
        a.every((element, index) => element === b[index]);
}
export async function tokenize(
    sent: string,
    sentenceIdx?: number,
    mode: TokenizeMode = "space"
): Promise<string[]> {
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
    let tokens: string[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const originalChunk = chunk; // Store the original before any cleaning

        const word = chunk;

        let tokenKey = word + sentenceIdx + i;

        // Find the previous non-stopword
        let prevWord = '';
        for (let j = i - 1; j >= 0; j--) {
            if (!isStopword(chunks[j])) {
                prevWord = chunks[j];
                break;
            }
        }

        // Find the next non-stopword
        let nextWord = '';
        for (let j = i + 1; j < chunks.length; j++) {
            if (!isStopword(chunks[j])) {
                nextWord = chunks[j];
                break;
            }
        }

        const embEntry: EmbEntry = {
            word,
            prevWord,
            nextWord,
            idx: i
        };

        // Get embedding if USE_EMBS is enabled
        if (USE_EMBS) {
            try {
                const embedding = await getEmbeddings(word);
                embEntry.embedding = embedding;
                const prevWordEmb = await getEmbeddings(prevWord);
                embEntry.prevWordEmb = prevWordEmb;
                const nextWordEmb = await getEmbeddings(nextWord);
                embEntry.nextWordEmb = nextWordEmb;
            } catch (error) {

                console.warn(`Failed to get embedding for "${word}":`, error);
                console.log('prevWord', prevWord);
                console.log('nextWord', nextWord);
            }
        }
        embsDict[tokenKey] = embEntry as EmbEntry;
        tokensToOrigWord[tokenKey] = originalChunk; // Store the original unmodified word
        tokens.push(tokenKey);
    }

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

function emptyEmbEntry(): EmbEntry {
    return { word: '', prevWord: '', nextWord: '', idx: 0 };
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
    const embA = embsDict[a] || emptyEmbEntry();
    const embB = embsDict[b] || emptyEmbEntry();
    let counter = 0;

    // Check if the words themselves are stopwords
    const bothStopwords = isStopword(embA.word) && isStopword(embB.word);
    const stopwordWeight = .5;

    // Adjust context weights if both words are stopwords (give more weight to context)
    const isStartOrEnd = !embA.prevWord || !embB.prevWord || !embA.nextWord || !embB.nextWord;
    const areSameWord = stripWhitespaceAndPunctuation(embA.word) === stripWhitespaceAndPunctuation(embB.word);
    if (bothStopwords && !isStartOrEnd && areSameWord) {
        if (USE_EMBS) {
            const similarityPrevWords = cosineSimilarity(embA.prevWordEmb || [], embB.prevWordEmb || []) ;
            const similarityNextWords = cosineSimilarity(embA.nextWordEmb || [], embB.nextWordEmb || []) ;
            counter += Math.min(similarityPrevWords + similarityNextWords) * stopwordWeight;
        }
        else {
            const similarityPrevWords = levenshteinSimilarity(embA.prevWord!, embB.prevWord!) ;
            const similarityNextWords = levenshteinSimilarity(embA.nextWord!, embB.nextWord!) ;
            counter += Math.min(similarityPrevWords + similarityNextWords) * stopwordWeight;
        }
    }
    else if (bothStopwords && !areSameWord) {
        counter += 0;
    }
    else {
        if (USE_EMBS) {
            counter += cosineSimilarity(embA.embedding || [], embB.embedding || []);
        }
        else {
            counter += levenshteinSimilarity(embA.word, embB.word);
        }
    }
    
    const diffInIdx = Math.abs(embA.idx - embB.idx)
    counter -= diffInIdx*diffInIdx/100; // They have similar positions in the sentence.
    return counter;
}


function blankNode(word: string): NodeDatum {
   return  {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rx: 0,
        ry: 0,
        fontSize: 0,
        textLength: 0,
        count: 0,
        word,
        origWordIndices: [],
        origSentIndices: [],
        // @ts-ignore augment at runtime for multi-prompt support
        origPromptIds: [],
        origSentenceInfo: [],
        children: [],
        parents: [],
    };
}

function updateNode (node: NodeDatum, wordIdx: number, sentIdx: number, words: string[], promptId: string){
    node.count += 1;
    const origWord = words[wordIdx];
    node.origWordIndices.push(wordIdx);
    node.origSentIndices.push(sentIdx);
    // @ts-ignore optional field present when type extended
    node.origPromptIds && node.origPromptIds.push(promptId);
    
    // Track the original word(s) from the sentence
    // Get the original word that was tokenized
    node.origSentenceInfo!.push({
        sentIdx,
        wordIdx,
        origWords: [unformat(origWord)]
    });

    if (wordIdx === 0) {
        node.isRoot = true;
    }
    if (wordIdx === words.length - 1) {
        node.isEnd = true;
    }
    return node
}

function addLinks(nodesDict: any, linksDict: any, word: string, prevWord: string, sentIdx: number, promptId: string){
    if (!prevWord) {
        return;
    }
    nodesDict[word].parents.push(nodesDict[prevWord]);
    nodesDict[prevWord].children.push(nodesDict[word]);

    linksDict[prevWord] = linksDict[prevWord] || {};
    const entries = linksDict[prevWord][word] || [];
    entries.push({ sentIdx, promptId });
    linksDict[prevWord][word] = entries;
}

/** Create graph data from prompt groups. */
export async function createGraphDataFromPromptGroups(
    groups: { promptId: string; generations: string[] }[],
    similarityThreshold: number = 0.5,
    shuffle: boolean = false,
    tokenizeMode: TokenizeMode = "space"
): Promise<{ nodesData: NodeDatum[]; linksData: LinkDatum[] }> {


    const linksDict: { [key: string]: { [key: string]: { sentIdx: number, promptId: string }[] } } = {};
    const nodesDict: { [key: string]: NodeDatum } = {};
    const reachabilityChecker = new ReachabilityChecker();
    
    let sentIdx = 0;
    for (const { promptId, generations } of groups) {
        for (const generation of generations) {
            sentIdx++;
            let prevWord = '';
            const words = await tokenize(generation, sentIdx, tokenizeMode);
            words.forEach((word, j) => {
                let similarNodes = Object.keys(nodesDict).map((existingWord: any) => {
                    const sameSentence = nodesDict[existingWord]?.origSentIndices.includes(sentIdx);
                    if (sameSentence) return ;
                    const similarityScore = similarity(existingWord, word);
                    if (similarityScore < similarityThreshold) return;
                    
                    // Check if merging would create a cycle
                    if (prevWord && reachabilityChecker.wouldCreateCycleThroughIncomingEdge(existingWord, prevWord)) {
                        return;
                    }
                    
                    return [similarityScore, existingWord];
                }).filter((node: any) => node !== undefined);
                similarNodes = similarNodes.sort((a: any, b: any) => b[0] - a[0]) as any;
                const similarNode = similarNodes?.[0]?.[1] || null;
                if (similarNode) {
                    word = similarNode as string;
                } else {
                    nodesDict[word] = blankNode(word);
                    reachabilityChecker.initNode(word);
                };

                nodesDict[word] = updateNode(nodesDict[word], j, sentIdx, words, promptId);
                if (prevWord) {
                    reachabilityChecker.addEdge(prevWord, word);
                }
                addLinks(nodesDict, linksDict, word, prevWord, sentIdx, promptId);
                prevWord = word;
            });
        }
    }

    // clear parents and children of nodes.
    Object.values(nodesDict).forEach(node => {
        node.parents = [];
        node.children = [];
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