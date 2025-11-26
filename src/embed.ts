// embed.ts
import { pipeline, AutoTokenizer, Tensor } from '@huggingface/transformers';
import { cosineSimilarity } from "fast-cosine-similarity";

let extractorCache: any = null;
const modelId = 'Xenova/all-MiniLM-L6-v2';

// LRU cache for embeddings with max size of 500
const EMBEDDING_CACHE_SIZE = 500;
const embeddingCache = new Map<string, number[]>();

function getCachedEmbedding(input: string): number[] | null {
    if (embeddingCache.has(input)) {
        // Move to end (most recently used) by deleting and re-adding
        const cached = embeddingCache.get(input)!;
        embeddingCache.delete(input);
        embeddingCache.set(input, cached);
        return cached;
    }
    return null;
}

function setCachedEmbedding(input: string, embedding: number[]): void {
    // If cache is full, remove the oldest entry (first in Map)
    if (embeddingCache.size >= EMBEDDING_CACHE_SIZE) {
        const firstKey = embeddingCache.keys().next().value;
        if (firstKey !== undefined) {
            embeddingCache.delete(firstKey);
        }
    }
    embeddingCache.set(input, embedding);
}

export async function getEmbeddings(input: string): Promise<number[]> {
    // Check cache first
    const cached = getCachedEmbedding(input);
    if (cached !== null) {
        return cached;
    }

    // Initialize the extractor if not already available
    if (!extractorCache) {
        extractorCache = await pipeline('feature-extraction', modelId);
    }

    // Get embeddings from extractor
    const outputs = await extractorCache([input], {
        normalize: true,
    }) as any;

    // Get sentence embedding (averaged token embeddings)
    const tokenEmbeddings: number[][] = outputs.tolist()[0];
    
    // Average all token embeddings to get a single embedding vector for the word
    const dim = tokenEmbeddings[0].length;
    const sum = new Array(dim).fill(0);
    
    for (const vec of tokenEmbeddings) {
        for (let i = 0; i < dim; i++) {
            sum[i] += vec[i];
        }
    }
    
    const embedding = sum.map(x => x / tokenEmbeddings.length);
    
    // Cache the result
    setCachedEmbedding(input, embedding);
    
    return embedding;
}

// Get [layer][token][embedding_dim] from the output
export function getEmbeddingsForLayer(
    allLayers: Tensor[],
    layerIndex: number,
): number[][] {
    const layerTensor = allLayers[layerIndex];
    const [numTokens, hiddenSize] = layerTensor.dims;
    const embeddingsForLayer = []
    for (let tokenIndex = 0; tokenIndex < numTokens; tokenIndex++) {
        const start = (tokenIndex * hiddenSize);
        const end = start + hiddenSize;
        const embeddingForToken = Array.from(layerTensor.data.slice(start, end)) as number[];
        embeddingsForLayer.push(embeddingForToken)
    }


    return embeddingsForLayer;
}