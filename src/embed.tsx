// embed.ts
import { pipeline, AutoTokenizer, Tensor } from '@huggingface/transformers';

class Embedder {
    extractor: any;
    tokenizer: any;
    // modelId = 'Xenova/all-MiniLM-L6-v2';
    // modelId = 'Xenova/distiluse-base-multilingual-cased-v1'
    modelId = 'Xenova/squeezebert-mnli'

    async getEmbeddings(inputs: string[], returnSentenceEmbeddings: boolean = false): Promise<{ tokens: string[][], embeddings: number[][][] }> {
        if (!inputs.length) {
            return { tokens: [], embeddings: [] };
        }

        // Initialize the extractor if not already available
        this.extractor = this.extractor || await pipeline('feature-extraction', this.modelId);

        // Get embeddings from extractor
        const outputs = await this.extractor(inputs, {
            // pooling: 'none',
            normalize: true,
        }) as any;

        // Get token embeddings shaped as [batch][token][dim]
        const unmergedEmbeddings: number[][][] = outputs.tolist();

        if (returnSentenceEmbeddings) {
            // If we want sentence embeddings, we need to average the token embeddings
            return {
                tokens: [inputs],
                embeddings: [[this.avgVectors(unmergedEmbeddings[0])]], // Single array of sentence embeddings
            };
        }

        // Get raw tokens per sentence
        const unmergedTokens: string[][] = await this.tokenize(inputs);

        const mergedEmbeddings: number[][][] = [];
        const mergedTokens: string[][] = [];

        for (let i = 0; i < inputs.length; i++) {
            const sentenceTokens = unmergedTokens[i];
            const sentenceEmbeddings = unmergedEmbeddings[i];

            const mergedSentenceTokens: string[] = [];
            const mergedSentenceEmbeddings: number[][] = [];

            let currentToken = '';
            let currentVectors: number[][] = [];

            for (let j = 0; j < sentenceTokens.length; j++) {
                const token = sentenceTokens[j];
                const embedding = sentenceEmbeddings[j];

                const isSubword = token.startsWith('##');

                if (isSubword) {
                    // Merge with current word
                    currentToken += token.replace(/^##/, '');
                    currentVectors.push(embedding);
                } else {
                    // Push previous word and start new one
                    if (currentToken) {
                        mergedSentenceTokens.push(currentToken);
                        mergedSentenceEmbeddings.push(this.avgVectors(currentVectors));
                    }

                    currentToken = token;
                    currentVectors = [embedding];
                }
            }

            // Push last word
            if (currentToken && currentVectors.length) {
                mergedSentenceTokens.push(currentToken);
                mergedSentenceEmbeddings.push(this.avgVectors(currentVectors));
            }

            mergedTokens.push(mergedSentenceTokens);
            mergedEmbeddings.push(mergedSentenceEmbeddings);
        }

        return {
            tokens: mergedTokens,
            embeddings: mergedEmbeddings,
        };
    }

    avgVectors(vectors: number[][]): number[] {
        // return vectors[vectors.length - 1];
        const dim = vectors[0].length;
        const sum = new Array(dim).fill(0);

        for (const vec of vectors) {
            for (let i = 0; i < dim; i++) {
                sum[i] += vec[i];
            }
        }

        return sum.map(x => x / vectors.length);
    }

    private async tokenize(inputs: string[]): Promise<string[][]> {
        this.tokenizer = this.tokenizer || await AutoTokenizer.from_pretrained(this.modelId);
        return inputs.map(input => this.tokenizer.tokenize(input));
    }
}

export const embedder = new Embedder();
