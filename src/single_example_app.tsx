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

    handleSliderChange = (event: any, param: string) => {
        this.setState({ [param]: parseFloat(event.target.value) });
    };

    handleSubmit = (prompt?: string) => {
        const finalPrompt = prompt ?? this.state.selectedExample;
        this.setState({ selectedExample: finalPrompt });
        state.setTemp(this.state.temperature);
        state.setNumGenerations(this.state.numGenerations);
        state.selectedExample = finalPrompt;
    };

    render() {
        return (
            <div className='single-input-holder'>
                <div className='controls'>
                    <div className='input-header'>Prompt</div>
                    <EditableDropdown
                        value={this.state.selectedExample}
                        options={Object.keys(examples)}
                        onSubmit={this.handleSubmit}
                    />

                    <div className="sliders">
                        <div className="slider-container">
                            <label>Temp: {this.state.temperature}</label>
                            <div className="tooltip">
                                Temperature controls randomness in LLM outputs. Higher values (near 1) create more diverse but less focused responses, while lower values produce more deterministic, conservative results.
                            </div>
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
                                max="50"
                                step="1"
                                value={this.state.numGenerations}
                                onChange={(e) => this.handleSliderChange(e, 'numGenerations')}
                                onMouseUp={() => this.handleSubmit()}
                            />
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
        state.selectedExample = DEFAULT_TEXT;
    }
}

class EditableDropdown extends React.Component<any, any> {
    state = {
        open: false,
        value: this.props.value || "",
    };

    handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({ value: e.target.value });
    };

    handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            this.props.onSubmit?.(this.state.value);
            this.setState({ open: false });
        } else if (e.key === "Escape") {
            // just close dropdown, keep current value
            this.setState({ open: false });
        }
    };

    handleSelect = (option: string) => {
        this.setState({ value: option, open: false }, () => {
            this.props.onSubmit?.(option);
        });
    };

    render() {
        const { options } = this.props;
        const { open, value } = this.state;

        return (
            <div className="input-with-hint">
                <input
                    type="text"
                    className="input-field"
                    value={value}
                    placeholder="Enter or select a prompt"
                    onChange={this.handleInputChange}
                    onFocus={() => this.setState({ open: true })}
                    onKeyDown={this.handleKeyDown}
                />
                {open && (
                    <ul className="dropdown-list">
                        {options.map((opt: string) => (
                            <li
                                key={opt}
                                onClick={() => this.handleSelect(opt)}
                                title={opt}
                            >
                                {opt}
                            </li>
                        ))}
                    </ul>
                )}
                <span className="enter-hint">⏎ Enter</span>
            </div>
        );
    }
}
export default observer(SingleExampleApp);
