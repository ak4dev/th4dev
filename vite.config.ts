import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";

/*
 * HTTPS in dev is opt-in.
 *
 * vite-plugin-mkcert downloads the mkcert binary and runs `mkcert -install`,
 * which writes a root CA into the machine's trust stores and usually wants
 * sudo. Plain `http://localhost` is already a secure context, so nothing in
 * the app needs TLS locally; only the documented `.dev` subdomain flow does,
 * because browsers HSTS-preload the whole `.dev` TLD. That flow has its own
 * script: `npm run dev:https` (README, "Local Subdomain Testing").
 */
const httpsDev = process.env.TH4_HTTPS === "1";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(httpsDev
      ? [
          mkcert({
            hosts: ["f.local.dev", "local.dev", "localhost", "127.0.0.1"],
          }),
        ]
      : []),
  ],
  server: {
    host: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"], // <- ensures only one React instance
  },
  build: {
    rolldownOptions: {
      output: {
        /*
         * Vendor chunking, for cache retention rather than for a smaller
         * total. `assets/` ships with a one-year immutable cache header
         * (infra/lib/static-site-stack.ts), which only pays off when hashed
         * names survive a deploy. Without these groups every dependency sits
         * in the entry chunk, so a one-line source edit rewrites its hash and
         * returning visitors re-download React, Recharts and Radix as well.
         *
         * Rules of the road:
         * - Groups are matched highest `priority` first, and a module claimed
         *   by one group is removed from the others, so `react` wins over the
         *   Radix and chart packages that depend on it.
         * - Every `test` names its packages explicitly. There is deliberately
         *   NO catch-all `node_modules` group: that would re-merge exactly
         *   what these groups separate, and reintroduce the load-order hazard
         *   of one giant vendor chunk.
         * - `[\\/]` rather than `/` so the regexes hold on Windows paths.
         */
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|loose-envify|js-tokens)[\\/]/,
              priority: 40,
            },
            {
              name: "charts",
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|decimal\.js-light|fast-equals|eventemitter3|immer|reselect|redux|redux-thunk|react-redux|@reduxjs[\\/][^\\/]+|es-toolkit|tiny-invariant|clsx|lodash\.merge)[\\/]/,
              priority: 30,
            },
            {
              name: "radix",
              test: /node_modules[\\/](@radix-ui[\\/][^\\/]+|@floating-ui[\\/][^\\/]+|aria-hidden|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|get-nonce|detect-node-es|tslib)[\\/]/,
              priority: 20,
            },
            {
              name: "ui",
              test: /node_modules[\\/](@stitches[\\/][^\\/]+|date-fns)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
