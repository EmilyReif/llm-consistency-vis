import React from "react";
import { state } from "./state";
import { examples } from "./cached_examples";
import { PROVIDERS, getModelsForFamily } from "./llm/config";
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import { telemetry } from "./telemetry";
import { urlParams, URLParam } from "./url_params_manager";

interface PromptContainerProps {
    promptIndex: number;
    prompt: { text: string; temp: number; modelFamily: string; model: string };
    onUpdateText: (index: number, text: string) => void;
    onUpdateTemp: (index: number, temp: number) => void;
    onUpdateModelFamily: (index: number, modelFamily: string) => void;
    onUpdateModel: (index: number, model: string) => void;
    onDelete: (index: number) => void;
    onToggleDisabled: (index: number) => void;
    isDisabled: boolean;
    totalPrompts: number;
}

class PromptContainer extends React.Component<PromptContainerProps, { expanded: boolean; generatingSimilar: boolean; similarPrompts: string[] }> {
    state = {
        expanded: false,
        generatingSimilar: false,
        similarPrompts: [] as string[],
    };

    toggleExpanded = () => {
        this.setState(prevState => ({ expanded: !prevState.expanded }));
    };

    handleGenerateSimilar = async () => {
        const similarityText = (document.querySelector(`.similarity-input-${this.props.promptIndex}`) as HTMLInputElement)?.value || '';
        this.setState({ generatingSimilar: true, similarPrompts: [] });
        
        // Log telemetry for generate similar
        telemetry.logGenerateSimilar(this.props.promptIndex, similarityText);

        try {
            const similarPrompts = await state.generateSimilarPrompts(this.props.prompt.text, similarityText, this.props.prompt.temp);
            this.setState({ similarPrompts, generatingSimilar: false });
        } catch (error) {
            console.error('Error generating similar prompts:', error);
            this.setState({ generatingSimilar: false });
        }
    };

    handlePromptSelect = (prompt: string) => {
        state.addPrompt(prompt);
        // Log telemetry for prompt selection from similar prompts
        const newIndex = state.prompts.length - 1;
        telemetry.logPromptSelect(newIndex, prompt, 'similar_prompts');
    };

    render() {
        const { prompt, promptIndex, onUpdateText, onUpdateTemp, onUpdateModelFamily, onUpdateModel, onDelete, onToggleDisabled, isDisabled, totalPrompts } = this.props;
        const { expanded, generatingSimilar, similarPrompts } = this.state;

        // Get semi-transparent background color from D3 color scheme
        const backgroundColor = state.getPromptColor(promptIndex);
        const promptLabel = totalPrompts === 1 ? 'Prompt' : `Prompt ${promptIndex + 1}`;

        return (
            <div
                className={`compare-prompt-container ${isDisabled ? 'disabled' : ''}`}
                style={{
                    backgroundColor: isDisabled ? '#f0f0f0' : backgroundColor,
                    color: isDisabled ? '#666' : 'black', // Grey text when disabled
                    borderColor: isDisabled ? '#ccc' : backgroundColor,
                    opacity: isDisabled ? 0.6 : 1
                }}
            >
                <div className="controls-row">
                    {!state.isUserStudy && (
                        <div className="expand-caret" onClick={this.toggleExpanded}>
                            <span className={`material-icons ${expanded ? 'expanded' : ''}`}>
                                {expanded ? 'expand_less' : 'expand_more'}
                            </span>
                        </div>
                    )}
                    <div className='input-header'>{promptLabel}</div>
                    <EditableDropdown
                        key={'prompt-' + promptIndex + '-' + (prompt.text || '')}
                        value={prompt.text || ''}
                        options={Object.keys(examples)}
                        onSubmit={(val: string) => {
                            onUpdateText(promptIndex, val);
                            telemetry.logPromptEdit(promptIndex, val);
                        }}
                        readOnly={state.isUserStudy}
                        promptIndex={promptIndex}
                    />
                        {!state.isUserStudy && (
                            <>
                                <div className="slider-container">
                                    <label>Temperature: {prompt.temp}</label>
                                    <Box sx={{ width: 150 }}>
                                        <Slider
                                            size="small"
                                            min={0}
                                            max={1}
                                            step={0.1}
                                            value={prompt.temp}
                                            onChange={(e, value) => {
                                                onUpdateTemp(promptIndex, value as number);
                                                telemetry.logSliderChange('temperature', value as number, promptIndex);
                                            }}
                                            valueLabelDisplay="auto"
                                            aria-label="Temperature"
                                            disabled={isDisabled}
                                        />
                                    </Box>
                                </div>
                                <div className="dropdown-container">
                                    <label>Model Family:</label>
                                    <select
                                        value={prompt.modelFamily}
                                        onChange={(e) => {
                                            onUpdateModelFamily(promptIndex, e.target.value);
                                            telemetry.logDropdownChange('modelFamily', e.target.value, promptIndex);
                                        }}
                                        disabled={isDisabled}
                                    >
                                        {PROVIDERS.map(provider => (
                                            <option key={provider.id} value={provider.id}>
                                                {provider.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="dropdown-container">
                                    <label>Model:</label>
                                    <select
                                        value={prompt.model}
                                        onChange={(e) => {
                                            onUpdateModel(promptIndex, e.target.value);
                                            telemetry.logDropdownChange('model', e.target.value, promptIndex);
                                        }}
                                        disabled={isDisabled}
                                    >
                                        {getModelsForFamily(prompt.modelFamily).map(model => (
                                            <option key={model.id} value={model.id}>
                                                {model.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}
                    {totalPrompts > 1 && (
                        <>
                            <button
                                className="toggle-disabled-button"
                                onClick={() => {
                                    onToggleDisabled(promptIndex);
                                    telemetry.logPromptToggleDisabled(promptIndex, !isDisabled);
                                }}
                                title={isDisabled ? "Enable this prompt" : "Disable this prompt"}
                            >
                                <span className="material-icons">
                                    {isDisabled ? 'visibility' : 'visibility_off'}
                                </span>
                            </button>
                            <button
                                className="delete-prompt-button"
                                onClick={() => {
                                    telemetry.logPromptDelete(promptIndex);
                                    onDelete(promptIndex);
                                }}
                                title="Delete this prompt"
                            >
                                <span className="material-icons">close</span>
                            </button>
                        </>
                    )}
                </div>
                {expanded && !state.isUserStudy && (
                    <div className="generate-similar-container">
                        <div className='controls-row'>
                            <button
                                className="generate-similar-button"
                                onClick={this.handleGenerateSimilar}
                                disabled={generatingSimilar}
                            >
                                generate similar prompts
                            </button>
                            <div className="similarity-input-container">
                                <div className="input-with-hint">
                                    <input
                                        type="text"
                                        className={`input-field similarity-input-${promptIndex}`}
                                        placeholder="Optionally specify what aspect of the input you care about, e.g., 'about food', 'asking for advice', 'formal tone'"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                (e.target as HTMLInputElement).blur();
                                            }
                                        }}
                                    />
                                    <span className="enter-hint">
                                        <span className="material-icons">keyboard_return</span> Enter
                                    </span>
                                </div>
                            </div>
                        </div>
                            {similarPrompts.length > 0 && (
                        <div className='controls-row'>

                                <div className="similar-prompts-table-container">
                                    <table className="similar-prompts-table">
                                        <thead>
                                            <tr>
                                                <th>Prompt</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {similarPrompts.map((prompt, index) => (
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
                        </div>

                            )}
                        {generatingSimilar && (
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
                    </div>
                )}
            </div>
        );
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
        if (this.props.readOnly) {
            return; // Don't allow typing when readOnly is true
        }
        this.setState({ value: e.target.value });
    };

    handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (this.props.readOnly) {
            // When readOnly, only allow opening dropdown, not submitting custom text
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this.setState({ open: true });
            }
            return;
        }
        if (e.key === "Enter") {
            this.props.onSubmit?.(this.state.value);
            this.setState({ open: false });
            // Log telemetry for prompt edit (when typing and pressing Enter)
            if (this.props.promptIndex !== undefined && !this.props.readOnly) {
                telemetry.logPromptEdit(this.props.promptIndex, this.state.value);
            }
        }
    };

    handleSelect = (option: string) => {
        this.setState({ value: option, open: false }, () => {
            this.props.onSubmit?.(option);
            // Log telemetry for prompt selection from dropdown
            if (this.props.promptIndex !== undefined) {
                telemetry.logPromptSelect(this.props.promptIndex, option, 'dropdown');
            }
        });
    };

    render() {
        const { options, readOnly } = this.props;
        const { open, value } = this.state;

        return (
            <div 
                className="input-with-hint" 
                ref={this.dropdownRef}
                style={{
                    visibility: urlParams.getBoolean(URLParam.HIDE_PROMPT_TEXT) ? 'hidden' : 'visible'
                }}
            >
                <input
                    type="text"
                    className="input-field"
                    value={value}
                    placeholder={readOnly ? "Select a prompt" : "Enter or select a prompt"}
                    onChange={this.handleInputChange}
                    onFocus={() => this.setState({ open: true })}
                    onKeyDown={this.handleInputKeyDown}
                    readOnly={readOnly}
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
                {!readOnly && (
                    <span className="enter-hint">
                        <span className="material-icons">keyboard_return</span> Enter
                    </span>
                )}
            </div>
        );
    }
}

export default PromptContainer;
