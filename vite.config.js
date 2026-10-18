import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "localhost",
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: true,
    // Same-origin API in development so the session cookie stays first-party (SameSite=Strict).
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.PORT || 4000}`,
        changeOrigin: false,
      },
    },
  },
});
