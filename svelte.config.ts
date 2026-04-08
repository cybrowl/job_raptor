import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import type { Config } from "@sveltejs/kit";

const config: Config = {
  preprocess: vitePreprocess(),
  kit: {
    files: {
      assets: "src/ui/assets",
      lib: "src/ui/lib",
      routes: "src/ui/routes",
      appTemplate: "src/ui/app.html",
    },
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
      precompress: true,
      strict: false,
    }),
  },
};

export default config;
