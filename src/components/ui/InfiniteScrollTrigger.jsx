import React, { useEffect, useRef } from 'react';

export const InfiniteScrollTrigger = ({ onLoadMore, loadingMore, hasMore }) => {
    const observerRef = useRef(null);

    useEffect(() => {
        if (loadingMore || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    onLoadMore();
                }
            },
            { threshold: 0.1 }
        );

        if (observerRef.current) {
            observer.observe(observerRef.current);
        }

        return () => observer.disconnect();
    }, [onLoadMore, loadingMore, hasMore]);

    if (!hasMore) return null;

    return (
        <div ref={observerRef} style={{ height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', margin: '10px 0' }}>
            {loadingMore && (
                <div style={{ color: '#888', fontSize: '14px', fontStyle: 'italic' }}>Loading more...</div>
            )}
        </div>
    );
};
