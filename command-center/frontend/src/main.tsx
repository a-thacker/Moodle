import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/nocturne.css"; // design tokens + component classes (first)
import "./styles/app.css"; // app-level interaction styles (override after)
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
