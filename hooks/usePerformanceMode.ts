import { useEffect,useState } from 'react';
import {
  applyPerformanceModeToDocument,
  getPerformanceModeState,
  subscribePerformanceModeChanges,
  writePerformanceModePreference,
  type PerformanceModePreference,
  type PerformanceModeState,
} from '../utils/performanceMode';

export function usePerformanceMode(): PerformanceModeState & {
  setPreference: (preference: PerformanceModePreference) => void;
  isLite: boolean;
} {
  const [state, setState] = useState<PerformanceModeState>(() => getPerformanceModeState());

  useEffect(() => {
    const refresh = () => setState(getPerformanceModeState());
    return subscribePerformanceModeChanges(refresh);
  }, []);

  useEffect(() => {
    applyPerformanceModeToDocument(state.resolved);
  }, [state.resolved]);

  return {
    ...state,
    isLite: state.resolved === 'lite',
    setPreference: writePerformanceModePreference,
  };
}
