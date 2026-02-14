import React, { useState, useEffect, useCallback } from "react";

/**
 * Lightweight toast notification system.
 * No external dependencies required.
 */

type ToastType = "error" | "success" | "info" | "warning";

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    duration: number;
}

let toastId = 0;
let addToastFn: ((toast: Toast) => void) | null = null;

/** Show a toast notification from anywhere (including non-React code like interceptors) */
export function showToast(message: string, type: ToastType = "info", duration = 4000) {
    const toast: Toast = { id: ++toastId, message, type, duration };
    if (addToastFn) {
        addToastFn(toast);
    } else {
        // Fallback if ToastContainer not mounted yet
        console.warn(`[Toast:${type}] ${message}`);
    }
}

/** Convenience helpers */
export const toast = {
    error: (msg: string, dur?: number) => showToast(msg, "error", dur || 5000),
    success: (msg: string, dur?: number) => showToast(msg, "success", dur),
    info: (msg: string, dur?: number) => showToast(msg, "info", dur),
    warning: (msg: string, dur?: number) => showToast(msg, "warning", dur || 5000),
};

/** React component — mount once at app root */
export function ToastContainer() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((t: Toast) => {
        setToasts(prev => {
            // Deduplicate: don't show same message twice
            if (prev.some(existing => existing.message === t.message)) return prev;
            // Keep max 5 toasts
            const next = [...prev, t];
            return next.length > 5 ? next.slice(-5) : next;
        });
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Register global add function
    useEffect(() => {
        addToastFn = addToast;
        return () => { addToastFn = null; };
    }, [addToast]);

    // Auto-dismiss
    useEffect(() => {
        toasts.forEach(t => {
            const timer = setTimeout(() => removeToast(t.id), t.duration);
            return () => clearTimeout(timer);
        });
    }, [toasts, removeToast]);

    if (toasts.length === 0) return null;

    return (
        <div style={containerStyle}>
            {toasts.map(t => (
                <div
                    key={t.id}
                    style={{ ...toastStyle, ...typeStyles[t.type] }}
                    onClick={() => removeToast(t.id)}
                >
                    <span style={iconStyle}>{typeIcons[t.type]}</span>
                    <span style={messageStyle}>{t.message}</span>
                    <span style={closeStyle}>✕</span>
                </div>
            ))}
        </div>
    );
}

const typeIcons: Record<ToastType, string> = {
    error: "❌",
    success: "✅",
    info: "ℹ️",
    warning: "⚠️",
};

const containerStyle: React.CSSProperties = {
    position: "fixed",
    top: "1rem",
    right: "1rem",
    zIndex: 99999,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    maxWidth: "380px",
    width: "100%",
    pointerEvents: "none",
};

const toastStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.75rem 1rem",
    borderRadius: "10px",
    fontSize: "0.85rem",
    fontFamily: "Inter, system-ui, sans-serif",
    backdropFilter: "blur(12px)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    cursor: "pointer",
    pointerEvents: "auto",
    animation: "toast-slide-in 0.3s ease-out",
};

const typeStyles: Record<ToastType, React.CSSProperties> = {
    error: {
        background: "rgba(248, 81, 73, 0.15)",
        border: "1px solid rgba(248, 81, 73, 0.4)",
        color: "#ff7b72",
    },
    success: {
        background: "rgba(63, 185, 80, 0.15)",
        border: "1px solid rgba(63, 185, 80, 0.4)",
        color: "#3fb950",
    },
    info: {
        background: "rgba(88, 166, 255, 0.15)",
        border: "1px solid rgba(88, 166, 255, 0.4)",
        color: "#58a6ff",
    },
    warning: {
        background: "rgba(210, 153, 34, 0.15)",
        border: "1px solid rgba(210, 153, 34, 0.4)",
        color: "#d29922",
    },
};

const iconStyle: React.CSSProperties = { fontSize: "1rem", flexShrink: 0 };
const messageStyle: React.CSSProperties = { flex: 1, lineHeight: 1.4 };
const closeStyle: React.CSSProperties = { opacity: 0.5, fontSize: "0.75rem", flexShrink: 0 };
