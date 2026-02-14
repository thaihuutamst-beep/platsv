import Modal from "react-modal";
Modal.setAppElement("#root");

import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastContainer } from "./utils/toast";
import "./index.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(
    <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
            <App />
            <ToastContainer />
        </QueryClientProvider>
    </ErrorBoundary>
);

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW registered:', reg);
        }).catch(err => {
            console.log('SW registration failed:', err);
        });
    });
}