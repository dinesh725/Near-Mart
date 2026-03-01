import { useState, useEffect, useCallback } from "react";

const MOBILE_BREAKPOINT = 1024;
const TABLET_MIN = 768;

/**
 * Returns true when the viewport width is below 1024px (mobile/tablet).
 * Updates reactively on every resize event.
 */
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
    );

    useEffect(() => {
        let timer;
        const handler = () => {
            clearTimeout(timer);
            timer = setTimeout(() => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT), 150);
        };
        window.addEventListener("resize", handler, { passive: true });
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        return () => { clearTimeout(timer); window.removeEventListener("resize", handler); };
    }, []);

    return isMobile;
}

/**
 * Returns true when the viewport width is between 768px and 1023px (tablet range).
 */
export function useIsTablet() {
    const check = useCallback(() => {
        if (typeof window === "undefined") return false;
        const w = window.innerWidth;
        return w >= TABLET_MIN && w < MOBILE_BREAKPOINT;
    }, []);

    const [isTablet, setIsTablet] = useState(check);

    useEffect(() => {
        let timer;
        const handler = () => {
            clearTimeout(timer);
            timer = setTimeout(() => setIsTablet(check()), 150);
        };
        window.addEventListener("resize", handler, { passive: true });
        setIsTablet(check());
        return () => { clearTimeout(timer); window.removeEventListener("resize", handler); };
    }, [check]);

    return isTablet;
}

/**
 * Returns true when the viewport width is below 480px (small phone).
 */
export function useIsSmallPhone() {
    const [isSmall, setIsSmall] = useState(
        () => typeof window !== "undefined" && window.innerWidth < 480
    );

    useEffect(() => {
        let timer;
        const handler = () => {
            clearTimeout(timer);
            timer = setTimeout(() => setIsSmall(window.innerWidth < 480), 150);
        };
        window.addEventListener("resize", handler, { passive: true });
        setIsSmall(window.innerWidth < 480);
        return () => { clearTimeout(timer); window.removeEventListener("resize", handler); };
    }, []);

    return isSmall;
}
