import React, { useState, useEffect } from 'react';
import './user_id_prompt.css';
import { getOrCreateSession, setParticipantId } from './telemetry';

interface UserIdPromptProps {
  isUserStudy: boolean;
  onUserIdSet: () => void;
}

export function UserIdPrompt({ isUserStudy, onUserIdSet }: UserIdPromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isUserStudy) {
      const session = getOrCreateSession();
      // Show prompt if participantId is auto-generated (starts with "participant_")
      if (session.participantId.startsWith('participant_')) {
        setShowPrompt(true);
      } else {
        // User has already entered their ID
        onUserIdSet();
      }
    }
  }, [isUserStudy, onUserIdSet]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUserId = userId.trim();
    
    if (!trimmedUserId) {
      setError('Please enter a user ID');
      return;
    }

    setParticipantId(trimmedUserId);
    setShowPrompt(false);
    onUserIdSet();
  };

  if (!isUserStudy || !showPrompt) {
    return null;
  }

  return (
    <div className="user-id-prompt-overlay">
      <div className="user-id-prompt-modal">
        <h2>Enter User ID</h2>
        <p>Please enter your Prolific user ID to continue.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setError('');
            }}
            placeholder="User ID"
            className="user-id-input"
            autoFocus
          />
          {error && <div className="user-id-error">{error}</div>}
          <button type="submit" className="user-id-submit-button">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

