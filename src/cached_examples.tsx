import { examplesOrig } from "./cached_data/examples";
import { examplesNoveltyBench } from "./cached_data/novelty_bench";
import { examplesQalign } from "./cached_data/qalign";
import { exampleOlmoTrace } from "./cached_data/examples_olmo_trace";
import { examplesUserStudyMonsters } from "./cached_data/examples_user_study_monsters";
import { examplesUserStudyPlaces } from "./cached_data/examples_user_study_places";
import { examplesUserStudyPlaces as examplesUserStudyPlacesDuplicates} from "./cached_data/examples_user_study_duplicates";
import { examplesUserStudyMonsters as examplesUserStudyMonstersDuplicates} from "./cached_data/examples_user_study_duplicates";
import { examplesUserStudyPlaces as examplesUserStudyPlacesTemp } from "./cached_data/places_temp";
import { examplesUserStudyMonsters as examplesUserStudyMonstersTemp } from "./cached_data/monsters_temp";
import { examplesPresidents } from "./cached_data/presidents";
import { urlParams, URLParam } from "./url_params_manager";

/** Round temp to avoid float key collisions (e.g. 0.7000000000000001 -> 0.7) */
function roundTemp(t: number): number {
    return Math.round(t * 10) / 10;
}

/** Parse keys like "prompt text_temp_0.2" into { basePrompt, temp } */
function parseTempKey(key: string): { basePrompt: string; temp: number } | null {
    const match = key.match(/^(.+)_temp_([\d.]+)$/);
    if (!match) return null;
    return { basePrompt: match[1], temp: roundTemp(parseFloat(match[2])) };
}

/** Transform temp data: extract base prompts and temps, return { examples, tempCache } */
function transformTempData(
    raw: { [key: string]: string[] }
): { examples: { [key: string]: string[] }; tempCache: { [basePrompt: string]: { [temp: number]: string[] } } } {
    const tempCache: { [basePrompt: string]: { [temp: number]: string[] } } = {};
    const examples: { [key: string]: string[] } = {};
    for (const [key, outputs] of Object.entries(raw)) {
        const parsed = parseTempKey(key);
        if (!parsed) continue;
        const { basePrompt, temp } = parsed;
        tempCache[basePrompt] ??= {};
        tempCache[basePrompt][temp] = outputs;
        if (!(basePrompt in examples)) {
            examples[basePrompt] = outputs;
        }
    }
    return { examples, tempCache };
}

const placesTemp = transformTempData(examplesUserStudyPlacesTemp);
const monstersTemp = transformTempData(examplesUserStudyMonstersTemp);

const datasetMap: { [key: string]: { [key: string]: string[] } } = {
    'examples': examplesOrig,
    'novelty_bench': examplesNoveltyBench,
    'qalign': examplesQalign,
    'olmo_trace': exampleOlmoTrace,
    'presidents': examplesPresidents,
    'user_study_monsters_duplicates': examplesUserStudyMonstersDuplicates,
    'user_study_places_duplicates': examplesUserStudyPlacesDuplicates,
    'user_study_monsters': examplesUserStudyMonsters,
    'user_study_places': examplesUserStudyPlaces,
    'user_study_places_temp': placesTemp.examples,
    'user_study_monsters_temp': monstersTemp.examples,
};

const datasetParam = urlParams.get(URLParam.DATASET);

let selectedDataset: { [key: string]: string[] };
if (!datasetParam || datasetParam === '') {
    // When dataset is unset: combine all datasets into a flattened list
    const combined: { [key: string]: string[] } = {};
    for (const dsData of Object.values(datasetMap)) {
        for (const [promptKey, generations] of Object.entries(dsData)) {
            combined[promptKey] = generations;
        }
    }
    selectedDataset = combined;
} else if (!datasetMap[datasetParam]) {
    console.warn(`Unknown dataset parameter: "${datasetParam}". Defaulting to 'examples'. Available options: ${Object.keys(datasetMap).join(', ')}`);
    selectedDataset = datasetMap['examples'];
} else {
    selectedDataset = datasetMap[datasetParam];
}

export const examples = selectedDataset;

/** Temp-specific cache: basePrompt -> temp -> outputs. Populated only for temp datasets. */
export const examplesTempCache: { [basePrompt: string]: { [temp: number]: string[] } } = (() => {
    if (datasetParam === 'user_study_places_temp') return placesTemp.tempCache;
    if (datasetParam === 'user_study_monsters_temp') return monstersTemp.tempCache;
    return {};
})();