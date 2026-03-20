import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const scrollPositions = new Map<string, number>();
const pathScrollPositions = new Map<string, number>();

function restoreWindowScroll(targetY: number) {
  let attempts = 0;
  const tryScroll = () => {
    window.scrollTo(0, targetY);
    if (Math.abs(window.scrollY - targetY) > 1 && attempts++ < 25) {
      requestAnimationFrame(tryScroll);
    }
  };
  requestAnimationFrame(tryScroll);
}

export default function useScrollRestore() {
  const { key, pathname, state } = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(key);
  const pathRef = useRef(pathname);

  useEffect(() => {
    const onScroll = () => {
      scrollPositions.set(keyRef.current, window.scrollY);
      pathScrollPositions.set(pathRef.current, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Update refs before paint so layout-triggered scroll events save to the new route
  useLayoutEffect(() => {
    keyRef.current = key;
    pathRef.current = pathname;
  }, [key, pathname]);

  useEffect(() => {
    if (navType === 'POP') {
      const saved = scrollPositions.get(key);
      if (saved != null) {
        restoreWindowScroll(saved);
        return;
      }
    }

    const restoreTournamentScroll = Boolean(
      (state as { restoreTournamentScroll?: boolean } | null)?.restoreTournamentScroll,
    );
    if (restoreTournamentScroll) {
      const saved = pathScrollPositions.get(pathname);
      if (saved != null) {
        restoreWindowScroll(saved);
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [key, pathname, navType, state]);
}
