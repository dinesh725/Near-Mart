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
import { WebLandingPage } from "./pages/public/WebLandingPage";
import { MobileIntro } from "./pages/public/MobileIntro";
import { App as CapApp } from '@capacitor/app';

// ── Capacitor detection ─────────────────────────────────────────────────────
const isCapacitorNative = () => {
  try {
    return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  } catch { return false; }
};

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
      // Prevent rapid fire loops if COOP headers or other issues cause focus bouncing
      const now = Date.now();
      if (isActive && (!window._lastResumeTime || now - window._lastResumeTime > 5000)) {
        window._lastResumeTime = now;
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

  const [hash, setHash] = useState(window.location.hash || "");
  const search = window.location.search || "";
  const pathname = window.location.pathname || "";

  React.useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Show loading screen during session restore
  if (loading) return <LoadingFallback />;

  if (hash.includes("verify-email") || search.includes("verify-email") || pathname.includes("verify-email")) {
    return <EmailVerifyPage />;
  }

  if (!isAuthenticated) {
    const isNative = isCapacitorNative();
    const wantsLogin = hash.includes("login") || search.includes("login");
    const wantsSignup = hash.includes("signup");

    // Extract target role from hash (e.g. #signup-seller -> seller)
    let prefillRole = "customer";
    if (wantsSignup && hash.includes("-")) {
        prefillRole = hash.split("-")[1];
    }
    
    const wantsAuth = wantsLogin || wantsSignup;

    // ── BROWSER WEB: Serve the jaw-dropping marketing Landing Page if they haven't meant to login
    if (!isNative && !wantsAuth) {
      return <WebLandingPage />;
    }
    
    // ── NATIVE APP: Cinematic Mobile Onboarding
    const hasSeenIntro = localStorage.getItem("nearmart_intro_complete");
    if (isNative && !wantsAuth && !hasSeenIntro) {
      return (
        <MobileIntro 
          onComplete={(selectedRole) => {
              localStorage.setItem("nearmart_intro_complete", "true");
              window.location.hash = "signup-" + selectedRole;
          }} 
        />
      );
    }

    return <LoginPage initialTab={wantsSignup ? "signup" : "signin"} initialRole={prefillRole} />;
  }

  // Determine if this role can access SCM
  const canAccessSCM = SCM_ALLOWED_ROLES.includes(role);

  // ── VERIFICATION GATE ──
  // Block access for unverified users (admin/support exempt)
  const isContactVerified = user?.emailVerified || user?.phoneVerified;
  const requiresKyc = ["seller", "vendor", "delivery"].includes(role);
  const isKycVerified = user?.kycStatus === "VERIFIED";

  let isVerified = false;
  if (role === "admin" || role === "support" || role === "super_admin") {
    isVerified = true;
  } else if (requiresKyc) {
    isVerified = isContactVerified && isKycVerified;
  } else {
    isVerified = isContactVerified;
  }

  if (!isVerified) {
    return (
      <GlobalStoreProvider>
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
        <Toaster position="bottom-center" toastOptions={{ style: { background: T.card, color: T.text, border: `1px solid ${T.border}`, fontFamily: "'Sora',sans-serif", fontSize: 13 } }} />
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
        <div className="mode-bar-brand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo-navbar.png" alt="NearMart" style={{ width: 22, height: 22, objectFit: "contain" }} />
          <span style={{ fontWeight: 800, color: "white", fontSize: 16, letterSpacing: ".5px", fontFamily: "'Sora', sans-serif" }}>NearMart</span>
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
