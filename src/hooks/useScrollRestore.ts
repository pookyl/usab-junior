import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const scrollPositions = new Map<string, number>();

export default function useScrollRestore() {
  const { key } = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(key);

  useEffect(() => {
    const onScroll = () => {
      scrollPositions.set(keyRef.current, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Update keyRef before paint so layout-triggered scroll events save to the new key
  useLayoutEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (navType === 'POP') {
      const saved = scrollPositions.get(key);
      if (saved != null) {
        let attempts = 0;
        const tryScroll = () => {
          window.scrollTo(0, saved);
          if (Math.abs(window.scrollY - saved) > 1 && attempts++ < 25) {
            requestAnimationFrame(tryScroll);
          }
        };
        requestAnimationFrame(tryScroll);
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [key, navType]);
}
