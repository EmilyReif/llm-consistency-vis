import React from "react";
import './single_example.css';
import { observer } from "mobx-react";
import { state } from "./state"; // Import your MobX store
import SingleExample from './single_example';
import './single_example_app.css'
import './loading.css'
import { examples } from "./cached_examples";

const DEFAULT_TEXT = Object.keys(examples)[0];
class SingleExampleApp extends React.Component {
    state = { 
        selectedExample: DEFAULT_TEXT, 
        temperature: state.temp, 
        numGenerations: state.numGenerations,
    };

    handleDropdownChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        this.setState({ 
            selectedExample: event.target.value,
        });
        state.setSelectedExample(event.target.value);
    }

    handleSliderChange = (event: any, param: string) => {
        this.setState({ [param]: parseFloat(event.target.value) });
    }

    handleInputChange = (event: any) => {
        this.setState({ selectedExample: event.target.value });
    }

    handleSubmit = () => {
        console.log('submit');
        state.setTemp(this.state.temperature);
        state.setNumGenerations(this.state.numGenerations);
        state.selectedExample = this.state.selectedExample;
    }

    handleKeyPress = (event: any) => {
        if (event.key === 'Enter') {
            this.handleSubmit();
        }
    }

    render() {
        return (
            <div className='single-input-holder'>
            <div className='controls'>
                <div className='input-section'>
                    <div className="option-row">
                        <div className='input-header'>Option 1: Prompt</div>
                        <div className="input-box">
                            <div className="input-with-hint">
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Enter LLM prompt"
                                    onChange={this.handleInputChange}
                                    onKeyPress={this.handleKeyPress}
                                />
                                <span className="enter-hint">⏎ Enter</span>
                            </div>
                        </div>

                        <div className="sliders">
                            <div className="slider-container">
                                <label>Temp: {this.state.temperature}</label>
                                <div className="tooltip">
                                        Temperature controls randomness in LLM outputs. Higher values (near 1) create more diverse but less focused responses, while lower values produce more deterministic, conservative results.                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={this.state.temperature}
                                    onChange={(e) => this.handleSliderChange(e, 'temperature')}
                                    onMouseUp={() => this.handleSubmit()}
                                />
                            </div>

                            <div className="slider-container">
                                <label>Num Gen: {this.state.numGenerations}</label>
                                <div className="tooltip">
                                    Number of Generations controls how many different responses the LLM will generate for the same prompt. More generations help visualize the diversity of possible responses.
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="30"
                                    step="1"
                                    value={this.state.numGenerations}
                                    onChange={(e) => this.handleSliderChange(e, 'numGenerations')}
                                    onMouseUp={() => this.handleSubmit()}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className='input-section'>
                    <div className='input-header'>Option 2: Select a pre-generated prompt</div>
                    <select
                        className="custom-dropdown"
                        value={this.state.selectedExample}
                        onChange={this.handleDropdownChange}
                    >
                        <option value="" disabled>Select a precached prompt</option>
                        {Object.keys(examples).map((example) => (
                            <option key={example} value={example}>
                                {example}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {state.loading ? this.renderLoading() : <SingleExample></SingleExample>}
        </div>
        );
    }

    renderLoading() {
        return (<span className="loader"></span>)
    }

    async componentDidMount() {
        state.selectedExample = DEFAULT_TEXT;
    }
}

export default observer(SingleExampleApp);