import './app.css';
import SingleExampleApp from './single_example_app';
import { telemetry, getOrCreateSession } from './telemetry';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // Restore or create session on page load
    getOrCreateSession();
    // Log page load on mount
    telemetry.logPageLoad();
  }, []);

  return <SingleExampleApp></SingleExampleApp>;
}

export default App;
