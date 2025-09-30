import React from "react";
import './single_example.css';
import { observer } from "mobx-react";
import { state } from "./state"; // Import your MobX store
import SingleExample from './single_example';
import PromptContainer from './PromptContainer';
import './single_example_app.css'
import './loading.css'
import { examples } from "./cached_examples";

const DEFAULT_TEXT = Object.keys(examples)[0];

interface SingleExampleAppState {
    selectedExample: string;
    temperature: number;
    numGenerations: number;
}

class SingleExampleApp extends React.Component<{}, SingleExampleAppState> {
    state: SingleExampleAppState = {
        selectedExample: DEFAULT_TEXT,
        temperature: state.prompts[0]?.temp ?? 0.7,
        numGenerations: state.numGenerations,
    };

    handleSliderChange = (event: any, param: string) => {
        (this.state as any)[param] = parseFloat(event.target.value);
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
        state.fetchGenerationsFor(prompt, state.prompts[0]?.temp ?? 0.7);
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
                    </div>
                </div>
                {state.prompts.map((p, idx) => (
                    <PromptContainer
                        key={'prompt-' + idx}
                        promptIndex={idx}
                        prompt={p}
                        onUpdateText={state.updatePromptTextAt}
                        onUpdateTemp={state.updatePromptTempAt}
                        onDelete={state.removePromptAt}
                        onToggleDisabled={state.togglePromptDisabled}
                        isDisabled={state.isPromptDisabled(idx)}
                        totalPrompts={state.prompts.length}
                    />
                ))}
                
                <div className="add-prompt-container" onClick={() => state.addPrompt('')}>
                    <div className="controls-row" style={{ width: 'fit-content' }}>
                        <div className='input-header'
                        >+</div>
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
