import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Prefer TypeScript sources over committed `.js` duplicates in `src/pages/`
  // (default order resolves `.js` before `.tsx`, which shadowed the real pages).
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts", ".json"]
  }
});
