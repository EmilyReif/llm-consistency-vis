// embed.ts
import { stripWhitespaceAndPunctuation } from './utils';

import { pipeline, env } from '@xenova/transformers';

// Some weird hacks to fix caching errors.
env.allowRemoteModels = true;
env.allowLocalModels = false;

// Make the URL construction unambiguous:
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/main/';

let extractorCache: any = null;
const modelId = 'Xenova/all-MiniLM-L6-v2';
const REDUCED_EMBEDDING_DIM = 50;

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
    input = stripWhitespaceAndPunctuation(input);
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
    
    let embedding = sum.map(x => x / tokenEmbeddings.length);
    embedding = embedding.slice(0, REDUCED_EMBEDDING_DIM);
    
    // Cache the result
    setCachedEmbedding(input, embedding);
    return embedding;
}
