import { examplesOrig } from "./cached_data/examples";
import { examplesNoveltyBench } from "./cached_data/novelty_bench";
import { examplesQalign } from "./cached_data/qalign";
import { exampleOlmoTrace } from "./cached_data/examples_olmo_trace";
import { examplesUserStudyMonsters } from "./cached_data/examples_user_study_monsters";
import { examplesUserStudyPlaces } from "./cached_data/examples_user_study_places";
import { examplesUserStudyPlaces as examplesUserStudyPlacesDuplicates} from "./cached_data/examples_user_study_duplicates";
import { examplesUserStudyMonsters as examplesUserStudyMonstersDuplicates} from "./cached_data/examples_user_study_duplicates";
import { examplesPresidents } from "./cached_data/presidents";
import { urlParams, URLParam } from "./url_params_manager";

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