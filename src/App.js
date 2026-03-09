import React, { useState, Suspense, lazy } from "react";
import { Toaster, toast } from "react-hot-toast";
import { GLOBAL_CSS, T } from "./theme/theme";
import { AuthProvider, useAuth, SCM_ALLOWED_ROLES } from "./auth/AuthContext";
import { GlobalStoreProvider } from "./context/GlobalStore";
import { LoginPage } from "./pages/auth/LoginPage";
import { SCMAccessDenied } from "./components/SCMAccessDenied";
import { GlobalNotifStack } from "./components/GlobalNotifStack";
import { OfflineBanner } from "./components/OfflineBanner";
import { LoadingFallback } from "./components/LoadingFallback";
import { ErrorBoundary } from "./components/ErrorBoundary";
import useBackButton from "./hooks/useBackButton";
import { usePushNotifications } from "./hooks/usePushNotifications";
import useNativePermissions from "./hooks/useNativePermissions";
import { VerificationGate } from "./pages/auth/VerificationGate";
import { EmailVerifyPage } from "./pages/auth/EmailVerifyPage";
import { App as CapApp } from '@capacitor/app';

// ── Code-split heavy route chunks ───────────────────────────────────────────
const PlatformShell = lazy(() =>
  import("./pages/platform/PlatformShell").then((m) => ({ default: m.PlatformShell }))
);
const SCMModule = lazy(() =>
  import("./pages/scm/SCMModule").then((m) => ({ default: m.SCMModule }))
);

// Inner app — needs auth context to be mounted
function AppInner() {
  const { isAuthenticated, user, role, logout, refreshUser, loading } = useAuth();
  const [mode, setMode] = useState(() => {
    try {
      const saved = sessionStorage.getItem("nearmart_mode");
      if (saved === "platform" || saved === "scm") return saved;
    } catch { /* ignore */ }
    return "platform";
  });

  // Persist mode across refresh
  React.useEffect(() => {
    try { sessionStorage.setItem("nearmart_mode", mode); }
    catch { /* ignore */ }
  }, [mode]);

  // ── Mobile-native hooks ─────────────────────────────────────────────────
  useBackButton((msg, opts) => toast(msg, opts));
  const { showBanner, dismissBanner } = useNativePermissions();

  React.useEffect(() => {
    // ── MOBILE SESSION & BACKGROUND RELIABILITY ──
    // Ensure verification and socket state restore seamlessly on resume
    const appStateListener = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log("App resumed. Restoring session state...");
        if (isAuthenticated) {
          try { await refreshUser(); } catch { /* ignore */ }
        }
      }
    });
    return () => {
      appStateListener.then(listener => listener.remove());
    };
  }, [isAuthenticated, refreshUser]);

  usePushNotifications();

  // Show loading screen during session restore
  if (loading) return <LoadingFallback />;

  // ── EMAIL VERIFICATION ROUTE (accessible without auth) ──
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const pathname = window.location.pathname || "";
  if (hash.includes("verify-email") || search.includes("verify-email") || pathname.includes("verify-email")) {
    return <EmailVerifyPage />;
  }

  if (!isAuthenticated) return <LoginPage />;

  // Determine if this role can access SCM
  const canAccessSCM = SCM_ALLOWED_ROLES.includes(role);

  // ── VERIFICATION GATE ──
  // Block access for unverified users (admin/support exempt)
  const isVerified = user?.emailVerified || user?.phoneVerified || role === "admin" || role === "support";

  if (!isVerified) {
    return (
      <GlobalStoreProvider>
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
        <Toaster position="bottom-center" />
        <VerificationGate />
      </GlobalStoreProvider>
    );
  }

  const renderContent = () => {
    if (mode === "scm") {
      return canAccessSCM ? <SCMModule /> : <SCMAccessDenied />;
    }
    return <PlatformShell />;
  };

  return (
    <GlobalStoreProvider>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />

      {/* Offline/online awareness banner */}
      <OfflineBanner />

      {/* Permission denial banner */}
      {showBanner && (
        <div style={{ background: '#f59e0b22', border: '1px solid #f59e0b', borderRadius: 10, padding: '10px 14px', margin: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span>⚠️</span>
          <span style={{ flex: 1 }}>Some permissions were denied. Location and notifications may not work.</span>
          <button onClick={dismissBanner} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Global floating notification stack — above everything */}
      <GlobalNotifStack />

      {/* Toast container */}
      <Toaster position="bottom-center" toastOptions={{ style: { background: T.card, color: T.text, border: `1px solid ${T.border}`, fontFamily: "'Sora',sans-serif", fontSize: 13 } }} />

      <div className="mode-bar">
        <div className="mode-bar-brand">
          <span style={{ fontWeight: 800, color: T.gold, fontSize: 15, letterSpacing: ".5px" }}>NearMart</span>
        </div>
        <div className="mode-bar-btns">
          <button className={`mode-btn ${mode === "platform" ? "active" : ""}`} onClick={() => setMode("platform")}>
            🌐 Platform
          </button>
          {/* SCM tab: only visible to authorised roles */}
          {canAccessSCM && (
            <button className={`mode-btn ${mode === "scm" ? "active" : ""}`} onClick={() => setMode("scm")}>
              ⛓ SCM
            </button>
          )}
        </div>
        <div className="mode-bar-ver">
          <span className="mode-bar-user">{user?.name} ({user?.role})</span>
          <button onClick={logout}
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: T.textDim, fontSize: 10, padding: "2px 8px", cursor: "pointer", fontFamily: "'Sora',sans-serif", letterSpacing: .3, flexShrink: 0, minHeight: 28 }}>
            Logout
          </button>
        </div>
      </div>

      <div className="mode-content">
        <Suspense fallback={<LoadingFallback />}>
          {renderContent()}
        </Suspense>
      </div>
    </GlobalStoreProvider>
  );
}

export default function NearMartApp() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </AuthProvider>
  );
}
