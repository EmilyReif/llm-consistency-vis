import './app.css';
import './transformers_config';
import SingleExampleApp from './single_example_app';
import { telemetry, getOrCreateSession } from './telemetry';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // Initialize session and log page load immediately
    getOrCreateSession();
    telemetry.logPageLoad();
  }, []);

  return <SingleExampleApp></SingleExampleApp>;
}

export default App;
