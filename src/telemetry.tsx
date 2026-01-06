// Telemetry system for logging user interactions

import { state } from './state';

const STORAGE_KEY = 'llm_consistency_study_session';
const TELEMETRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzjSK-bJaYB15HqtNBDNK9kjoDdJS9LDmkxMkoK22ij_kzsdGqtu5B58HIisn-qo5Ls/exec';
// const TELEMETRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwBecSgj0Sk7qCi0DO_k1uHQVaOJa04PJv-XMftUUc/dev';
export interface Event {
  timestamp: number;
  type: string;
  data?: any;
}

export interface StudySession {
  participantId: string;
  interfaceVersion: string;
  startedAt: number;
  telemetry: Event[];
  finalAnswers?: any;
  submitted: boolean;
}

// Generate a unique participant ID if one doesn't exist
function generateParticipantId(): string {
  return `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get or create a study session from localStorage
export function getOrCreateSession(): StudySession {
  const stored = localStorage.getItem(STORAGE_KEY);
  
  if (stored) {
    try {
      const session = JSON.parse(stored) as StudySession;
      // If session exists but isn't submitted, restore it
      if (!session.submitted) {
        return session;
      }
    } catch (e) {
      console.error('Error parsing stored session:', e);
    }
  }
  
  // Create new session
  const newSession: StudySession = {
    participantId: generateParticipantId(),
    interfaceVersion: state.visType,
    startedAt: Date.now(),
    telemetry: [],
    submitted: false,
  };
  
  saveSession(newSession);
  return newSession;
}

// Set participant ID (for user study)
export function setParticipantId(participantId: string): void {
  const session = getOrCreateSession();
  session.participantId = participantId;
  saveSession(session);
}

// Save session to localStorage
function saveSession(session: StudySession): void {
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
  const session = getOrCreateSession();
  
  const event: Event = {
    timestamp: Date.now(),
    type,
    data,
  };
  
  session.telemetry.push(event);
  saveSession(session);
}

// Submit the session to Google Apps Script
export async function submitSession(finalAnswers?: any): Promise<boolean> {
  const session = getOrCreateSession();
  
  if (session.submitted) {
    console.warn('Session already submitted');
    return false;
  }
  
  // Update final answers if provided
  if (finalAnswers !== undefined) {
    session.finalAnswers = finalAnswers;
  }
  
  try {
    console.log('CALLING TELEMETRY ENDPOINT')
    const response = await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        participantId: session.participantId,
        interfaceVersion: session.interfaceVersion,
        telemetry: session.telemetry,
        finalAnswers: session.finalAnswers,
      }),
    });


    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status === 'ok') {
      // Mark as submitted and save
      session.submitted = true;
      saveSession(session);
      return true;
    } else {
      throw new Error('Unexpected response from server');
    }
  } catch (error) {
    console.error('Error submitting telemetry:', error);
    return false;
  }
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

