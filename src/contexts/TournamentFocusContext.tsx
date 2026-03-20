import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const TRANSITION_MS = 220;

interface TournamentFocusContextValue {
  isActive: boolean;
  activeTswId: string | null;
  isTransitioning: boolean;
  enterMode: (tswId: string) => void;
  exitMode: () => void;
}

const TournamentFocusContext = createContext<TournamentFocusContextValue | null>(null);

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TournamentFocusProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [activeTswId, setActiveTswId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const triggerTransition = useCallback(() => {
    clearTransitionTimer();
    if (prefersReducedMotion()) {
      setIsTransitioning(false);
      return;
    }
    setIsTransitioning(true);
    transitionTimerRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
      transitionTimerRef.current = null;
    }, TRANSITION_MS);
  }, [clearTransitionTimer]);

  const enterMode = useCallback((tswId: string) => {
    if (!tswId) return;
    setActiveTswId(tswId);
    setIsActive(true);
    triggerTransition();
  }, [triggerTransition]);

  const exitMode = useCallback(() => {
    setIsActive(false);
    setActiveTswId(null);
    triggerTransition();
  }, [triggerTransition]);

  useEffect(() => clearTransitionTimer, [clearTransitionTimer]);

  const value = useMemo(() => ({
    isActive,
    activeTswId,
    isTransitioning,
    enterMode,
    exitMode,
  }), [isActive, activeTswId, isTransitioning, enterMode, exitMode]);

  return (
    <TournamentFocusContext.Provider value={value}>
      {children}
    </TournamentFocusContext.Provider>
  );
}

export function useTournamentFocus(): TournamentFocusContextValue {
  const ctx = useContext(TournamentFocusContext);
  if (!ctx) throw new Error('useTournamentFocus must be used within TournamentFocusProvider');
  return ctx;
}
