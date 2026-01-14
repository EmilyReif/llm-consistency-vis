
import { env } from '@huggingface/transformers';

// Always remote
env.allowRemoteModels = true;
env.allowLocalModels = false;

// IMPORTANT: many versions expect `{file}` in the template
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/main/';
