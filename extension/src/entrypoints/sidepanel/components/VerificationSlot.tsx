import { useEffect, useRef } from 'react';
import { registerTurnstileHost } from '../../../lib/turnstile';

/**
 * Wraps the button that sends something verified, so a challenge that needs a
 * click appears right under it instead of over the whole panel. The newest
 * slot on screen wins; see registerTurnstileHost.
 */
export function VerificationSlot(props: { children: React.ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => registerTurnstileHost(slot.current!), []);
  return (
    <div ref={slot} className="us-verify-slot">
      {props.children}
    </div>
  );
}
