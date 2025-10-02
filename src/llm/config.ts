import { OpenAIModel, OPENAI_MODELS } from "./openai";

export interface ModelFamily {
    id: string;
    name: string;
    models: Model[];
}

export interface Model {
    id: string;
    name: string;
    family: string;
}

export const MODEL_FAMILIES: ModelFamily[] = [
    {
        id: "openai",
        name: "OpenAI",
        models: OPENAI_MODELS
    }
    // Future model families can be added here:
    // {
    //     id: "anthropic",
    //     name: "Anthropic",
    //     models: ANTHROPIC_MODELS
    // },
    // {
    //     id: "google",
    //     name: "Google",
    //     models: GOOGLE_MODELS
    // }
];

export function getModelsForFamily(familyId: string): Model[] {
    const family = MODEL_FAMILIES.find(f => f.id === familyId);
    return family ? family.models : [];
}

export function getDefaultModelFamily(): string {
    return MODEL_FAMILIES[0]?.id || "openai";
}

export function getDefaultModel(familyId: string): string {
    const models = getModelsForFamily(familyId);
    return models[0]?.id || "gpt-4o";
}
