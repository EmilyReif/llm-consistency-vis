import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { LLM } from "./base";
import * as utils from "../utils";

export interface OpenAIModel {
    id: string;
    name: string;
    family: string;
}

export const OPENAI_MODELS: OpenAIModel[] = [
    { id: "gpt-4o", name: "GPT-4o", family: "GPT-4" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", family: "GPT-4" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", family: "GPT-4" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", family: "GPT-3.5" },
];

export class OpenAILLM extends LLM {
    private provider: ReturnType<typeof createOpenAI> | null = null;
    private modelId: string;
    
    constructor(modelId: string = "gpt-4o", apiKey?: string) {
        super(apiKey);
        this.modelId = modelId;
    }
    
    setModel(modelId: string) {
        this.modelId = modelId;
        // Reset provider to ensure it uses the new model
        this.provider = null;
    }
    
    private getProvider(): ReturnType<typeof createOpenAI> {
        if (!this.provider) {
            const apiKey = this.getApiKey('openai_api_key', 'Please enter your OpenAI API key:');
            if (!apiKey) {
                throw new Error('OpenAI API key is required');
            }
            
            this.provider = createOpenAI({
                apiKey: apiKey.trim(),
                compatibility: 'strict',
            });
        }
        return this.provider;
    }
    
    protected getApiKey(paramName: string, promptMessage: string): string | null {
        let apiKey = utils.parseUrlParam(paramName) || this.apiKey;
        
        if (!apiKey) {
            apiKey = prompt(promptMessage) || '';
            if (apiKey) {
                utils.setUrlParam(paramName, apiKey);
            }
        }
        
        return apiKey;
    }
    
    async generateCompletions(promptText: string, temp: number, n: number): Promise<string[]> {
        const provider = this.getProvider();
        const model = provider(this.modelId);
        
        console.log('Calling OpenAI API via Vercel AI SDK', promptText, temp, n, 'with model:', this.modelId);


        // Generate multiple completions in parallel
        const promises = Array.from({ length: n }, () =>
            generateText({
                model,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant. Answer in at most one short sentence.' },
                    { role: 'user', content: promptText },
                ],
                temperature: temp,
            })
        );
        
        const results = await Promise.all(promises);
        return results.map(result => result.text);
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
