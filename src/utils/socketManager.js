import { io } from 'socket.io-client';

// REACT_APP_API_URL is typically "http://localhost:5000/api" —
// Socket.IO needs JUST the origin (no path), otherwise "/api" is parsed as a namespace.
const rawUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = rawUrl.replace(/\/api\/?$/i, '');

let socket = null;
let connectionState = 'disconnected'; // 'connected' | 'reconnecting' | 'disconnected'
const listeners = new Set();

function notifyStateChange(state) {
    connectionState = state;
    listeners.forEach(cb => { try { cb(state); } catch (e) { /* ignore */ } });
}

function getSocket() {
    if (socket && socket.connected) return socket;
    if (socket) return socket; // reconnecting

    try {
        socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'], // WebSocket first, polling fallback
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            randomizationFactor: 0.5,
            timeout: 10000,
            autoConnect: true,
            path: '/socket.io',
        });

        socket.on('connect', () => {
            console.log('[Socket] Connected:', socket.id);
            notifyStateChange('connected');
        });

        socket.on('reconnecting', (attemptNumber) => {
            console.log('[Socket] Reconnecting, attempt:', attemptNumber);
            notifyStateChange('reconnecting');
        });

        socket.on('reconnect', () => {
            console.log('[Socket] Reconnected');
            notifyStateChange('connected');
        });

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            notifyStateChange('disconnected');
        });

        socket.on('connect_error', (err) => {
            // Graceful — don't let socket errors crash the app
            console.warn('[Socket] Connection error (will retry):', err.message);
            notifyStateChange('reconnecting');
        });

    } catch (err) {
        console.warn('[Socket] Failed to initialize:', err.message);
        notifyStateChange('disconnected');
    }

    // ── Mobile sleep/wake: reconnect when app returns from background ────
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && socket && !socket.connected) {
                console.log('[Socket] App resumed, reconnecting...');
                socket.connect();
            }
        });
    }

    return socket;
}

function disconnect() {
    if (socket) {
        socket.disconnect();
        socket = null;
        notifyStateChange('disconnected');
    }
}

function onStateChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function getState() {
    return connectionState;
}

const socketManager = { getSocket, disconnect, onStateChange, getState };
export default socketManager;
