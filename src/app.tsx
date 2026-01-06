import './app.css';
import SingleExampleApp from './single_example_app';
import { telemetry, getOrCreateSession } from './telemetry';
import { useEffect, useState } from 'react';
import { UserIdPrompt } from './user_id_prompt';
import { state } from './state';

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!state.isUserStudy) {
      // If not a user study, initialize immediately
      getOrCreateSession();
      telemetry.logPageLoad();
      setReady(true);
    }
  }, []);

  const handleUserIdSet = () => {
    getOrCreateSession();
    telemetry.logPageLoad();
    setReady(true);
  };

  return (
    <>
      <UserIdPrompt 
        isUserStudy={state.isUserStudy} 
        onUserIdSet={handleUserIdSet}
      />
      {(!state.isUserStudy || ready) && <SingleExampleApp></SingleExampleApp>}
    </>
  );
}

export default App;
