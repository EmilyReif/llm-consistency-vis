// Telemetry system for logging user interactions

import { state } from './state';
import { parseUrlParam } from './utils';

const TELEMETRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzjSK-bJaYB15HqtNBDNK9kjoDdJS9LDmkxMkoK22ij_kzsdGqtu5B58HIisn-qo5Ls/exec';
// const TELEMETRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwBecSgj0Sk7qCi0DO_k1uHQVaOJa04PJv-XMftUUc/dev';

export interface Event {
  timestamp: number;
  type: string;
  data?: any;
  // Metadata included in each event
  interfaceVersion: string;
  dataset?: string;
  startedAt: number;
  prolificPid?: string;
  sessionId?: string;
  studyId?: string;
}

interface UrlParams {
  prolificPid: string | null;
  sessionId: string | null;
  studyId: string | null;
  interfaceVersion: string | null;
  dataset: string | null;
}

// In-memory storage for events (only for current page load)
let events: Event[] = [];
let pageStartedAt: number | null = null;
let hasSubmitted: boolean = false;

// Parse all telemetry-related URL parameters
function parseTelemetryUrlParams(): UrlParams {
  return {
    prolificPid: parseUrlParam('prolific_pid'),
    sessionId: parseUrlParam('session_id'),
    studyId: parseUrlParam('study_id'),
    interfaceVersion: parseUrlParam('vis_type'),
    dataset: parseUrlParam('dataset'),
  };
}

// Get metadata that should be included in each event
function getEventMetadata(): {
  interfaceVersion: string;
  dataset?: string;
  startedAt: number;
  prolificPid?: string;
  sessionId?: string;
  studyId?: string;
} {
  const params = parseTelemetryUrlParams();
  
  // Initialize pageStartedAt on first call
  if (pageStartedAt === null) {
    pageStartedAt = Date.now();
  }
  
  return {
    interfaceVersion: params.interfaceVersion || 'graph',
    dataset: params.dataset || undefined,
    startedAt: pageStartedAt,
    prolificPid: params.prolificPid || undefined,
    sessionId: params.sessionId || undefined,
    studyId: params.studyId || undefined,
  };
}

// Warn if any required parameters are missing
function warnIfMissingParams(): void {
  const params = parseTelemetryUrlParams();
  if (!params.prolificPid || !params.sessionId || !params.studyId || !params.interfaceVersion) {
    console.warn('Missing required telemetry parameters:', params);
  }
}

// Check if telemetry should be active (only for user studies)
function isTelemetryActive(): boolean {
  return state.isUserStudy;
}

// Log an event (stored in memory only, no localStorage)
export function logEvent(type: string, data?: any): void {
  if (!isTelemetryActive()) {
    return;
  }
  
  const metadata = getEventMetadata();
  
  const event: Event = {
    timestamp: Date.now(),
    type,
    data,
    ...metadata,
  };
  
  events.push(event);
}

// Get participant ID from URL parameters
function getParticipantId(): string {
  const params = parseTelemetryUrlParams();
  const participantIdParts = [
    params.prolificPid,
    params.sessionId,
    params.studyId,
  ].filter(Boolean);
  
  return participantIdParts.length > 0 
    ? participantIdParts.join('_') 
    : '';
}

// Get interface version from URL parameters
function getInterfaceVersion(): string {
  const params = parseTelemetryUrlParams();
  return params.interfaceVersion || 'graph';
}

// Prepare submission payload
function prepareSubmissionPayload(): string {
  const participantId = getParticipantId();
  const interfaceVersion = getInterfaceVersion();
  
  console.log('PREPARING SUBMISSION PAYLOAD', participantId);
  
  return JSON.stringify({
    participantId,
    interfaceVersion,
    telemetry: events,
  });
}

// Check if there are events to submit
function hasEventsToSubmit(): boolean {
  return events.length > 0 && !hasSubmitted;
}

// Mark as submitted (prevent duplicate submissions)
function markAsSubmitted(): void {
  hasSubmitted = true;
  // Clear events after submission to free memory
  events = [];
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
  
  if (!hasEventsToSubmit()) {
    return;
  }
  
  // Log leavePage event before preparing payload
  logLeavePage();
  
  const data = prepareSubmissionPayload();
  submitWithBeacon(data);
  
  // Mark as submitted to prevent duplicate submissions
  markAsSubmitted();
}

// Check if session should be submitted (has events and not already submitted)
export function shouldSubmitSession(): boolean {
  return hasEventsToSubmit();
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
  
  if (!hasEventsToSubmit()) {
    console.warn('No events to submit or already submitted');
    return false;
  }
  
  // Log leavePage event before preparing payload
  logLeavePage();
  
  const data = prepareSubmissionPayload();
  console.log('SUBMITTING SESSION', data);
  const success = await submitWithFetch(data);
  
  if (success) {
    markAsSubmitted();
  }
  
  return success;
}

// Log page load/refresh
export function logPageLoad(): void {
  // Warn about missing params on page load
  warnIfMissingParams();
  
  logEvent('page_load', {
    url: window.location.href,
    userAgent: navigator.userAgent,
  });
}

// Log page leave/close (called right before submission)
function logLeavePage(): void {
  if (!isTelemetryActive()) {
    return;
  }
  
  const timeOnPage = pageStartedAt ? Date.now() - pageStartedAt : 0;
  
  logEvent('leavePage', {
    timeOnPage,
    url: window.location.href,
  });
}

// Clear telemetry data (for dev/testing)
export function clearSessionData(): void {
  events = [];
  hasSubmitted = false;
  pageStartedAt = null;
  console.log('✅ Telemetry data cleared');
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
