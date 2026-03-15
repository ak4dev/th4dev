import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    mkcert({
      hosts: ["f.local.dev", "local.dev", "localhost", "127.0.0.1"],
    }),
  ],
  server: {
    host: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"], // <- ensures only one React instance
  },
});
