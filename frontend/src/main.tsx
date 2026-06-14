import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AdminApp } from "./admin/AdminApp.tsx";
import { queryKeys } from "./api/queries";
import { consumeSessionFromUrlHash, getAuthToken } from "./lib/auth-token";
import { queryClient } from "./lib/query-client";
import { Analytics } from "@vercel/analytics/react";

if (consumeSessionFromUrlHash() || getAuthToken()) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.me });
}

const isAdminRoute = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Analytics />
      {isAdminRoute ? <AdminApp /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
);
