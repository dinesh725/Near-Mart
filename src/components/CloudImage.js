import React, { useState } from 'react';

/**
 * CloudImage - Phase 4A Dynamic Image Resizer Component.
 * Integrates directly with Cloudinary URLs to securely fetch requested boundary sizes.
 * Caches down massive headers into dynamic responsive thumbnails preventing bandwidth crashes.
 */
export function CloudImage({ src, alt, width, height, className, style, crop = "scale", fallback = "https://via.placeholder.com/300?text=No+Image" }) {
    const [hasError, setHasError] = useState(false);
    
    // Dynamic Cloudinary URL Rewriting 
    const getOptimizedSrc = (url) => {
        if (!url) return fallback;
        if (!url.includes('res.cloudinary.com')) return url; // Only modify native CDN paths
        
        // Cloudinary native URI structure: .../upload/v1234/file.jpg
        // We inject constraints right after the /upload/ block.
        const urlParts = url.split('/upload/');
        if (urlParts.length !== 2) return url;

        // Construct dynamic bounds (e.g., c_scale,w_300,h_200)
        let transformations = [];
        if (width) transformations.push(`w_${width}`);
        if (height) transformations.push(`h_${height}`);
        if (crop) transformations.push(`c_${crop}`);
        
        // Ensure webp/avif fetching automatically if browser supports it
        transformations.push(`f_auto`, `q_auto:good`);
        
        const transformString = transformations.join(',');
        
        return `${urlParts[0]}/upload/${transformString}/${urlParts[1]}`;
    };

    const finalSrc = hasError ? fallback : getOptimizedSrc(src);

    return (
        <img 
            src={finalSrc} 
            alt={alt || "Image"} 
            className={className} 
            style={{ ...style, objectFit: style?.objectFit || 'cover' }} 
            onError={() => setHasError(true)}
            loading="lazy"
        />
    );
}
