import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from '@ai-sdk/xai';
import { createAnthropic } from '@ai-sdk/anthropic';

export interface Model {
    id: string;
    name: string;
    family: string;
}

export interface ProviderConfig {
    id: string;
    name: string;
    createProvider: (apiKey: string) => any;
    defaultModel: string;
    models: Model[];
}

export const PROVIDERS: ProviderConfig[] = [
    {
        id: "openai",
        name: "OpenAI",
        createProvider: (apiKey: string) => createOpenAI({ apiKey }),
        defaultModel: "gpt-4o",
        models: [
            { id: "gpt-4o", name: "GPT-4o", family: "GPT-4" },
            { id: "gpt-4o-mini", name: "GPT-4o Mini", family: "GPT-4" },
            { id: "gpt-4-turbo", name: "GPT-4 Turbo", family: "GPT-4" },
            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", family: "GPT-3.5" },
        ]
    },
    {
        id: "grok",
        name: "xAI",
        createProvider: (apiKey: string) => createXai({ apiKey }),
        defaultModel: "grok-beta",
        models: [
            { id: "grok-4-fast-reasoning", name: "Grok 4 Fast Reasoning", family: "Grok" },
            { id: "grok-4-fast-non-reasoning", name: "Grok 4 Fast Non-Reasoning", family: "Grok" },
            { id: "grok-3", name: "Grok 3", family: "Grok" },
            { id: "grok-3-mini", name: "Grok 3 Mini", family: "Grok" },
        ]
    },
    {
        id: "anthropic",
        name: "Anthropic",
        createProvider: (apiKey: string) => createAnthropic({ apiKey }),
        defaultModel: "claude-sonnet-4-0",
        models: [
            { id: "claude-opus-4-1", name: "Claude Opus 4.1", family: "Claude" },
            { id: "claude-opus-4-0", name: "Claude Opus 4.0", family: "Claude" },
            { id: "claude-sonnet-4-0", name: "Claude Sonnet 4.0", family: "Claude" },
            { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet", family: "Claude" },
            { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", family: "Claude" },
        ]
    }
    // Future providers can be added here - just add a new config object!
];

// Legacy interface for backward compatibility
export interface ModelFamily {
    id: string;
    name: string;
    models: Model[];
}

// Legacy export for backward compatibility
export const MODEL_FAMILIES: ModelFamily[] = PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    models: p.models
}));

export function getProviderConfig(providerId: string): ProviderConfig | undefined {
    return PROVIDERS.find(p => p.id === providerId);
}

export function getModelsForFamily(familyId: string): Model[] {
    const provider = PROVIDERS.find(p => p.id === familyId);
    return provider ? provider.models : [];
}

export function getDefaultModelFamily(): string {
    return PROVIDERS[0]?.id || "openai";
}

export function getDefaultModel(familyId: string): string {
    const provider = PROVIDERS.find(p => p.id === familyId);
    return provider?.defaultModel || "gpt-4o";
}
