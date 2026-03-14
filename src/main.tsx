/* ==================================================
 * Application Entry Point
 * ================================================== */

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { globalStyles } from "../stitches.config";

// Apply global styles before first render
globalStyles();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
