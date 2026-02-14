import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallbackMessage?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary that catches React rendering errors and shows a recovery UI
 * instead of a white screen of death.
 */
export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({ errorInfo });
        console.error("[ErrorBoundary] Caught:", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleDismiss = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={styles.container}>
                    <div style={styles.card}>
                        <div style={styles.icon}>⚠️</div>
                        <h2 style={styles.title}>Đã xảy ra lỗi</h2>
                        <p style={styles.message}>
                            {this.props.fallbackMessage ||
                                "Ứng dụng gặp sự cố. Bạn có thể thử tải lại trang hoặc bỏ qua lỗi này."}
                        </p>
                        {this.state.error && (
                            <details style={styles.details}>
                                <summary style={styles.summary}>Chi tiết lỗi</summary>
                                <pre style={styles.pre}>
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}
                        <div style={styles.buttons}>
                            <button onClick={this.handleReload} style={styles.primaryBtn}>
                                🔄 Tải lại trang
                            </button>
                            <button onClick={this.handleDismiss} style={styles.secondaryBtn}>
                                ✕ Bỏ qua
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        background: "var(--bg-primary, #0d1117)",
        color: "var(--text-primary, #f0f6fc)",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "1rem",
    },
    card: {
        background: "var(--bg-secondary, #161b22)",
        borderRadius: "16px",
        padding: "2rem",
        maxWidth: "480px",
        width: "100%",
        textAlign: "center" as const,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        border: "1px solid var(--border-color, #30363d)",
    },
    icon: {
        fontSize: "3rem",
        marginBottom: "0.5rem",
    },
    title: {
        fontSize: "1.25rem",
        fontWeight: 600,
        margin: "0 0 0.5rem",
    },
    message: {
        color: "var(--text-secondary, #c9d1d9)",
        fontSize: "0.9rem",
        lineHeight: 1.5,
        margin: "0 0 1rem",
    },
    details: {
        textAlign: "left" as const,
        marginBottom: "1rem",
    },
    summary: {
        cursor: "pointer",
        fontSize: "0.8rem",
        color: "var(--text-muted, #8b949e)",
    },
    pre: {
        fontSize: "0.75rem",
        background: "var(--bg-tertiary, #21262d)",
        padding: "0.75rem",
        borderRadius: "8px",
        overflow: "auto",
        maxHeight: "150px",
        marginTop: "0.5rem",
        whiteSpace: "pre-wrap" as const,
        wordBreak: "break-word" as const,
    },
    buttons: {
        display: "flex",
        gap: "0.75rem",
        justifyContent: "center",
    },
    primaryBtn: {
        background: "var(--accent-color, #58a6ff)",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        padding: "0.6rem 1.2rem",
        fontSize: "0.9rem",
        fontWeight: 500,
        cursor: "pointer",
    },
    secondaryBtn: {
        background: "transparent",
        color: "var(--text-secondary, #c9d1d9)",
        border: "1px solid var(--border-color, #30363d)",
        borderRadius: "8px",
        padding: "0.6rem 1.2rem",
        fontSize: "0.9rem",
        cursor: "pointer",
    },
};
