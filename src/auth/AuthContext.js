import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/client";

// ── Demo Role Metadata (display only — NOT used for authentication) ─────────
export const DEMO_ROLES = [
    { role: "customer", name: "Customer Demo", email: "demo.customer@nearmart.in", avatar: "PS", desc: "Browse, shop & track orders" },
    { role: "seller", name: "Seller Demo", email: "demo.seller@nearmart.in", avatar: "RP", desc: "Manage orders & inventory" },
    { role: "vendor", name: "Vendor Demo", email: "demo.vendor@nearmart.in", avatar: "GF", desc: "Supply chain & bulk orders" },
    { role: "delivery", name: "Delivery Demo", email: "demo.delivery@nearmart.in", avatar: "VS", desc: "Accept & fulfill deliveries" },
    { role: "support", name: "Support Demo", email: "demo.support@nearmart.in", avatar: "MJ", desc: "Resolve tickets & disputes" },
    { role: "admin", name: "Admin Demo", email: "demo.admin@nearmart.in", avatar: "AN", desc: "Platform intelligence & controls" },
];

// Keep USERS_DB export for backward compatibility (AdminDashboard, LoginPage)
export const USERS_DB = DEMO_ROLES;

// ── Roles that can access SCM ──────────────────────────────────────────────────
export const SCM_ALLOWED_ROLES = ["seller", "admin"];

// ── Permission Map ─────────────────────────────────────────────────────────────
export const PERMISSIONS = {
    canViewCostPrice: ["seller", "vendor", "admin"],
    canViewProfitMargins: ["seller", "vendor", "admin"],
    canViewSystemLogs: ["admin"],
    canViewAllOrders: ["admin"],
    canViewAllUsers: ["admin"],
    canAccessSCM: ["seller", "vendor", "admin", "support"],
    canAcceptOrders: ["seller"],
    canStartDelivery: ["delivery"],
    canMarkDelivered: ["delivery"],
    canResolveTickets: ["support", "admin"],
    canManageProducts: ["seller", "admin"],
    canBulkFulfill: ["vendor"],
    canViewFinance: ["seller", "vendor", "admin"],
    canEscalateTickets: ["support", "admin"],
    canDismissAlerts: ["admin"],
};

export function hasPermission(role, permission) {
    return PERMISSIONS[permission]?.includes(role) ?? false;
}

// ── Context ────────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // Initial session restore

    // ── Session Restore on Mount ────────────────────────────────────────────
    useEffect(() => {
        const restoreSession = async () => {
            const token = api.getAccessToken();
            if (!token) {
                // Try to load from localStorage cache for instant render
                try {
                    const cached = localStorage.getItem("nm_session");
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        setUser(parsed);
                    }
                } catch { /* ignore */ }
                setLoading(false);
                // If we have a cached user but also a token, verify with backend
                const storedToken = localStorage.getItem("nm_access_token");
                if (storedToken) {
                    try {
                        const res = await api.get("/auth/me");
                        if (res.ok && res.user) {
                            setUser(res.user);
                            cacheUser(res.user);
                        } else {
                            // Token invalid — clear everything
                            performLocalLogout();
                        }
                    } catch {
                        performLocalLogout();
                    }
                }
                return;
            }

            try {
                const res = await api.get("/auth/me");
                if (res.ok && res.user) {
                    setUser(res.user);
                    cacheUser(res.user);
                } else {
                    performLocalLogout();
                }
            } catch {
                // Offline — use cached session
                try {
                    const cached = localStorage.getItem("nm_session");
                    if (cached) setUser(JSON.parse(cached));
                } catch { /* ignore */ }
            }
            setLoading(false);
        };

        restoreSession();

        // Listen for forced logout from api/client.js (on refresh token failure)
        const handleForcedLogout = () => {
            setUser(null);
            localStorage.removeItem("nm_session");
        };
        window.addEventListener("nm:logout", handleForcedLogout);
        return () => window.removeEventListener("nm:logout", handleForcedLogout);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Cache user in localStorage (for instant restore, NOT for auth) ───────
    const cacheUser = (u) => {
        try {
            if (u) localStorage.setItem("nm_session", JSON.stringify(u));
            else localStorage.removeItem("nm_session");
        } catch { /* ignore */ }
    };

    // ── Local logout (clear everything) ─────────────────────────────────────
    const performLocalLogout = () => {
        setUser(null);
        api.clearTokens();
        localStorage.removeItem("nm_session");
        localStorage.removeItem("nm_otp_lock");
    };

    // ── Login (email + password → backend) ──────────────────────────────────
    const login = useCallback(async (email, password) => {
        try {
            const res = await api.post("/auth/login", {
                email: email.trim().toLowerCase(),
                password,
            });
            if (res.ok && res.user) {
                api.setTokens(res.accessToken, res.refreshToken);
                setUser(res.user);
                cacheUser(res.user);
                return { ok: true, user: res.user };
            }
            return { ok: false, error: res.error || "Invalid email or password" };
        } catch (err) {
            return { ok: false, error: "Network error" };
        }
    }, []);

    // ── Signup (name, email, password, role → backend) ──────────────────────
    const signup = useCallback(async (name, email, password, role) => {
        try {
            const res = await api.post("/auth/register", {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
                role,
            });
            if (res.ok && res.user) {
                api.setTokens(res.accessToken, res.refreshToken);
                setUser(res.user);
                cacheUser(res.user);
                return { ok: true, user: res.user };
            }
            return { ok: false, error: res.error || "Registration failed" };
        } catch (err) {
            return { ok: false, error: "Network error" };
        }
    }, []);

    // ── Demo Login (one-click → backend /auth/demo/:role) ───────────────────
    const loginAsRole = useCallback(async (role) => {
        try {
            const res = await api.post(`/auth/demo/${role}`);
            if (res.ok && res.user) {
                api.setTokens(res.accessToken, res.refreshToken);
                setUser(res.user);
                cacheUser(res.user);
                return { ok: true, user: res.user };
            }
            return { ok: false, error: res.error || "Demo login failed" };
        } catch (err) {
            return { ok: false, error: "Network error" };
        }
    }, []);

    // ── Google Login ────────────────────────────────────────────────────────
    const loginWithGoogle = useCallback(async (token, role) => {
        try {
            const res = await api.post("/auth/google", { token, role });
            if (res.ok && res.user) {
                api.setTokens(res.accessToken, res.refreshToken);
                setUser(res.user);
                cacheUser(res.user);
                return { ok: true, user: res.user, isNewUser: res.isNewUser };
            }
            return { ok: false, error: res.error || "Google login failed" };
        } catch (err) {
            return { ok: false, error: "Network error" };
        }
    }, []);

    // ── Logout ──────────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
        try { await api.post("/auth/logout"); } catch { /* ignore */ }
        performLocalLogout();
    }, []);

    // ── Refresh User (re-fetch from backend, e.g. after verification) ───────
    const refreshUser = useCallback(async () => {
        try {
            const res = await api.get("/auth/me");
            if (res.ok && res.user) {
                setUser(res.user);
                cacheUser(res.user);
                return res.user;
            }
        } catch { /* ignore */ }
        return null;
    }, []);

    // ── Update Profile ──────────────────────────────────────────────────────
    const updateUser = useCallback(async (fields) => {
        try {
            const res = await api.patch("/auth/profile", fields);
            if (res.ok && res.user) {
                setUser(res.user);
                cacheUser(res.user);
                return { ok: true, user: res.user };
            }
            return { ok: false, error: res.error || "Update failed" };
        } catch {
            return { ok: false, error: "Network error" };
        }
    }, []);

    // ── Change Password ─────────────────────────────────────────────────────
    const changePassword = useCallback(async (oldPassword, newPassword) => {
        try {
            const res = await api.post("/auth/change-password", { oldPassword, newPassword });
            if (res.ok) return { ok: true };
            return { ok: false, error: res.error || "Password change failed" };
        } catch {
            return { ok: false, error: "Network error" };
        }
    }, []);

    // ── Permission Check ────────────────────────────────────────────────────
    const can = useCallback((permission) => {
        if (!user) return false;
        return hasPermission(user.role, permission);
    }, [user]);

    return (
        <AuthContext.Provider value={{
            user,
            role: user?.role ?? null,
            isAuthenticated: !!user,
            loading,
            login,
            signup,
            loginAsRole,
            loginWithGoogle,
            logout,
            refreshUser,
            can,
            updateUser,
            changePassword,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
    return ctx;
}
