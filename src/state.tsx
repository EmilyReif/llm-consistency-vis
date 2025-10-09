import { makeAutoObservable, action } from "mobx";
import { examples } from "./cached_examples";
import * as utils from "./utils";
import * as color_utils from "./color_utils";
import * as d3 from 'd3';
import { createLLM } from "./llm/factory";
import { MODEL_FAMILIES, getDefaultModelFamily, getDefaultModel, getModelsForFamily } from "./llm/config";
import { LLM } from "./llm/base";
import { TokenizeMode } from "./utils";


const DEFAULT_NUM_GENERATIONS = 30;
const DEFAULT_TEMP = 0.7;
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;
// Opacity for prompt container background colors (0.0 = transparent, 1.0 = opaque)
const PROMPT_COLOR_OPACITY = 0.3;
// For some demo, use hardcoded key
const OPENAI_API_KEY = null;


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
    similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD;
    shuffle: boolean = false;
    tokenizeMode: TokenizeMode = "space";
    generationsCache: { [example: string]: { [temp: number]: { [modelFamily: string]: { [model: string]: string[] } } } } = {};
    // Track which prompts are disabled
    disabledPrompts: number[] = [];
    
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
        
        // Initialize with a default prompt using the first available example
        const first = Object.keys(examples)[0];
        this.prompts = [{ 
            text: first, 
            temp: DEFAULT_TEMP, 
            modelFamily: defaultModelFamily, 
            model: defaultModel 
        }];
    }

    addPrompt = ((value: string = '') => {
        const last = this.prompts[this.prompts.length - 1];
        const defaultText = value || last?.text || '';
        const defaultTemp = last?.temp ?? DEFAULT_TEMP;
        const defaultModelFamily = last?.modelFamily ?? this.selectedModelFamily;
        const defaultModel = last?.model ?? this.selectedModel;
        this.prompts = [...this.prompts, { 
            text: defaultText, 
            temp: defaultTemp, 
            modelFamily: defaultModelFamily, 
            model: defaultModel 
        }];
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
        next[index] = { ...next[index], modelFamily: value };
        // Reset to default model for the new family
        next[index] = { ...next[index], model: getDefaultModel(value) };
        this.prompts = next;
    });

    updatePromptModelAt = ((index: number, value: string) => {
        const next = [...this.prompts];
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

    setSimilarityThreshold = ((value: number) => {
        this.similarityThreshold = value;
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

    private getLLMInstance(modelFamily: string, model: string): LLM {
        const cacheKey = `${modelFamily}:${model}`;
        if (!this.llmInstanceCache[cacheKey]) {
            this.llmInstanceCache[cacheKey] = createLLM(modelFamily, model);
        }
        return this.llmInstanceCache[cacheKey];
    }


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

        const toGenerate = numGenerations - alreadyHave;
        this.loading = true;
        const newGenerations = await this.fetchFromLLM(input, temp, toGenerate, modelFamily, model);
        this.generationsCache[input][temp][modelFamily][model].push(...newGenerations);
        this.loading = false;

        return this.generationsCache[input][temp][modelFamily][model].slice(0, numGenerations);
    }

    async generateSimilarPrompts(currentPrompt: string, similarityText: string, temp: number): Promise<string[]> {
        try {
            // Always use GPT-4o for generating similar prompts for consistency
            const defaultModelFamily = getDefaultModelFamily();
            const defaultModel = getDefaultModel(defaultModelFamily);
            
            const llm = this.getLLMInstance(defaultModelFamily, defaultModel);
            return await llm.generateSimilarPrompts(currentPrompt, similarityText, temp);
        } catch (error) {
            console.error('Error generating similar prompts:', error);
            return [];
        }
    }
}

export const state = new State();
