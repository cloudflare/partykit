import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import devtoolsJson from "vite-plugin-devtools-json";

export default defineConfig({
  plugins: [cloudflare(), react(), devtoolsJson()]
});
