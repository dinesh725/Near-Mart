import React, { useState, useRef, useEffect, useCallback } from 'react';
import { P } from "../../theme/theme"; // Assuming P is defined for theme colors if needed. Fallback used if not.

const THRESHOLD = 70;
const MAX_PULL = 120;
const COOLDOWN_MS = 2500;

export const PullToRefreshWrapper = ({ onRefresh, children }) => {
    const isReadyRef = useRef(false);
    const startYRef = useRef(0);
    const lastRefreshRef = useRef(0);
    const contentRef = useRef(null);

    const [pulling, setPulling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [distance, setDistance] = useState(0);

    const handleTouchStart = useCallback((e) => {
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

        if (diff > 0) {
            if (e.cancelable) e.preventDefault();
            setPulling(true);
            const resistance = diff > THRESHOLD ? THRESHOLD + (diff - THRESHOLD) * 0.3 : diff;
            setDistance(Math.min(resistance, MAX_PULL));
        }
    }, [refreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (!isReadyRef.current || refreshing) return;
        isReadyRef.current = false;
        setPulling(false);

        if (distance >= THRESHOLD) {
            const now = Date.now();
            if (now - lastRefreshRef.current < COOLDOWN_MS) {
                // Throttle / Cooldown active to protect Redis/Backend
                setDistance(0);
                return;
            }

            lastRefreshRef.current = now;
            setRefreshing(true);
            setDistance(50); // Lock it below top to show spinner

            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
                setDistance(0);
            }
        } else {
            setDistance(0);
        }
    }, [distance, refreshing, onRefresh]);

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

    const contentStyle = {
        transform: `translateY(${distance}px)`,
        transition: pulling ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
    };

    const progress = Math.min(distance / THRESHOLD, 1);
    const iconStyle = {
        transform: `rotate(${progress * 180}deg) scale(${progress * 0.8 + 0.2})`,
        opacity: progress
    };
    
    // Safely fallback theme colors if P fails to link
    const borderColor = P?.border || "#E2E8F0";
    const primaryColor = P?.primary || "#6366F1";

    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <div style={{
                position: "absolute", top: 0, left: 0, right: 0,
                height: 60, display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 0,
                transform: `translateY(${distance - 60}px)`,
                transition: pulling ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
            }}>
                <div style={refreshing ? undefined : iconStyle}>
                    {refreshing ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="spinner-rotate">
                            <circle cx="12" cy="12" r="10" stroke={borderColor} strokeWidth="3" />
                            <circle cx="12" cy="12" r="10" stroke={primaryColor} strokeWidth="3" strokeLinecap="round" strokeDasharray="30 40" />
                        </svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M19 12l-7 7-7-7" />
                        </svg>
                    )}
                </div>
            </div>

            <div ref={contentRef} style={{ ...contentStyle, zIndex: 1, position: "relative", minHeight: "100%" }}>
                {children}
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes spinner-rotate-anim {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spinner-rotate {
                    animation: spinner-rotate-anim 1s linear infinite;
                }
            `}} />
        </div>
    );
};
