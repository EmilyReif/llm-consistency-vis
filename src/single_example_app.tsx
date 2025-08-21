import React from "react";
import './single_example.css';
import { observer } from "mobx-react";
import { state } from "./state"; // Import your MobX store
import SingleExample from './single_example';
import './single_example_app.css'
import './loading.css'
import { examples } from "./cached_examples";

const DEFAULT_TEXT = Object.keys(examples)[0];

interface SingleExampleAppState {
    selectedExample: string;
    temperature: number;
    numGenerations: number;
    similarPrompts: string[];
    generatingSimilar: boolean;
    expanded: boolean;
}

class SingleExampleApp extends React.Component<{}, SingleExampleAppState> {
    state: SingleExampleAppState = {
        selectedExample: DEFAULT_TEXT,
        temperature: state.temp,
        numGenerations: state.numGenerations,
        similarPrompts: [],
        generatingSimilar: false,
        expanded: false,
    };

    handleSliderChange = (event: any, param: string) => {
        (this.state as any)[param] = parseFloat(event.target.value);
        this.setState({} as any);
    };

    handleSubmit = (prompt?: string) => {
        const finalPrompt = prompt ?? this.state.selectedExample;
        this.setState({ selectedExample: finalPrompt });
        state.setTemp(this.state.temperature);
        state.setNumGenerations(this.state.numGenerations);
        state.selectedExample = finalPrompt;
        
        // Clear the similarity input and generated prompts when selecting a new prompt
        this.clearGeneratedPrompts();
    };

    clearGeneratedPrompts = () => {
        this.setState({ similarPrompts: [] });
        // Clear the similarity input field
        const similarityInput = document.querySelector('.similarity-input-container .input-field') as HTMLInputElement;
        if (similarityInput) {
            similarityInput.value = '';
        }
    };

    handleGenerateSimilar = async () => {
        const similarityText = (document.querySelector('.similarity-input') as HTMLInputElement)?.value || '';
        this.setState({ generatingSimilar: true, similarPrompts: [] });
        
        try {
            const similarPrompts = await state.generateSimilarPrompts(this.state.selectedExample, similarityText);
            this.setState({ similarPrompts, generatingSimilar: false });
        } catch (error) {
            console.error('Error generating similar prompts:', error);
            this.setState({ generatingSimilar: false });
        }
    };

    toggleExpanded = () => {
        this.setState(prevState => ({ expanded: !prevState.expanded }));
    };

    handlePromptSelect = (prompt: string) => {
        this.setState({ selectedExample: prompt });
        state.selectedExample = prompt;
        // Trigger new generations without clearing the generated prompts
        state.setTemp(this.state.temperature);
        state.setNumGenerations(this.state.numGenerations);
        // Fetch new generations for the selected prompt
        state.fetchGenerations();
    };

    render() {
        return (
            <div className='single-input-holder'>
                <div className='controls'>
                    <div className="controls-row">
                        <div className='input-header'>Prompt</div>
                        <EditableDropdown
                            key={this.state.selectedExample}
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

                        <div className="expand-caret" onClick={this.toggleExpanded}>
                            <span className={`caret ${this.state.expanded ? 'expanded' : ''}`}>
                                {this.state.expanded ? '−' : '+'}
                            </span>
                        </div>
                    </div>

                    {this.state.expanded && (
                        <>
                            <div className="generate-similar-container">
                                <button 
                                    className="generate-similar-button"
                                    onClick={this.handleGenerateSimilar}
                                    disabled={this.state.generatingSimilar}
                                >
                                    generate similar prompts
                                </button>
                                <div className="similarity-input-container">
                                    <div className="input-with-hint">
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="Optionally specify what aspect of the input you care about, e.g., 'about food', 'asking for advice', 'formal tone'"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    this.handleGenerateSimilar();
                                                }
                                            }}
                                        />
                                        <span className="enter-hint">⏎ Enter</span>
                                    </div>
                                </div>
                            </div>

                            {this.state.similarPrompts.length > 0 && (
                                <div className="similar-prompts-table-container">
                                    <table className="similar-prompts-table">
                                        <thead>
                                            <tr>
                                                <th>Prompt</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {this.state.similarPrompts.map((prompt, index) => (
                                                <tr 
                                                    key={index}
                                                    className="clickable-row"
                                                    onClick={() => this.handlePromptSelect(prompt)}
                                                >
                                                    <td>{prompt}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {this.state.generatingSimilar && (
                                <div className="similar-prompts-table-container">
                                    <table className="similar-prompts-table">
                                        <thead>
                                            <tr>
                                                <th>Prompt</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td className="loading-cell">
                                                    <span className="loader"></span>
                                                    <span>Generating similar prompts...</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
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

    componentDidMount() {
        document.addEventListener('click', this.handleClickOutside);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener('click', this.handleClickOutside);
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    handleClickOutside = (event: MouseEvent) => {
        if (this.dropdownRef.current && !this.dropdownRef.current.contains(event.target as Node)) {
            this.setState({ open: false });
        }
    };

    handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            this.setState({ open: false });
        }
    };

    dropdownRef = React.createRef<HTMLDivElement>();

    handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({ value: e.target.value });
    };

    handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            this.props.onSubmit?.(this.state.value);
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
            <div className="input-with-hint" ref={this.dropdownRef}>
                <input
                    type="text"
                    className="input-field"
                    value={value}
                    placeholder="Enter or select a prompt"
                    onChange={this.handleInputChange}
                    onFocus={() => this.setState({ open: true })}
                    onKeyDown={this.handleInputKeyDown}
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
