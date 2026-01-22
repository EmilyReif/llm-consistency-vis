import './app.css';
import './transformers_config';
import SingleExampleApp from './single_example_app';
import { telemetry, submitSession, clearSessionData, submitSessionOnUnload, shouldSubmitSession } from './telemetry';
import { useEffect, useRef } from 'react';

function App() {
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
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
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', submitOnUnload);
      window.onbeforeunload = null;
    };
  }, []);

  return <SingleExampleApp></SingleExampleApp>;
}

export default App;
