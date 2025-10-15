import { generateText } from "ai";
import * as utils from "../utils";
import { ProviderConfig } from "./config";

// LLM class that works with any provider via configuration
export class LLM {
    protected apiKey: string | null = null;
    protected modelId: string;
    protected provider: any = null;
    protected config: ProviderConfig;
    
    constructor(config: ProviderConfig, modelId?: string, apiKey?: string) {
        this.config = config;
        this.apiKey = apiKey || null;
        this.modelId = modelId || config.defaultModel;
    }
    
    // Common method to set the model
    setModel(modelId: string) {
        this.modelId = modelId;
        // Reset provider to ensure it uses the new model
        this.provider = null;
    }
    
    // Common method to get API key with fallback to prompt
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
    
    // Get or create provider instance
    protected getProvider(): any {
        if (!this.provider) {
            const providerName = this.config.name;
            const paramName = `${providerName.toLowerCase().replace(/\s+/g, '_')}_api_key`;
            const promptMessage = `Please enter your ${providerName} API key:`;
            const apiKey = this.getApiKey(paramName, promptMessage);
            if (!apiKey) {
                throw new Error(`${providerName} API key is required`);
            }
            
            this.provider = this.config.createProvider(apiKey.trim());
        }
        return this.provider;
    }
    
    // Generate completions using the configured provider
    async generateCompletions(
        promptText: string, 
        temp: number, 
        n: number
    ): Promise<string[]> {
        try {
            const provider = this.getProvider();
            const model = provider(this.modelId);
            const providerName = this.config.name;
            
            console.log(`Calling ${providerName} API via Vercel AI SDK`, promptText, temp, n, 'with model:', this.modelId);

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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error generating completions with ${this.config.name}:`, error);
            alert(`Error calling ${this.config.name} API: ${errorMessage}\n\nPlease check your API key and model selection, then try again.`);
            return [];
        }
    }
    
    // Common method to validate API key
    protected validateApiKey(apiKey: string | null): boolean {
        return apiKey !== null && apiKey.trim().length > 0;
    }
}
