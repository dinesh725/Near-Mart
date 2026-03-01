/**
 * NearMart API Client
 * Provides a thin wrapper around fetch() with automatic JWT token management,
 * token refresh on 401, retry with exponential backoff, and consistent error handling.
 *
 * Usage:
 *   import api from "../api/client";
 *   const { data } = await api.get("/products");
 *   const { data } = await api.post("/auth/login", { email, password });
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// ── Token Storage ─────────────────────────────────────────────────────────────
let accessToken = localStorage.getItem("nm_access_token");
let refreshToken = localStorage.getItem("nm_refresh_token");

const setTokens = (access, refresh) => {
    accessToken = access;
    refreshToken = refresh;
    if (access) localStorage.setItem("nm_access_token", access);
    else localStorage.removeItem("nm_access_token");
    if (refresh) localStorage.setItem("nm_refresh_token", refresh);
    else localStorage.removeItem("nm_refresh_token");
};

const clearTokens = () => setTokens(null, null);

// ── Refresh Logic ─────────────────────────────────────────────────────────────
let refreshPromise = null;

const refreshAccessToken = async () => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            const res = await fetch(`${API_BASE}/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken }),
            });
            if (!res.ok) throw new Error("Refresh failed");
            const data = await res.json();
            setTokens(data.accessToken, data.refreshToken);
            return data.accessToken;
        } catch {
            clearTokens();
            window.dispatchEvent(new CustomEvent("nm:logout"));
            throw new Error("Session expired");
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch with timeout using AbortController */
function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

/** Sleep helper for retry delays */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Check if an error is retryable (network failures, 5xx, timeouts) */
function isRetryable(error, status) {
    if (error?.name === "AbortError") return true; // Timeout
    if (!status) return true; // Network failure (no response)
    return status >= 500; // Server errors
}

// ── Request Helper ────────────────────────────────────────────────────────────
const request = async (method, path, body = null, retry = true) => {
    const url = `${API_BASE}${path}`;
    const headers = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const options = { method, headers };
    if (body && method !== "GET") options.body = JSON.stringify(body);

    // ── Retry loop with exponential backoff ─────────────────────────────────
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Wait before retry (skip delay on first attempt)
            if (attempt > 0) {
                await sleep(RETRY_DELAYS[attempt - 1] || 4000);
            }

            let res = await fetchWithTimeout(url, options);

            // Auto-refresh on 401
            if (res.status === 401 && retry && refreshToken) {
                try {
                    const newToken = await refreshAccessToken();
                    headers["Authorization"] = `Bearer ${newToken}`;
                    options.headers = headers;
                    res = await fetchWithTimeout(url, options);
                } catch {
                    return { ok: false, error: "Session expired" };
                }
            }

            const data = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));

            if (!res.ok) {
                // Don't retry client errors (4xx) except 408/429
                if (!isRetryable(null, res.status) && res.status !== 408 && res.status !== 429) {
                    return { ok: false, status: res.status, error: data.error || "Request failed", data };
                }
                lastError = data.error || "Request failed";
                continue; // Retry on 5xx, 408, 429
            }

            return { ok: true, status: res.status, ...data };

        } catch (err) {
            lastError = err.name === "AbortError" ? "Request timed out" : "Network error";
            if (!isRetryable(err)) break; // Non-retryable error
        }
    }

    return { ok: false, error: lastError || "Request failed after retries", offline: !navigator.onLine };
};

// ── Public API ────────────────────────────────────────────────────────────────
const api = {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    delete: (path) => request("DELETE", path),

    /** Upload file via multipart/form-data with optional progress callback */
    upload: (path, formData, onProgress) => {
        const url = `${API_BASE}${path}`;
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url);
            if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                };
            }

            xhr.onload = () => {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve({ ok: true, status: xhr.status, ...data });
                    } else {
                        resolve({ ok: false, status: xhr.status, error: data.error || "Upload failed", data });
                    }
                } catch {
                    resolve({ ok: false, error: "Invalid response" });
                }
            };

            xhr.onerror = () => resolve({ ok: false, error: "Network error", offline: !navigator.onLine });
            xhr.ontimeout = () => resolve({ ok: false, error: "Upload timed out" });
            xhr.timeout = 30000;
            xhr.send(formData);
        });
    },

    setTokens,
    clearTokens,
    getAccessToken: () => accessToken,
    /** Check if the device appears to be online */
    isOnline: () => typeof navigator !== "undefined" ? navigator.onLine : true,
};

export default api;
