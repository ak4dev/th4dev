/* ==================================================
 * Application Entry Point
 * ================================================== */

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { bootstrapRouting } from "./routing";
import { globalStyles } from "../stitches.config";

// Normalise the origin and read the requested page before anything renders.
// A subdomain visit is redirected here; the render below still runs, because
// location.replace only schedules the navigation and a blocked one must not
// leave a blank page.
const { explicitPage, defaultPage } = bootstrapRouting();

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
    <ErrorBoundary>
      <App explicitPage={explicitPage} defaultPage={defaultPage} />
    </ErrorBoundary>
  </StrictMode>,
);
