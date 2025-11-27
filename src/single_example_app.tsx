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

const DEFAULT_TEXT = Object.keys(examples)[0];

interface SingleExampleAppState {
    selectedExample: string;
    temperature: number;
    numGenerations: number;
    similarityThreshold: number;
    minOpacityThreshold: number;
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
        shuffle: state.shuffle,
        tokenizeMode: state.tokenizeMode,
    };

    handleSliderChange = (event: any, param: string) => {
        (this.state as any)[param] = parseFloat(event.target.value);
        this.setState({} as any);
    };

    handleCheckboxChange = (event: any, param: string) => {
        (this.state as any)[param] = event.target.checked;
        this.setState({} as any);
    };

    handleDropdownChange = (event: any, param: string) => {
        (this.state as any)[param] = event.target.value;
        this.setState({} as any);
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
                    <div className="controls-row">
                    <label><b>Global Controls</b></label>
                            <div className="slider-container">
                                <label>Num Gen: {this.state.numGenerations}</label>
                                <div className="tooltip">
                                    Number of Generations controls how many different responses the LLM will generate for the same prompt. More generations help visualize the diversity of possible responses.
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="50"
                                    step="1"
                                    value={this.state.numGenerations}
                                    onChange={(e) => this.handleSliderChange(e, 'numGenerations')}
                                    onMouseUp={() => state.setNumGenerations(this.state.numGenerations)}
                                />
                            </div>
                            <div className="slider-container">
                                <label>Similarity Threshold: {this.state.similarityThreshold.toFixed(1)}</label>
                                <div className="tooltip">
                                    Similarity Threshold controls how similar words need to be to be merged in the graph. Lower values merge more words together, higher values keep more words separate.
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={this.state.similarityThreshold}
                                    onChange={(e) => this.handleSliderChange(e, 'similarityThreshold')}
                                    onMouseUp={() => state.setSimilarityThreshold(this.state.similarityThreshold)}
                                />
                            </div>
                            <div className="slider-container">
                                <label>Hide Longtail Outputs</label>
                                <div className="tooltip">
                                    Controls the minimum opacity for nodes and edges. Higher values hide less frequent outputs (longtail outputs).
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={this.state.minOpacityThreshold}
                                    onChange={(e) => this.handleSliderChange(e, 'minOpacityThreshold')}
                                    onMouseUp={() => state.setMinOpacityThreshold(this.state.minOpacityThreshold)}
                                />
                            </div>
                            <div className="slider-container">
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
                
                <div className="add-prompt-container" onClick={() => state.addPrompt('')}>
                    <div className="controls-row" style={{ width: 'fit-content' }}>
                        <div className='input-header'>
                            <span className="material-icons">add</span>
                        </div>
                    </div>
                </div>
                {state.loading ? this.renderLoading() : <SingleExample />}
            </div>
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
