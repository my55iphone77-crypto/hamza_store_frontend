import { useState, useEffect, useMemo } from 'react';

// ─── useWindowSize ───
export function useWindowSize() {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ticking = false;

    function handleResize() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setSize({
            width: window.innerWidth,
            height: window.innerHeight,
          });
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { width, height } = size;

  return useMemo(() => ({
    width,
    height,
    isMobile: width <= 640,
    isTablet: width > 640 && width <= 1024,
    isDesktop: width > 1024,
    isSmall: width <= 768,
  }), [width, height]);
}

// ─── useFullBleedStyle (Hook) ───
// استخدمه داخل المكون: const fullBleedStyle = useFullBleedStyle();
export function useFullBleedStyle() {
  const { isMobile, isTablet } = useWindowSize();

  return useMemo(() => ({
    width: '100%',
    maxWidth: '100%',
    minHeight: '100vh',
    boxSizing: 'border-box',
    overflowX: 'hidden',
    borderRadius: 0,
    padding: isMobile ? '12px' : isTablet ? '20px' : '30px',
  }), [isMobile, isTablet]);
}

// ─── fullBleedStyle (Object) ───
// للاستيراد المباشر بدون Hook: import { fullBleedStyle } from './useWindowSize';
export const fullBleedStyle = {
  width: '100%',
  maxWidth: '100%',
  minHeight: '100vh',
  boxSizing: 'border-box',
  overflowX: 'hidden',
  borderRadius: 0,
  padding: '0px',
};