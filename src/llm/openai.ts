import { generateText } from "ai";
import { LLM } from "./base";
import { getProviderConfig } from "./config";

// OpenAI-specific LLM class that extends base with generateSimilarPrompts
export class OpenAILLM extends LLM {
    constructor(modelId?: string, apiKey?: string) {
        const config = getProviderConfig("openai");
        if (!config) {
            throw new Error("OpenAI provider config not found");
        }
        super(config, modelId, apiKey);
    }
    
    async generateSimilarPrompts(currentPrompt: string, similarityText: string, temp: number): Promise<string[]> {
        const provider = this.getProvider();
        const model = provider(this.modelId);
        
        const promptText = `Here is a test input to a model: ${currentPrompt} Generate 10 similar inputs, in the format of a js list. By similar, I mean: ${similarityText}`;
        
        const { text } = await generateText({
            model,
            messages: [
                { role: 'system', content: 'You are a helpful assistant. Generate exactly 10 similar prompts in JavaScript array format like ["prompt1", "prompt2", ...].' },
                { role: 'user', content: promptText },
            ],
            temperature: temp,
        });
        
        // Parse the JavaScript array from the response
        try {
            // Extract array content from the response
            const arrayMatch = text.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                const arrayString = arrayMatch[0];
                return JSON.parse(arrayString);
            } else {
                // Fallback: try to parse the entire response as JSON
                return JSON.parse(text);
            }
        } catch (error) {
            console.error('Error parsing similar prompts:', error);
            // Fallback: split by newlines and clean up
            return text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith(']'))
                .slice(0, 10);
        }
    }
}
