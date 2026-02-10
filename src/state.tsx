import { makeAutoObservable, action, reaction } from "mobx";
import { examples } from "./cached_examples";
import * as color_utils from "./color_utils";
import * as d3 from 'd3';
import { createLLM } from "./llm/factory";
import { getDefaultModelFamily, getDefaultModel } from "./llm/config";
import { LLM } from "./llm/base";
import { OpenAILLM } from "./llm/openai";
import { telemetry } from "./telemetry";
import { urlParams, URLParam, type TokenizeMode } from "./url_params_manager";


const DEFAULT_NUM_GENERATIONS = 10;
const DEFAULT_TEMP = 0.7;
// Opacity for prompt container background colors (0.0 = transparent, 1.0 = opaque)
const PROMPT_COLOR_OPACITY = 0.3;


// MILLER_STONE_COLORS color scale for prompt containers with reduced opacity
// Maps each color to a semi-transparent version using D3's color manipulation
const PROMPT_COLOR_SCALE = color_utils.MILLER_STONE_COLORS.map(c => d3.color(c)?.copy({opacity:PROMPT_COLOR_OPACITY}).formatHex8() || 'black');

interface Prompt {
    text: string;
    temp: number;
    modelFamily: string;
    model: string;
}

class State {
    loading = false;
    // Unified prompt list; no special first prompt
    prompts: Prompt[] = [];
    numGenerations: number = DEFAULT_NUM_GENERATIONS;
    shuffle: boolean = false;
    tokenizeMode: TokenizeMode = "space";
    isUserStudy: boolean = false;
    visType: 'graph' | 'raw_outputs' | 'first_output' | 'word_tree' | 'highlights' = 'graph';
    generationsCache: { [example: string]: { [temp: number]: { [modelFamily: string]: { [model: string]: string[] } } } } = {};
    // Track which prompts are disabled
    disabledPrompts: number[] = [];
    // Track failed fetch attempts to prevent infinite retries
    failedFetches: Set<string> = new Set();
    
    // Global model selection state (for new prompts)
    selectedModelFamily: string = getDefaultModelFamily();
    selectedModel: string = getDefaultModel(getDefaultModelFamily());
    private llmInstanceCache: { [key: string]: LLM } = {};

    // Get color for a prompt index, cycling through the color scale
    // Uses modulo to cycle through colors when there are more prompts than colors
    getPromptColor = (index: number): string => {
        return PROMPT_COLOR_SCALE[index % PROMPT_COLOR_SCALE.length];
    };

    constructor() {
        makeAutoObservable(this);

        // Parse URL parameters using URLParamsManager
        this.isUserStudy = urlParams.getBoolean(URLParam.IS_USER_STUDY);
        
        // Initialize numGenerations from URL parameter
        const urlNumGenerations = urlParams.getInt(URLParam.NUM_GENERATIONS);
        if (urlNumGenerations !== null) {
            this.numGenerations = urlNumGenerations;
        }
        
        // Initialize visType from URL parameter
        const urlVisType = urlParams.getVisType();
        if (urlVisType) {
            this.visType = urlVisType;
        }

        // Initialize tokenizeMode from URL parameter
        const urlTokenizeMode = urlParams.getTokenizeMode();
        if (urlTokenizeMode) {
            this.tokenizeMode = urlTokenizeMode;
        }

        // Initialize the cache with the examples using the default temperature and model
        const temp = DEFAULT_TEMP;
        const defaultModelFamily = getDefaultModelFamily();
        const defaultModel = getDefaultModel(defaultModelFamily);
        
        for (const [example, outputs] of Object.entries(examples)) {
            this.generationsCache[example] ??= {};
            this.generationsCache[example][temp] ??= {};
            this.generationsCache[example][temp][defaultModelFamily] ??= {};
            this.generationsCache[example][temp][defaultModelFamily][defaultModel] = outputs;
        }
        
        // Parse prompt_idx URL parameter to select specific prompts
        const indices = urlParams.getPromptIndices();
        const exampleKeys = Object.keys(examples);
        
        if (indices.length > 0) {
            // Initialize prompts based on the provided indices
            const validPrompts = indices
                .filter(idx => idx >= 0 && idx < exampleKeys.length) // Only valid indices
                .map(idx => ({
                    text: exampleKeys[idx],
                    temp: DEFAULT_TEMP,
                    modelFamily: defaultModelFamily,
                    model: defaultModel
                }));
            
            // If no valid indices were found, fall back to default
            if (validPrompts.length === 0) {
                console.warn(`Invalid prompt_idx parameter. Using default prompt.`);
                this.prompts = [{ 
                    text: exampleKeys[0], 
                    temp: DEFAULT_TEMP, 
                    modelFamily: defaultModelFamily, 
                    model: defaultModel 
                }];
            } else {
                this.prompts = validPrompts;
            }
        } else {
            // No prompt_idx parameter, use default prompt (first example)
            this.prompts = [{ 
                text: exampleKeys[0], 
                temp: DEFAULT_TEMP, 
                modelFamily: defaultModelFamily, 
                model: defaultModel 
            }];
        }

        // Set up reactions to sync state changes to URL
        this.setupURLSync();
    }

    /**
     * Set up MobX reactions to automatically sync state changes to URL
     */
    private setupURLSync() {
        // Sync prompt changes to URL
        reaction(
            () => this.prompts.map(p => p.text),
            (promptTexts) => {
                // Find indices of current prompts in examples
                const exampleKeys = Object.keys(examples);
                const indices = promptTexts
                    .map(text => exampleKeys.indexOf(text))
                    .filter(idx => idx >= 0);
                
                if (indices.length > 0) {
                    urlParams.setPromptIndices(indices);
                }
            }
        );

        // Sync visType changes to URL
        reaction(
            () => this.visType,
            (visType) => {
                urlParams.set(URLParam.VIS_TYPE, visType);
            }
        );

        // Sync tokenizeMode changes to URL
        reaction(
            () => this.tokenizeMode,
            (tokenizeMode) => {
                urlParams.set(URLParam.TOKENIZE_MODE, tokenizeMode);
            }
        );

        // Sync numGenerations changes to URL
        reaction(
            () => this.numGenerations,
            (numGenerations) => {
                urlParams.set(URLParam.NUM_GENERATIONS, numGenerations);
            }
        );
    }

    addPrompt = ((value: string = '') => {
        const last = this.prompts[this.prompts.length - 1];
        const defaultText = value || last?.text || '';
        const defaultTemp = last?.temp ?? DEFAULT_TEMP;
        const defaultModelFamily = last?.modelFamily ?? this.selectedModelFamily;
        const defaultModel = last?.model ?? this.selectedModel;
        const newIndex = this.prompts.length;
        this.prompts = [...this.prompts, { 
            text: defaultText, 
            temp: defaultTemp, 
            modelFamily: defaultModelFamily, 
            model: defaultModel 
        }];
        // Log telemetry for adding a prompt
        telemetry.logPromptAdd(newIndex, defaultText);
    });

    updatePromptTextAt = ((index: number, value: string) => {
        const next = [...this.prompts];
        next[index] = { ...next[index], text: value };
        this.prompts = next;
    });

    updatePromptTempAt = ((index: number, value: number) => {
        const next = [...this.prompts];
        next[index] = { ...next[index], temp: value };
        this.prompts = next;
    });

    updatePromptModelFamilyAt = ((index: number, value: string) => {
        const next = [...this.prompts];
        // Clear failed fetch for old configuration before changing
        this.clearFailedFetchForPrompt(next[index]);
        
        next[index] = { ...next[index], modelFamily: value };
        // Reset to default model for the new family
        next[index] = { ...next[index], model: getDefaultModel(value) };
        this.prompts = next;
    });

    updatePromptModelAt = ((index: number, value: string) => {
        const next = [...this.prompts];
        // Clear failed fetch for old configuration before changing
        this.clearFailedFetchForPrompt(next[index]);
        
        next[index] = { ...next[index], model: value };
        this.prompts = next;
    });

    removePromptAt = action((index: number) => {
        // Can only delete the first prompt if there are multiple prompts
        if (index === 0 && this.prompts.length <= 1) return;
        const next = [...this.prompts];
        next.splice(index, 1);
        this.prompts = next;
        
        // Update disabled array when prompt is deleted
        // Remove the deleted prompt and shift indices of subsequent prompts
        this.disabledPrompts = this.disabledPrompts
            .filter(disabledIndex => disabledIndex !== index)
            .map(disabledIndex => disabledIndex > index ? disabledIndex - 1 : disabledIndex);
    });

    togglePromptDisabled = action((index: number) => {
        // Can only disable the first prompt if there are multiple prompts
        if (index === 0 && this.prompts.length <= 1) return;
        if (this.disabledPrompts.includes(index)) {
            this.disabledPrompts = this.disabledPrompts.filter(i => i !== index);
        } else {
            this.disabledPrompts = [...this.disabledPrompts, index];
        }
    });

    isPromptDisabled = ((index: number): boolean => {
        return this.disabledPrompts.includes(index);
    });

    setNumGenerations = ((value: number) => {
        this.numGenerations = value;
    });

    setShuffle = ((value: boolean) => {
        this.shuffle = value;
    });

    setTokenizeMode = ((value: TokenizeMode) => {
        this.tokenizeMode = value;
    });

    setModelFamily = ((familyId: string) => {
        this.selectedModelFamily = familyId;
        // Reset to default model for the new family
        this.selectedModel = getDefaultModel(familyId);
    });

    setModel = ((modelId: string) => {
        this.selectedModel = modelId;
    });

    setVisType = ((visType: 'graph' | 'raw_outputs' | 'first_output' | 'word_tree' | 'highlights') => {
        this.visType = visType;
    });

    private getLLMInstance(modelFamily: string, model: string): LLM {
        const cacheKey = `${modelFamily}:${model}`;
        if (!this.llmInstanceCache[cacheKey]) {
            this.llmInstanceCache[cacheKey] = createLLM(modelFamily, model);
        }
        return this.llmInstanceCache[cacheKey];
    }

    // Clear failed fetch for a specific prompt configuration
    clearFailedFetchForPrompt = (prompt: Prompt) => {
        const fetchKey = `${prompt.text}|${prompt.temp}|${prompt.modelFamily}|${prompt.model}`;
        this.failedFetches.delete(fetchKey);
        
        // Also clear the LLM instance cache for this model so it can re-initialize with new API key
        const llmCacheKey = `${prompt.modelFamily}:${prompt.model}`;
        delete this.llmInstanceCache[llmCacheKey];
    };

    // Clear all failed fetches (useful for "retry all" functionality)
    clearAllFailedFetches = () => {
        this.failedFetches.clear();
        // Clear all LLM instances so they can re-initialize with new API keys
        this.llmInstanceCache = {};
    };


    async fetchFromLLM(promptText: string, temp: number, n: number, modelFamily: string, model: string): Promise<string[]> {
        try {
            const llm = this.getLLMInstance(modelFamily, model);
            return await llm.generateCompletions(promptText, temp, n);
        } catch (error) {
            console.error('Error fetching from LLM:', error);
            return [];
        }
    }

    async fetchGenerationsFor(promptIndex: number): Promise<string[]> {
        const prompt = this.prompts[promptIndex];
        if (!prompt) return [];
        
        const input = prompt.text;
        const temp = prompt.temp;
        const modelFamily = prompt.modelFamily;
        const model = prompt.model;
        const numGenerations = this.numGenerations;
        
        if (!input) return [];

        this.generationsCache[input] ??= {};
        this.generationsCache[input][temp] ??= {};
        this.generationsCache[input][temp][modelFamily] ??= {};
        this.generationsCache[input][temp][modelFamily][model] ??= [];

        let cached = this.generationsCache[input][temp][modelFamily][model];
        const alreadyHave = cached.length;

        if (alreadyHave >= numGenerations) {
            return cached.slice(0, numGenerations);
        }

        // Check if this fetch has already failed - if so, don't retry
        const fetchKey = `${input}|${temp}|${modelFamily}|${model}`;
        if (this.failedFetches.has(fetchKey)) {
            return cached; // Return whatever we have, even if empty
        }

        const toGenerate = numGenerations - alreadyHave;
        this.loading = true;
        const newGenerations = await this.fetchFromLLM(input, temp, toGenerate, modelFamily, model);
        
        // If we got an empty result, mark this as a failed fetch
        if (newGenerations.length === 0) {
            this.failedFetches.add(fetchKey);
        }
        
        this.generationsCache[input][temp][modelFamily][model].push(...newGenerations);
        this.loading = false;

        return this.generationsCache[input][temp][modelFamily][model].slice(0, numGenerations);
    }

    async generateSimilarPrompts(currentPrompt: string, similarityText: string, temp: number): Promise<string[]> {
        try {
            // Always use OpenAI GPT-4o for generating similar prompts for consistency
            const openaiLLM = this.getLLMInstance('openai', 'gpt-4o') as OpenAILLM;
            return await openaiLLM.generateSimilarPrompts(currentPrompt, similarityText, temp);
        } catch (error) {
            console.error('Error generating similar prompts:', error);
            return [];
        }
    }
}

export const state = new State();
