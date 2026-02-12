// embed.ts
import { stripWhitespaceAndPunctuation } from './utils';
import { pipeline } from '@xenova/transformers';

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
    if (cached) {
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

export interface ContextualTokenResult {
    tokens: string[];
    embeddings: number[][];
}

/**
 * Get contextual token embeddings for a full sentence.
 * Each token's embedding is computed in the context of the full sentence.
 * Uses the model's native tokenization (WordPiece); skips [CLS] and [SEP].
 *
 * @param sentence The full sentence to embed
 */
export async function getContextualTokenEmbeddings(sentence: string): Promise<ContextualTokenResult> {
    if (!sentence?.trim()) {
        return { tokens: [], embeddings: [] };
    }

    if (!extractorCache) {
        extractorCache = await pipeline('feature-extraction', modelId);
    }

    // Tokenize to get token IDs (for decoding to strings)
    const encoded = extractorCache.tokenizer(sentence.trim(), {
        padding: false,
        truncation: true,
        add_special_tokens: true,
        return_tensor: false,
    });
    const inputIds = encoded.input_ids as number[][] | number[];
    const tokenIds: number[] = Array.isArray(inputIds[0])
        ? (inputIds[0] as number[])
        : (inputIds as number[]);
    const tokenStrings = extractorCache.tokenizer.model.convert_ids_to_tokens(tokenIds);

    // Get token embeddings (pooling: 'none' = no mean pooling, one vector per token)
    const output = await extractorCache([sentence.trim()], {
        pooling: 'none',
        normalize: true,
    });

    const tokenEmbeddings: number[][] = output.tolist()[0];

    // Skip [CLS] (first) and [SEP] (last) tokens
    const startIdx = 1;
    const endIdx = Math.max(1, tokenEmbeddings.length - 1);
    const tokens = tokenStrings.slice(startIdx, endIdx);
    const embeddings = tokenEmbeddings.slice(startIdx, endIdx);

    return { tokens, embeddings };
}
