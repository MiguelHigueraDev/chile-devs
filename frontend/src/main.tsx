import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { queryClient } from "./lib/query-client";
import { Analytics } from "@vercel/analytics/react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Analytics />
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
