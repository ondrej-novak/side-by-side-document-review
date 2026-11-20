import { type DependencyList, type EffectCallback, useEffect } from 'react';

// Use for: document.title, URL params, localStorage, imperative DOM calls, floating UI refs.
export function useExternalSync(effect: EffectCallback, deps: DependencyList) {
  useEffect(effect, deps);
}
