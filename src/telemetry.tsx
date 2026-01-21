// Telemetry system for logging user interactions

import { state } from './state';
import { parseUrlParam } from './utils';

const STORAGE_KEY = 'llm_consistency_study_session';
const TELEMETRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzjSK-bJaYB15HqtNBDNK9kjoDdJS9LDmkxMkoK22ij_kzsdGqtu5B58HIisn-qo5Ls/exec';
// const TELEMETRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwBecSgj0Sk7qCi0DO_k1uHQVaOJa04PJv-XMftUUc/dev';
export interface Event {
  timestamp: number;
  type: string;
  data?: any;
}

export interface StudySession {
  interfaceVersion: string;
  startedAt: number;
  telemetry: Event[];
  finalAnswers?: any;
  submitted: boolean;
  prolificPid?: string;
  sessionId?: string;
  studyId?: string;
}

interface UrlParams {
  prolificPid: string | null;
  sessionId: string | null;
  studyId: string | null;
  interfaceVersion: string | null;
}

// Parse all telemetry-related URL parameters
function parseTelemetryUrlParams(): UrlParams {
  return {
    prolificPid: parseUrlParam('prolific_pid'),
    sessionId: parseUrlParam('session_id'),
    studyId: parseUrlParam('study_id'),
    interfaceVersion: parseUrlParam('vis_type'),
  };
}

// Warn if any required parameters are missing
function warnIfMissingParams(params: UrlParams): void {
  if (!params.prolificPid || !params.sessionId || !params.studyId || !params.interfaceVersion) {
    console.warn('Missing required telemetry parameters:', params);
  }
}

// Update session with URL parameters
function updateSessionFromUrl(session: StudySession, params: UrlParams): void {
  session.prolificPid = params.prolificPid || undefined;
  session.sessionId = params.sessionId || undefined;
  session.studyId = params.studyId || undefined;
  session.interfaceVersion = params.interfaceVersion || 'graph';
}

// Create a new session with URL parameters
function createNewSession(params: UrlParams): StudySession {
  return {
    interfaceVersion: params.interfaceVersion || 'graph',
    startedAt: Date.now(),
    telemetry: [],
    submitted: false,
    prolificPid: params.prolificPid || undefined,
    sessionId: params.sessionId || undefined,
    studyId: params.studyId || undefined,
  };
}

// Get or create a study session from localStorage
export function getOrCreateSession(): StudySession {
  const stored = localStorage.getItem(STORAGE_KEY);
  
  if (stored) {
    try {
      const session = JSON.parse(stored) as StudySession;
      // If session exists but isn't submitted, restore it
      if (!session.submitted) {
        const params = parseTelemetryUrlParams();
        warnIfMissingParams(params);
        updateSessionFromUrl(session, params);
        saveSession(session);
        return session;
      }
    } catch (e) {
      console.error('Error parsing stored session:', e);
    }
  }
  
  // Create new session with Prolific fields and interface version from URL
  const params = parseTelemetryUrlParams();
  warnIfMissingParams(params);
  const newSession = createNewSession(params);
  saveSession(newSession);
  return newSession;
}

// Check if telemetry should be active (only for user studies)
function isTelemetryActive(): boolean {
  return state.isUserStudy;
}

// Save session to localStorage
function saveSession(session: StudySession): void {
  if (!isTelemetryActive()) {
    return;
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Error saving session to localStorage:', e);
  }
}

// Clear session data from localStorage (for dev/testing)
export function clearSessionData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('✅ Telemetry session data cleared from localStorage');
  } catch (e) {
    console.error('Error clearing session from localStorage:', e);
  }
}

// Log an event and immediately save to localStorage
export function logEvent(type: string, data?: any): void {
  if (!isTelemetryActive()) {
    return;
  }
  
  const session = getOrCreateSession();
  
  const event: Event = {
    timestamp: Date.now(),
    type,
    data,
  };
  
  session.telemetry.push(event);
  saveSession(session);
}

// Prepare submission payload from session
function prepareSubmissionPayload(session: StudySession): string {
  const participantIdParts = [
    session.prolificPid,
    session.sessionId,
    session.studyId,
  ].filter(Boolean);
  const participantId = participantIdParts.length > 0 
    ? participantIdParts.join('_') 
    : '';
  console.log('PREPARING SUBMISSION PAYLOAD', participantId);
  return JSON.stringify({
    participantId,
    interfaceVersion: session.interfaceVersion,
    telemetry: session.telemetry,
    ...(session.prolificPid && { prolificPid: session.prolificPid }),
    ...(session.sessionId && { sessionId: session.sessionId }),
    ...(session.studyId && { studyId: session.studyId }),
  });
}

// Check if session can be submitted (has data and not already submitted)
function canSubmitSession(session: StudySession): boolean {
  return session.telemetry.length > 0 && !session.submitted;
}

// Mark session as submitted, save, and clear session data
// This is called by BOTH submission paths to ensure consistent handling
function markSessionAsSubmittedAndClear(session: StudySession): void {
  session.submitted = true;
  saveSession(session);
  // Clear session data to prevent duplicate submissions
  // This ensures that even if the user returns, the session won't be resubmitted
  clearSessionData();
}

// Common fetch options for telemetry submission
const SUBMISSION_FETCH_OPTIONS = {
  method: 'POST' as const,
  headers: {
    'Content-Type': 'text/plain;charset=utf-8',
  },
};

// Submit using sendBeacon (for unload events) with fetch fallback
function submitWithBeacon(data: string): void {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  const sent = navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
  
  // Fallback to fetch with keepalive if sendBeacon fails
  if (!sent) {
    fetch(TELEMETRY_ENDPOINT, {
      ...SUBMISSION_FETCH_OPTIONS,
      body: data,
      keepalive: true,
    }).catch(() => {
      // Silently fail - we can't do anything else at this point
    });
  }
}

// Submit using fetch with async/await (for manual submission)
async function submitWithFetch(data: string): Promise<boolean> {
  try {
    console.log('CALLING TELEMETRY ENDPOINT');
    console.log(data);
    const response = await fetch(TELEMETRY_ENDPOINT, {
      ...SUBMISSION_FETCH_OPTIONS,
      body: data,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status === 'ok') {
      return true;
    } else {
      throw new Error('Unexpected response from server');
    }
  } catch (error) {
    console.error('Error submitting telemetry:', error);
    return false;
  }
}

/**
 * SUBMISSION PATH 2: Unload submission (for page close events)
 */
export function submitSessionOnUnload(): void {
  if (!isTelemetryActive()) {
    return;
  }
  
  const session = getOrCreateSession();
  
  if (!canSubmitSession(session)) {
    return;
  }
  
  const data = prepareSubmissionPayload(session);
  submitWithBeacon(data);
  
  // Mark as submitted AND clear session data
  // This is the same handling as manual submission to prevent duplicates
  markSessionAsSubmittedAndClear(session);
}

// Check if session should be submitted (has data and not already submitted)
export function shouldSubmitSession(): boolean {
  const session = getOrCreateSession();
  return canSubmitSession(session);
}

/**
 * SUBMISSION PATH 1: Manual submission (for blur/visibilitychange events)
 * 
 * This is called when the user switches tabs/windows (via blur/visibilitychange).
 * Uses async fetch with response validation.
 */
export async function submitSession(): Promise<boolean> {
  if (!isTelemetryActive()) {
    return false;
  }
  
  const session = getOrCreateSession();
  
  if (!canSubmitSession(session)) {
    console.warn('Session already submitted or has no telemetry data');
    return false;
  }
  
  const data = prepareSubmissionPayload(session);
  console.log('SUBMITTING SESSION', data);
  const success = await submitWithFetch(data);
  
  if (success) {
    markSessionAsSubmittedAndClear(session);
  }
  
  return success;
}

// Log page load/refresh
export function logPageLoad(): void {
  logEvent('page_load', {
    url: window.location.href,
    userAgent: navigator.userAgent,
  });
}

// Convenience functions for common event types
export const telemetry = {
  // Slider changes
  logSliderChange: (name: string, value: number, promptIndex?: number) => {
    logEvent('slider_change', { name, value, promptIndex });
  },
  
  // Dropdown changes
  logDropdownChange: (name: string, value: string, promptIndex?: number) => {
    logEvent('dropdown_change', { name, value, promptIndex });
  },
  
  // Prompt text edits
  logPromptEdit: (promptIndex: number, text: string) => {
    logEvent('prompt_edit', { promptIndex, text });
  },
  
  // Generate similar prompts
  logGenerateSimilar: (promptIndex: number, similarityText: string) => {
    logEvent('generate_similar', { promptIndex, similarityText });
  },
  
  // Node click in graph
  logNodeClick: (nodeWord: string, nodeData?: any) => {
    logEvent('node_click', { nodeWord, nodeData });
  },
  
  // Graph pan (drag)
  logGraphPan: (translateX: number, translateY: number) => {
    logEvent('graph_pan', { translateX, translateY });
  },
  
  // Graph zoom (scroll or pinch)
  logGraphZoom: (scale: number, translateX: number, translateY: number) => {
    logEvent('graph_zoom', { scale, translateX, translateY });
  },
  
  // Visualization type change
  logVisTypeChange: (visType: string) => {
    logEvent('vis_type_change', { visType });
  },
  
  // Prompt actions
  logPromptAdd: (promptIndex: number, text: string) => {
    logEvent('prompt_add', { promptIndex, text });
  },
  
  logPromptDelete: (promptIndex: number) => {
    logEvent('prompt_delete', { promptIndex });
  },
  
  logPromptToggleDisabled: (promptIndex: number, disabled: boolean) => {
    logEvent('prompt_toggle_disabled', { promptIndex, disabled });
  },
  
  // Prompt selection from dropdown or similar prompts
  logPromptSelect: (promptIndex: number, text: string, source: 'dropdown' | 'similar_prompts') => {
    logEvent('prompt_select', { promptIndex, text, source });
  },
  
  // Page load
  logPageLoad,
  
  // Generic event logging
  log: logEvent,
  
  // Clear session data (for dev/testing)
  clearSessionData,
};

// Make clearSessionData available globally for Chrome dev tools
if (typeof window !== 'undefined') {
  (window as any).clearTelemetryData = clearSessionData;
  console.log('💡 Dev tool: Call clearTelemetryData() in the console to clear telemetry data');
}

