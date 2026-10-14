import { defineConfig } from "vite";
const apiPort = process.env.GLADS_API_PORT || "8765";
export default defineConfig({
  server: { proxy: { "/api": `http://127.0.0.1:${apiPort}` } },
});
