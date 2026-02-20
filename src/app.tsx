import './app.css';
import './transformers_config';
import SingleExampleApp from './single_example_app';
import TestCosSimPage from './TestCosSimPage';
import { telemetry, submitSession, clearSessionData, submitSessionOnUnload, shouldSubmitSession } from './telemetry';
import { useEffect, useRef } from 'react';

const isTestCosSimPage = () => {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  const q = new URLSearchParams(window.location.search);
  return (
    p === '/test_cos_sim.html' ||
    p.endsWith('/test_cos_sim.html') ||
    q.get('test_cos_sim') === '1'
  );
};

function App() {
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    // Disable browser find (Ctrl+F / Cmd+F)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);

    // Log page load immediately
    telemetry.logPageLoad();

    // Auto-submit telemetry when window loses focus or closes
    const handleAutoSubmit = async () => {
      // Prevent multiple simultaneous submissions
      if (hasSubmittedRef.current) {
        return;
      }

      // Only submit if there's telemetry data and it hasn't been submitted yet
      if (!shouldSubmitSession()) {
        return;
      }

      hasSubmittedRef.current = true;
      const success = await submitSession();
      
      if (!success) {
        // Reset flag if submission failed so we can retry on next blur/close
        hasSubmittedRef.current = false;
      }
    };

    // Handle window blur (user switches to another tab/window)
    const handleBlur = () => {
      handleAutoSubmit();
    };

    // Handle visibility change (more reliable for tab switching)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleAutoSubmit();
      }
    };

    // Handle page unload (window is closing)
    const submitOnUnload = () => {
      if (!hasSubmittedRef.current && shouldSubmitSession()) {
        hasSubmittedRef.current = true;
        submitSessionOnUnload();
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Use onbeforeunload property for maximum reliability
    window.onbeforeunload = submitOnUnload;
    // Also add pagehide as additional backup
    window.addEventListener('pagehide', submitOnUnload);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', submitOnUnload);
      window.onbeforeunload = null;
    };
  }, []);

  if (isTestCosSimPage()) {
    return <TestCosSimPage />;
  }
  return <SingleExampleApp></SingleExampleApp>;
}

export default App;
