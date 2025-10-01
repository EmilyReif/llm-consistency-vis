import React from "react";
import { state } from "./state";
import { examples } from "./cached_examples";

interface PromptContainerProps {
    promptIndex: number;
    prompt: { text: string; temp: number };
    onUpdateText: (index: number, text: string) => void;
    onUpdateTemp: (index: number, temp: number) => void;
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
    };

    render() {
        const { prompt, promptIndex, onUpdateText, onUpdateTemp, onDelete, onToggleDisabled, isDisabled, totalPrompts } = this.props;
        const { expanded, generatingSimilar, similarPrompts } = this.state;

        // Get semi-transparent background color from D3 color scheme
        const backgroundColor = state.getPromptColor(promptIndex);

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
                    <div className="expand-caret" onClick={this.toggleExpanded}>
                        <span className={`material-icons ${expanded ? 'expanded' : ''}`}>
                            {expanded ? 'expand_less' : 'expand_more'}
                        </span>
                    </div>
                    <div className='input-header'>Prompt {promptIndex + 1}</div>
                    <EditableDropdown
                        key={'prompt-' + promptIndex + '-' + (prompt.text || '')}
                        value={prompt.text || ''}
                        options={Object.keys(examples)}
                        onSubmit={(val: string) => onUpdateText(promptIndex, val)}
                    />
                        <div className="slider-container">
                            <label>Temp: {prompt.temp}</label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={prompt.temp}
                                onChange={(e) => onUpdateTemp(promptIndex, parseFloat((e.target as HTMLInputElement).value))}
                            />
                        </div>
                    {totalPrompts > 1 && (
                        <>
                            <button
                                className="toggle-disabled-button"
                                onClick={() => onToggleDisabled(promptIndex)}
                                title={isDisabled ? "Enable this prompt" : "Disable this prompt"}
                            >
                                <span className="material-icons">
                                    {isDisabled ? 'visibility' : 'visibility_off'}
                                </span>
                            </button>
                            <button
                                className="delete-prompt-button"
                                onClick={() => onDelete(promptIndex)}
                                title="Delete this prompt"
                            >
                                <span className="material-icons">close</span>
                            </button>
                        </>
                    )}
                </div>
                {expanded && (
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
                <span className="enter-hint">
                    <span className="material-icons">keyboard_return</span> Enter
                </span>
            </div>
        );
    }
}

export default PromptContainer;
