/* ==================================================
 * Application Entry Point
 * ================================================== */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { globalStyles } from "../stitches.config";

// Apply global styles
globalStyles();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
