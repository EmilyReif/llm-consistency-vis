import { LLM } from "./base";
import { OpenAILLM } from "./openai";
import { GrokLLM } from "./grok";

export function createLLM(familyId: string, modelId: string, apiKey?: string): LLM {
    switch (familyId) {
        case "openai":
            return new OpenAILLM(modelId, apiKey);
        case "grok":
            return new GrokLLM(modelId, apiKey);
        // Future model families can be added here:
        // case "anthropic":
        //     return new AnthropicLLM(modelId, apiKey);
        // case "google":
        //     return new GoogleLLM(modelId, apiKey);
        default:
            throw new Error(`Unknown model family: ${familyId}`);
    }
}
