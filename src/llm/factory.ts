import { LLM } from "./base";
import { getProviderConfig } from "./config";
import { OpenAILLM } from "./openai";

export function createLLM(familyId: string, modelId: string, apiKey?: string): LLM {
    // Special case for OpenAI to support generateSimilarPrompts
    if (familyId === "openai") {
        return new OpenAILLM(modelId, apiKey);
    }
    
    // Generic config-based LLM for all other providers
    const config = getProviderConfig(familyId);
    if (!config) {
        throw new Error(`Unknown provider: ${familyId}`);
    }
    
    return new LLM(config, modelId, apiKey);
}
