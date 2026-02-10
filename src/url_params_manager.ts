/**
 * URLParamsManager - Centralized manager for URL parameters
 * Handles bidirectional sync between URL and application state
 */

// Enum for all URL parameter keys
export enum URLParam {
  PROMPT_IDX = 'prompt_idx',
  VIS_TYPE = 'vis_type', // graph, raw_outputs, first_output, word_tree, highlights
  SEPARATE_GRAPHS = 'separate_graphs',
  TOKENIZE_MODE = 'tokenize_mode',
  IS_USER_STUDY = 'is_user_study',
  NUM_GENERATIONS = 'num_generations',
  SIMILARITY_THRESHOLD = 'similarity_threshold',
  HIDE_POPUPS = 'hide_popups',
  HIDE_PROMPT_TEXT = 'hide_prompt_text',
  // Telemetry / Prolific study parameters
  PROLIFIC_PID = 'prolific_pid',
  SESSION_ID = 'session_id',
  STUDY_ID = 'study_id',
  DATASET = 'dataset',
}

// Type for vis_type values
export type VisType = 'graph' | 'raw_outputs' | 'first_output' | 'word_tree' | 'highlights';

// Type for tokenize mode values
export type TokenizeMode = 'space' | 'comma' | 'sentence';

/**
 * Centralized URL parameter management class
 * Provides methods to get and set URL parameters with proper encoding/decoding
 */
export class URLParamsManager {
  private static instance: URLParamsManager;
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): URLParamsManager {
    if (!URLParamsManager.instance) {
      URLParamsManager.instance = new URLParamsManager();
    }
    return URLParamsManager.instance;
  }

  /**
   * Get current URL search params
   */
  private getSearchParams(): URLSearchParams {
    return new URLSearchParams(window.location.search);
  }

  /**
   * Update URL without page reload
   */
  private updateURL(params: URLSearchParams): void {
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  }

  /**
   * Get a parameter value from URL
   */
  get(param: URLParam): string | null {
    const params = this.getSearchParams();
    const value = params.get(param);
    return value ? decodeURIComponent(value) : null;
  }

  /**
   * Get a parameter as a boolean
   */
  getBoolean(param: URLParam): boolean {
    const value = this.get(param);
    return value === 'true';
  }

  /**
   * Get a parameter as a number
   */
  getNumber(param: URLParam, defaultValue?: number): number | null {
    const value = this.get(param);
    if (value === null) return defaultValue ?? null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue ?? null) : parsed;
  }

  /**
   * Get a parameter as an integer
   */
  getInt(param: URLParam, defaultValue?: number): number | null {
    const value = this.get(param);
    if (value === null) return defaultValue ?? null;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? (defaultValue ?? null) : parsed;
  }

  /**
   * Get prompt indices as an array
   */
  getPromptIndices(): number[] {
    const value = this.get(URLParam.PROMPT_IDX);
    if (!value) return [];
    
    return value
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));
  }

  /**
   * Get vis type with validation
   */
  getVisType(): VisType | null {
    const value = this.get(URLParam.VIS_TYPE);
    if (!value) return null;
    
    const validTypes: VisType[] = ['graph', 'raw_outputs', 'first_output', 'word_tree', 'highlights'];
    return validTypes.includes(value as VisType) ? (value as VisType) : null;
  }

  /**
   * Get tokenize mode with validation
   */
  getTokenizeMode(): TokenizeMode | null {
    const value = this.get(URLParam.TOKENIZE_MODE);
    if (!value) return null;
    
    const validModes: TokenizeMode[] = ['space', 'comma', 'sentence'];
    return validModes.includes(value as TokenizeMode) ? (value as TokenizeMode) : null;
  }

  /**
   * Set a parameter value in URL
   */
  set(param: URLParam, value: string | number | boolean): void {
    const params = this.getSearchParams();
    params.set(param, encodeURIComponent(String(value)));
    this.updateURL(params);
  }

  /**
   * Set prompt indices in URL
   */
  setPromptIndices(indices: number[]): void {
    if (indices.length === 0) {
      this.remove(URLParam.PROMPT_IDX);
      return;
    }
    this.set(URLParam.PROMPT_IDX, indices.join(','));
  }

  /**
   * Remove a parameter from URL
   */
  remove(param: URLParam): void {
    const params = this.getSearchParams();
    params.delete(param);
    this.updateURL(params);
  }

  /**
   * Check if a parameter exists in URL
   */
  has(param: URLParam): boolean {
    return this.getSearchParams().has(param);
  }

  /**
   * Set multiple parameters at once (more efficient than multiple set() calls)
   */
  setMultiple(updates: Partial<Record<URLParam, string | number | boolean>>): void {
    const params = this.getSearchParams();
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        params.set(key, encodeURIComponent(String(value)));
      }
    });
    
    this.updateURL(params);
  }

  /**
   * Clear all parameters
   */
  clearAll(): void {
    window.history.pushState({}, '', window.location.pathname);
  }

  /**
   * Get all parameters as an object
   */
  getAll(): Record<string, string> {
    const params = this.getSearchParams();
    const result: Record<string, string> = {};
    
    params.forEach((value, key) => {
      result[key] = decodeURIComponent(value);
    });
    
    return result;
  }

  /**
   * Get a parameter by arbitrary string key (for dynamic param names like API keys)
   * Use this sparingly - prefer the typed URLParam enum where possible
   */
  getRaw(paramName: string): string | null {
    const params = this.getSearchParams();
    const value = params.get(paramName);
    return value ? decodeURIComponent(value) : null;
  }

  /**
   * Set a parameter by arbitrary string key (for dynamic param names like API keys)
   * Use this sparingly - prefer the typed URLParam enum where possible
   */
  setRaw(paramName: string, value: string): void {
    const params = this.getSearchParams();
    params.set(paramName, encodeURIComponent(value));
    this.updateURL(params);
  }
}

// Export singleton instance for easy access
export const urlParams = URLParamsManager.getInstance();
