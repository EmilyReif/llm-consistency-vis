import { makeAutoObservable, action } from "mobx";
import { examples } from "./cached_examples";
import * as utils from "./utils";
import * as color_utils from "./color_utils";
import { OpenAI } from "openai";
import * as d3 from 'd3';


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

class State {
    loading = false;
    // Unified prompt list; no special first prompt
    prompts: { text: string, temp: number }[] = [];
    numGenerations: number = DEFAULT_NUM_GENERATIONS;
    similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD;
    generationsCache: { [example: string]: { [temp: number]: string[] } } = {};
    // Track which prompts are disabled
    disabledPrompts: number[] = [];

    // Get color for a prompt index, cycling through the color scale
    // Uses modulo to cycle through colors when there are more prompts than colors
    getPromptColor = (index: number): string => {
        return PROMPT_COLOR_SCALE[index % PROMPT_COLOR_SCALE.length];
    };

    constructor() {
        makeAutoObservable(this);

        // Initialize the cache with the examples using the default temperature
        const temp = DEFAULT_TEMP;
        for (const [example, outputs] of Object.entries(examples)) {
            this.generationsCache[example] ??= {};
            this.generationsCache[example][temp] = outputs;
        }
        // Initialize with a default prompt using the first available example
        const first = Object.keys(examples)[0];
        this.prompts = [{ text: first, temp: DEFAULT_TEMP }];
    }

    addPrompt = ((value: string = '') => {
        const last = this.prompts[this.prompts.length - 1];
        const defaultText = value || last?.text || '';
        const defaultTemp = last?.temp ?? DEFAULT_TEMP;
        this.prompts = [...this.prompts, { text: defaultText, temp: defaultTemp }];
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


    async fetchFromOpenAI(promptText: string, temp: number, n: number): Promise<string[]> {
        let openai_api_key = utils.parseUrlParam('openai_api_key') || OPENAI_API_KEY;

        if (!openai_api_key) {
            openai_api_key = prompt('Please enter your OpenAI API key:') || '';
            utils.setUrlParam('openai_api_key', openai_api_key);
        }

        if (!openai_api_key) {
            console.warn('No API key provided. Skipping OpenAI fetch.');
            return [];
        }
        const openaiClient = new OpenAI({
            apiKey: openai_api_key.trim(),
            dangerouslyAllowBrowser: true,
        });
        console.log('Calling OpenAI api', promptText, temp, n);
        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'You are a helpful assistant. Answer in at most one short sentence.' },
                { role: 'user', content: promptText },
            ],
            temperature: temp,
            n: n,
        });

        return response.choices.map((choice) => choice.message.content || '');
    }

    async fetchGenerationsFor(prompt: string, temp: number): Promise<string[]> {
        const input = prompt;
        const numGenerations = this.numGenerations;
        if (!input) return [];

        this.generationsCache[input] ??= {};
        this.generationsCache[input][temp] ??= [];

        let cached = this.generationsCache[input][temp];
        const alreadyHave = cached.length;

        if (alreadyHave >= numGenerations) {
            return cached.slice(0, numGenerations);
        }

        const toGenerate = numGenerations - alreadyHave;
        this.loading = true;
        const newGenerations = await this.fetchFromOpenAI(input, temp, toGenerate);
        this.generationsCache[input][temp].push(...newGenerations);
        this.loading = false;

        return this.generationsCache[input][temp].slice(0, numGenerations);
    }

    async generateSimilarPrompts(currentPrompt: string, similarityText: string, temp: number): Promise<string[]> {
        let openai_api_key = utils.parseUrlParam('openai_api_key') || OPENAI_API_KEY;

        if (!openai_api_key) {
            openai_api_key = prompt('Please enter your OpenAI API key:') || '';
            utils.setUrlParam('openai_api_key', openai_api_key);
        }

        if (!openai_api_key) {
            console.warn('No API key provided. Skipping OpenAI fetch.');
            return [];
        }

        const openaiClient = new OpenAI({
            apiKey: openai_api_key.trim(),
            dangerouslyAllowBrowser: true,
        });

        const promptText = `Here is a test input to a model: ${currentPrompt} Generate 10 similar inputs, in the format of a js list. By similar, I mean: ${similarityText}`;

        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'You are a helpful assistant. Generate exactly 10 similar prompts in JavaScript array format like ["prompt1", "prompt2", ...].' },
                { role: 'user', content: promptText },
            ],
            temperature: temp,
            n: 1,
        });

        const content = response.choices[0]?.message?.content || '';
        
        // Parse the JavaScript array from the response
        try {
            // Extract array content from the response
            const arrayMatch = content.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                const arrayString = arrayMatch[0];
                return JSON.parse(arrayString);
            } else {
                // Fallback: try to parse the entire response as JSON
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('Error parsing similar prompts:', error);
            // Fallback: split by newlines and clean up
            return content.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith(']'))
                .slice(0, 10);
        }
    }
}

export const state = new State();
