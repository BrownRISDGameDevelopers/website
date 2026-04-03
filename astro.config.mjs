import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://brownrisd.games",
  vite: {
    plugins: [tailwindcss()]
  },
  server: {
    host: true
  }
});
