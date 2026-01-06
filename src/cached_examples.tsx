import { examplesOrig } from "./cached_data/examples";
import { examplesNoveltyBench } from "./cached_data/novelty_bench";
import { examplesQalign } from "./cached_data/qalign";
import { exampleOlmoTrace } from "./cached_data/examples_olmo_trace";
import { examplesUserStudyMonsters } from "./cached_data/examples_user_study_monsters";
import { examplesUserStudyPlaces } from "./cached_data/examples_user_study_places";
import { examplesPresidents } from "./cached_data/presidents";
import { parseUrlParam } from "./utils";

const datasetMap: { [key: string]: { [key: string]: string[] } } = {
    'examples': examplesOrig,
    'novelty_bench': examplesNoveltyBench,
    'qalign': examplesQalign,
    'olmo_trace': exampleOlmoTrace,
    'user_study_monsters': examplesUserStudyMonsters,
    'user_study_places': examplesUserStudyPlaces,
    'presidents': examplesPresidents,
};

const datasetParam = parseUrlParam('dataset') || 'examples';
if (datasetParam && !datasetMap[datasetParam]) {
    console.warn(`Unknown dataset parameter: "${datasetParam}". Defaulting to 'examples'. Available options: ${Object.keys(datasetMap).join(', ')}`);
}
const selectedDataset = datasetMap[datasetParam] || datasetMap['examples'];

export const examples = selectedDataset;