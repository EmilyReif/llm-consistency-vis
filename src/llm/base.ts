// Base LLM class that all model families will extend
export abstract class LLM {
    protected apiKey: string | null = null;
    
    constructor(apiKey?: string) {
        this.apiKey = apiKey || null;
    }
    
    // Abstract methods that must be implemented by each model family
    abstract generateCompletions(promptText: string, temp: number, n: number): Promise<string[]>;
    abstract generateSimilarPrompts(currentPrompt: string, similarityText: string, temp: number): Promise<string[]>;
    
    // Common method to get API key with fallback to prompt
    protected getApiKey(paramName: string, promptMessage: string): string | null {
        // This will be implemented by importing utils in the concrete classes
        // since we can't import utils in the base class due to circular dependencies
        throw new Error("getApiKey must be implemented by concrete classes");
    }
    
    // Common method to validate API key
    protected validateApiKey(apiKey: string | null): boolean {
        return apiKey !== null && apiKey.trim().length > 0;
    }
}
