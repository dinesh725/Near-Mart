import React, { useState, useRef, useEffect, useCallback } from "react";
import { P } from "../theme/theme";

// Threshold in pixels to trigger a refresh
const THRESHOLD = 60;
// Max pull distance
const MAX_PULL = 100;

export const PullToRefresh = ({ onRefresh, children }) => {
    const isReadyRef = useRef(false);
    const startYRef = useRef(0);
    const [pulling, setPulling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [distance, setDistance] = useState(0);
    const contentRef = useRef(null);

    // Dynamic styles based on drag state
    const contentStyle = {
        transform: `translateY(${distance}px)`,
        // Only trigger CSS transitions when NOT actively dragging your finger
        transition: pulling ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
    };

    // Calculate rotation and opacity of the spinner icon as you pull
    const progress = Math.min(distance / THRESHOLD, 1);
    const iconStyle = {
        transform: `rotate(${progress * 180}deg) scale(${progress * 0.8 + 0.2})`,
        opacity: progress
    };

    const handleTouchStart = useCallback((e) => {
        // Can only pull if we are scrolled to the absolute top of the container
        // and we aren't already refreshing
        if (window.scrollY <= 0 && !refreshing) {
            isReadyRef.current = true;
            startYRef.current = e.touches ? e.touches[0].clientY : e.clientY;
        } else {
            isReadyRef.current = false;
        }
    }, [refreshing]);

    const handleTouchMove = useCallback((e) => {
        if (!isReadyRef.current || refreshing) return;

        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const diff = currentY - startYRef.current;

        // If pulling down
        if (diff > 0) {
            // Cancel browser's default pull-to-refresh to use ours
            if (e.cancelable) e.preventDefault();
            
            setPulling(true);
            
            // Add resistance (friction) as you pull further
            const resistance = diff > THRESHOLD ? THRESHOLD + (diff - THRESHOLD) * 0.3 : diff;
            setDistance(Math.min(resistance, MAX_PULL));
        }
    }, [refreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (!isReadyRef.current || refreshing) return;
        isReadyRef.current = false;
        setPulling(false);

        if (distance >= THRESHOLD) {
            // Trigger refresh
            setRefreshing(true);
            setDistance(50); // Lock it at slightly below top to show spinner

            try {
                // Wait for the provided refresh function to complete
                await onRefresh();
            } finally {
                // Finish sequence
                setRefreshing(false);
                setDistance(0);
            }
        } else {
            // Snap back
            setDistance(0);
        }
    }, [distance, refreshing, onRefresh]);

    // Use passive=false on touchmove so we can call preventDefault() and stop native overscroll
    useEffect(() => {
        const node = contentRef.current;
        if (!node) return;
        
        node.addEventListener('touchstart', handleTouchStart);
        node.addEventListener('touchmove', handleTouchMove, { passive: false });
        node.addEventListener('touchend', handleTouchEnd);
        
        return () => {
            node.removeEventListener('touchstart', handleTouchStart);
            node.removeEventListener('touchmove', handleTouchMove);
            node.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    return (
        <div className="ptr-container">
            {/* The Pull Indicator */}
            <div className="ptr-spinner-container" style={{ transform: `translateY(${distance - 60}px)` }}>
                <div className="ptr-icon" style={refreshing ? undefined : iconStyle}>
                    {refreshing ? (
                        // Advanced Clean Animated Spinner
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="ptr-svg-spinner">
                            <circle cx="12" cy="12" r="10" stroke={P.border} strokeWidth="3" />
                            <circle cx="12" cy="12" r="10" stroke={P.primary} strokeWidth="3" strokeLinecap="round" strokeDasharray="30 40" />
                        </svg>
                    ) : (
                        // Pull arrow
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M19 12l-7 7-7-7" />
                        </svg>
                    )}
                </div>
            </div>

            {/* The Content */}
            <div ref={contentRef} className={`ptr-content ${pulling ? "ptr-pulling" : ""}`} style={contentStyle}>
                {children}
            </div>
        </div>
    );
};
