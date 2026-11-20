import { type DependencyList, useEffect } from 'react';

// The subscribe function MUST return a cleanup function. Use for: DOM event listeners, postMessage.
export function useSubscription(subscribe: () => (() => void), deps: DependencyList) {
  useEffect(() => subscribe(), deps);
}
