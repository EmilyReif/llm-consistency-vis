import React from "react";
import './single_example.css';
import { observer } from "mobx-react";
import { state } from "./state"; // Import your MobX store
import SingleExample from './single_example';
import PromptContainer from './PromptContainer';
import './single_example_app.css'
import './loading.css'
import { examples } from "./cached_examples";
import { TokenizeMode } from "./utils";
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import { telemetry, submitSession } from "./telemetry";

const DEFAULT_TEXT = Object.keys(examples)[0];
const SLIDER_WIDTH = 150;

interface SingleExampleAppState {
    selectedExample: string;
    temperature: number;
    numGenerations: number;
    similarityThreshold: number;
    minOpacityThreshold: number;
    spread: number;
    shuffle: boolean;
    tokenizeMode: TokenizeMode;
}

class SingleExampleApp extends React.Component<{}, SingleExampleAppState> {
    state: SingleExampleAppState = {
        selectedExample: DEFAULT_TEXT,
        temperature: state.prompts[0]?.temp ?? 0.7,
        numGenerations: state.numGenerations,
        similarityThreshold: state.similarityThreshold,
        minOpacityThreshold: state.minOpacityThreshold,
        spread: state.spread,
        shuffle: state.shuffle,
        tokenizeMode: state.tokenizeMode,
    };

    handleSliderChange = (value: number, param: string) => {
        (this.state as any)[param] = value;
        this.setState({} as any);
        // Log telemetry for slider changes
        telemetry.logSliderChange(param, value);
    };

    handleCheckboxChange = (event: any, param: string) => {
        (this.state as any)[param] = event.target.checked;
        this.setState({} as any);
    };

    handleDropdownChange = (event: any, param: string) => {
        (this.state as any)[param] = event.target.value;
        this.setState({} as any);
        // Log telemetry for dropdown changes
        telemetry.logDropdownChange(param, event.target.value);
    };

    handleSubmit = (prompt?: string) => {
        const finalPrompt = prompt ?? this.state.selectedExample;
        this.setState({ selectedExample: finalPrompt });
        state.updatePromptTempAt(0, this.state.temperature);
        state.setNumGenerations(this.state.numGenerations);
        state.updatePromptTextAt(0, finalPrompt);

    };


    handlePromptSelect = (prompt: string) => {
        this.setState({ selectedExample: prompt });
        state.updatePromptTextAt(0, prompt);
        // Trigger new generations without clearing the generated prompts
        state.updatePromptTempAt(0, this.state.temperature);
        state.setNumGenerations(this.state.numGenerations);
        // Fetch new generations for the selected prompt
        state.fetchGenerationsFor(0);
    };

    render() {
        return (
            <div className='single-input-holder'>
                <div className='controls'>
                        <h1 className="controls-title">
                            Visualizing LLM outputs
                            <div className="info-icon-container">
                                <div className="info-icon">?</div>
                                <div className="info-tooltip">
                                    <span className="authors">Emily Reif, Deniz Nazarova, Jared Hwang, Claire Yang</span>
                                    <p>
                                        When an LLM returns a response, we're actually sampling from a probability distribution over many possible
                                        outputs. But we usually only see one of those samples—the response that gets returned.
                                    </p>
                                    <p>
                                        If we're just using the model to get an answer or write some text, that's fine. But if we want to understand how
                                        the model behaves—or build systems that depend on it—we need more than just one response. <b>We need to understand
                                        the whole distribution of possible outputs.</b>
                                    </p>
                                </div>
                            </div>
                        </h1>
                    <div className="controls-row">
                        {/* <label><b>Global Controls</b></label> */}
                        <div className="slider-container">
                            <label>Samples: {this.state.numGenerations}</label>
                            <div className="tooltip">
                                How many different responses the LLM will generate for each prompt. More generations help visualize the diversity of possible responses.
                            </div>
                            <Box sx={{ width: SLIDER_WIDTH }}>
                                <Slider
                                    size="small"
                                    min={1}
                                    max={50}
                                    step={1}
                                    value={this.state.numGenerations}
                                    onChange={(e, value) => this.handleSliderChange(value as number, 'numGenerations')}
                                    onChangeCommitted={() => state.setNumGenerations(this.state.numGenerations)}
                                    valueLabelDisplay="auto"
                                    aria-label="Number of Generations"
                                />
                            </Box>
                        </div>

                        <div className="slider-container">
                            <label>Graph spread</label>
                            <div className="tooltip">
                                How spread out the graph is. Higher values means every output is rendered more like standard LTR text, lower values means the graph is more compact.
                            </div>
                            <Box sx={{ width: SLIDER_WIDTH }}>
                                <Slider
                                    size="small"
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    value={this.state.spread}
                                    onChange={(e, value) => this.handleSliderChange(value as number, 'spread')}
                                    onChangeCommitted={() => state.setSpread(this.state.spread)}
                                    valueLabelDisplay="off"
                                    aria-label="Graph spread"
                                />
                            </Box>
                        </div>


                        <div className="slider-container">
                            <label>Hide Rare Outputs</label>
                            <div className="tooltip">
                                How strongly rare outputs are faded. Higher values hide nodes and edges that appear infrequently across outputs.
                            </div>
                            <Box sx={{ width: SLIDER_WIDTH }}>
                                <Slider
                                    size="small"
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    value={this.state.minOpacityThreshold}
                                    onChange={(e, value) => this.handleSliderChange(value as number, 'minOpacityThreshold')}
                                    onChangeCommitted={() => state.setMinOpacityThreshold(this.state.minOpacityThreshold)}
                                    valueLabelDisplay="off"
                                    aria-label="Hide Rare Outputs"
                                />
                            </Box>
                        </div>

                        {/* <div className="slider-container">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.state.shuffle}
                                        onChange={(e) => this.handleCheckboxChange(e, 'shuffle')}
                                        onMouseUp={() => state.setShuffle(!this.state.shuffle)}
                                    />
                                    Shuffle Sentence Indices
                                </label>
                                <div className="tooltip">
                                    When enabled, shuffles the origSentIndices to randomize the visual ordering of sentence connections in the graph.
                                </div>
                            </div> */}

                        <div className="slider-container">
                            <label>Token merging threshold</label>
                            <div className="tooltip">
                                How similar words need to be to be merged in the graph. Lower values merge more words together, higher values keep more words separate.
                            </div>
                            <Box sx={{ width: SLIDER_WIDTH }}>
                                <Slider
                                    size="small"
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    value={this.state.similarityThreshold}
                                    onChange={(e, value) => this.handleSliderChange(value as number, 'similarityThreshold')}
                                    onChangeCommitted={() => state.setSimilarityThreshold(this.state.similarityThreshold)}
                                    valueLabelDisplay="auto"
                                    aria-label="Merging coefficient"
                                />
                            </Box>
                        </div>

                        <div className="dropdown-container">
                            <label>Tokenize Mode:</label>
                            <select
                                value={this.state.tokenizeMode}
                                onChange={(e) => {
                                    this.handleDropdownChange(e, 'tokenizeMode');
                                    state.setTokenizeMode(e.target.value as TokenizeMode);
                                }}
                            >
                                <option value="space">Space</option>
                                <option value="comma">Comma</option>
                                <option value="sentence">Sentence</option>
                            </select>
                        </div>
                    </div>
                </div>
                {state.prompts.map((p, idx) => (
                    <PromptContainer
                        key={'prompt-' + idx}
                        promptIndex={idx}
                        prompt={p}
                        onUpdateText={state.updatePromptTextAt}
                        onUpdateTemp={state.updatePromptTempAt}
                        onUpdateModelFamily={state.updatePromptModelFamilyAt}
                        onUpdateModel={state.updatePromptModelAt}
                        onDelete={state.removePromptAt}
                        onToggleDisabled={state.togglePromptDisabled}
                        isDisabled={state.isPromptDisabled(idx)}
                        totalPrompts={state.prompts.length}
                    />
                ))}
                <div className="add-prompt-container" onClick={() => {
                    state.addPrompt('');
                }}>
                    <div className="controls-row" style={{ width: 'fit-content' }}>
                        <div className='input-header'>
                            <span className="material-icons">add</span>
                        </div>
                    </div>
                </div>
                {state.loading ? this.renderLoading() : <SingleExample />}
                {state.isUserStudy && this.renderSubmitButton()}
            </div>
        );
    }

    handleSubmitFinalOrder = async () => {
        // Get the current prompts in order (full text only)
        const finalAnswers = state.prompts.map(p => p.text);
        const success = await submitSession(finalAnswers);
        // if (success) {
        //     alert('Thank you! Your responses have been submitted.');
        // } else {
        //     alert('There was an error submitting your responses. Please try again.');
        // }
    }

    renderSubmitButton() {
        return (
            <button
                className="submit-button"
                onClick={this.handleSubmitFinalOrder}
            >
                Submit Final Order
            </button>
        );
    }

    renderLoading() {
        return (<span className="loader"></span>)
    }

    async componentDidMount() {
        state.updatePromptTextAt(0, DEFAULT_TEXT);
    }
}

export default observer(SingleExampleApp);
