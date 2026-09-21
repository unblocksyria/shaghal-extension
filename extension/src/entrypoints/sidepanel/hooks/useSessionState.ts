import { useEffect, useState } from 'react';
import { sendSessionMessage } from '../../../lib/messaging';
import { getLastEndedSession, type TesterSession } from '../../../lib/session';

export interface SessionState {
  active: TesterSession | null;
  lastEnded: TesterSession | null;
}

export function useSessionState(): SessionState {
  const [state, setState] = useState<SessionState>({ active: null, lastEnded: null });

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
    const poll = async () => {
      const messageResult = await sendSessionMessage({ type: 'GET_SESSION' });
      const lastEnded = await getLastEndedSession();
      setState({
        active: messageResult.ok ? messageResult.session ?? null : null,
        lastEnded: lastEnded ?? null,
      });
    };
    void poll();
    const interval = setInterval(() => void poll(), 1500);
    return () => clearInterval(interval);
  }, []);

  return state;
}
