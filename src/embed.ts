// embed.ts
import { pipeline, AutoTokenizer, Tensor } from '@huggingface/transformers';
import { cosineSimilarity } from "fast-cosine-similarity";

export async function getEmbeddings(input: string) {
    const modelId = 'Xenova/all-MiniLM-L6-v2';

    const extractor = await pipeline('feature-extraction');
    const tokenizer = await AutoTokenizer.from_pretrained(modelId);
    const tokens = tokenizer.tokenize(input)

    const output = (await extractor(['I love transformers!', 'I hate transformers.'],
        {
            pooling: 'none', // Get embeddings for each token
            // return_all_hidden_states: true,
        }
    )) as any;
    console.log(' ')
    console.log(tokens)
    console.log('OUTPUT', output)

    const embeddings = output;
    console.log(output.dims)
    console.log('embeddings', getEmbeddingsForLayer(embeddings[0], 0))
    console.log(`Number of tokens: ${embeddings.length}`);
    console.log(`Embedding dimension: ${embeddings[0].length}`);
    console.log(`First token embedding:`, embeddings[0]);
}

// Get [layer][token][embedding_dim] from the output
export function getEmbeddingsForLayer(
    allLayers: Tensor[],
    layerIndex: number,
): number[][] {
    const layerTensor = allLayers[layerIndex];
    console.log('layerTensor.dims', layerTensor.dims)
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