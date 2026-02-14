import { useEffect, useRef, useCallback } from "react";

/**
 * Custom hook to save and restore scroll position for a scrollable container.
 * This helps maintain the user's position when navigating between pages.
 */
export function useScrollPosition(key: string, containerRef: React.RefObject<HTMLElement | null>) {
    const savedPosition = useRef<number>(0);

    // Save current scroll position to sessionStorage
    const savePosition = useCallback(() => {
        if (containerRef.current) {
            const pos = containerRef.current.scrollTop;
            sessionStorage.setItem(`scroll_${key}`, String(pos));
            savedPosition.current = pos;
        }
    }, [key, containerRef]);

    // Restore scroll position from sessionStorage
    const restorePosition = useCallback(() => {
        if (containerRef.current) {
            const saved = sessionStorage.getItem(`scroll_${key}`);
            if (saved) {
                const pos = parseInt(saved, 10);
                containerRef.current.scrollTop = pos;
                savedPosition.current = pos;
            }
        }
    }, [key, containerRef]);

    // Save position when unmounting or page changes
    useEffect(() => {
        return () => {
            savePosition();
        };
    }, [savePosition]);

    return { savePosition, restorePosition, savedPosition };
}

/**
 * Hook to detect swipe gestures for mobile navigation
 */
export function useSwipeNavigation(
    containerRef: React.RefObject<HTMLElement | null>,
    onSwipeRight?: () => void,
    onSwipeLeft?: () => void
) {
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;

        const handleTouchStart = (e: TouchEvent) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        };

        const handleTouchEnd = (e: TouchEvent) => {
            touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const diffX = touchEndX - touchStartX;
            const diffY = Math.abs(touchEndY - touchStartY);

            // Only trigger if horizontal swipe is dominant and significant
            if (Math.abs(diffX) > 80 && diffY < 100) {
                if (diffX > 0 && onSwipeRight) {
                    onSwipeRight();
                } else if (diffX < 0 && onSwipeLeft) {
                    onSwipeLeft();
                }
            }
        };

        container.addEventListener("touchstart", handleTouchStart, { passive: true });
        container.addEventListener("touchend", handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchend", handleTouchEnd);
        };
    }, [containerRef, onSwipeRight, onSwipeLeft]);
}
