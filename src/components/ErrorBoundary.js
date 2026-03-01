import React from "react";
import { P } from "../theme/theme";

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error("[ErrorBoundary] Caught:", error, info.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: "100vh", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", background: P.bg,
                    color: P.text, fontFamily: "'Sora', sans-serif", padding: 24, textAlign: "center"
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Something went wrong</h1>
                    <p style={{ color: P.textMuted, fontSize: 14, marginBottom: 24, maxWidth: 400 }}>
                        An unexpected error occurred. Please try again or refresh the page.
                    </p>
                    {process.env.NODE_ENV === "development" && this.state.error && (
                        <pre style={{
                            background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12,
                            padding: 16, fontSize: 12, color: P.danger, maxWidth: 600, overflow: "auto",
                            marginBottom: 24, textAlign: "left", whiteSpace: "pre-wrap"
                        }}>
                            {this.state.error.toString()}
                        </pre>
                    )}
                    <div style={{ display: "flex", gap: 12 }}>
                        <button onClick={this.handleRetry} style={{
                            background: P.primary, color: "white", border: "none", borderRadius: 10,
                            padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                            fontFamily: "'Sora', sans-serif"
                        }}>
                            Try Again
                        </button>
                        <button onClick={() => window.location.reload()} style={{
                            background: P.surface, color: P.textMuted, border: `1px solid ${P.border}`,
                            borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700,
                            cursor: "pointer", fontFamily: "'Sora', sans-serif"
                        }}>
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
