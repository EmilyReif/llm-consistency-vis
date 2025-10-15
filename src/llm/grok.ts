import { createXai } from '@ai-sdk/xai';
import { generateText } from "ai";
import { LLM } from "./base";
import * as utils from "../utils";

export interface GrokModel {
    id: string;
    name: string;
    family: string;
}

export const GROK_MODELS: GrokModel[] = [
    { id: "grok-3", name: "Grok 3", family: "Grok" },
    // { id: "grok-vision-beta", name: "Grok Vision Beta", family: "Grok" },
];

export class GrokLLM extends LLM {
    private provider: ReturnType<typeof createXai> | null = null;
    private modelId: string;
    
    constructor(modelId: string = "grok-beta", apiKey?: string) {
        super(apiKey);
        this.modelId = modelId;
    }
    
    setModel(modelId: string) {
        this.modelId = modelId;
        // Reset provider to ensure it uses the new model
        this.provider = null;
    }
    
    private getProvider(): ReturnType<typeof createXai> {
        if (!this.provider) {
            const apiKey = this.getApiKey('grok_api_key', 'Please enter your xAI API key:');
            if (!apiKey) {
                throw new Error('xAI API key is required');
            }
            
            this.provider = createXai({
                apiKey: apiKey.trim(),
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
        
        console.log('Calling Grok API via Vercel AI SDK', promptText, temp, n, 'with model:', this.modelId);

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
}

