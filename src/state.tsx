import { makeAutoObservable, action } from "mobx";
import { examples } from "./cached_examples";
import * as utils from "./utils";
import { OpenAI } from "openai";

const DEFAULT_NUM_GENERATIONS = 30;
const DEFAULT_TEMP = 0.7;
// For some demo, use hardcoded key
const OPENAI_API_KEY = null;
class State {
    loading = false;
    selectedExample: string = '';
    temp: number = DEFAULT_TEMP;
    numGenerations: number = DEFAULT_NUM_GENERATIONS;
    generationsCache: { [example: string]: { [temp: number]: string[] } } = {};

    constructor() {
        makeAutoObservable(this);

        // Initialize the cache with the examples.
        const temp = 0.7;
        for (const [example, outputs] of Object.entries(examples)) {
            this.generationsCache[example] ??= {};
            this.generationsCache[example][temp] = outputs;
        }
    }

    setSelectedExample = ((value: string) => {
        this.selectedExample = value;
    });

    setTemp = ((value: number) => {
        this.temp = value;
    });

    setNumGenerations = ((value: number) => {
        this.numGenerations = value;
    });


    async fetchFromOpenAI(n: number): Promise<string[]> {
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

        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'You are a helpful assistant. Answer in at most one short sentence.' },
                { role: 'user', content: this.selectedExample },
            ],
            temperature: this.temp,
            n: n,
        });

        return response.choices.map((choice) => choice.message.content || '');
    }

    async fetchGenerations(): Promise<string[]> {
        const input = this.selectedExample;
        const numGenerations = this.numGenerations;
        if (!input) return [];

        this.generationsCache[input] ??= {};
        this.generationsCache[input][this.temp] ??= [];

        let cached = this.generationsCache[input][this.temp];
        const alreadyHave = cached.length;

        if (alreadyHave >= numGenerations) {
            return cached.slice(0, numGenerations);
        }

        const toGenerate = numGenerations - alreadyHave;
        this.loading = true;
        const newGenerations = await this.fetchFromOpenAI(toGenerate);
        this.generationsCache[input][this.temp].push(...newGenerations);
        this.loading = false;

        return this.generationsCache[input][this.temp].slice(0, numGenerations);
    }

    async generateSimilarPrompts(currentPrompt: string, similarityText: string): Promise<string[]> {
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
            temperature: this.temp,
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
