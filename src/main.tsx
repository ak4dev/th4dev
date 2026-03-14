/* ==================================================
 * Application Entry Point
 * ================================================== */

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { globalStyles } from "../stitches.config";

// Apply global styles before first render
globalStyles();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error(
    "Root element not found. Ensure a <div id='root'> exists in index.html.",
  );
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
