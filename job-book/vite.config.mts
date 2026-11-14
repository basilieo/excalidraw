import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgrPlugin from "vite-plugin-svgr";

// The job book compiles the editor from this fork's source, the way
// excalidraw-app does, so changes under packages/ show up here without a
// package build.
const pkg = (p: string) => path.resolve(__dirname, "../packages", p);

const alias = [
  ["common", "common/src/index.ts", "common/src/$1"],
  ["element", "element/src/index.ts", "element/src/$1"],
  ["excalidraw", "excalidraw/index.tsx", "excalidraw/$1"],
  ["math", "math/src/index.ts", "math/src/$1"],
  ["utils", "utils/src/index.ts", "utils/src/$1"],
].flatMap(([name, main, sub]) => [
  { find: new RegExp(`^@excalidraw\\/${name}$`), replacement: pkg(main) },
  { find: new RegExp(`^@excalidraw\\/${name}\\/(.*?)`), replacement: pkg(sub) },
]);
alias.push(
  {
    find: /^@excalidraw\/fractional-indexing$/,
    replacement: pkg("fractional-indexing/src/index.ts"),
  },
  {
    find: /^@excalidraw\/laser-pointer$/,
    replacement: pkg("laser-pointer/src/index.ts"),
  },
);

// JOBBOOK_BASE is where the built files are served from (the fab library
// serves them at /static/jobbook/); JOBBOOK_OUT is where they are written.
export default defineConfig({
  base: process.env.JOBBOOK_BASE ?? "/",
  envDir: "../",
  resolve: { alias },
  server: { port: 3010 },
  plugins: [react(), svgrPlugin()],
  build: {
    outDir: process.env.JOBBOOK_OUT ?? "build",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // fixed names for the two files the host page links, so the fab
        // library's template does not need a manifest
        entryFileNames: "jobbook.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames(info) {
          const name = info.name ?? "";
          if (name.endsWith(".css")) {
            return "jobbook.css";
          }
          if (name.endsWith(".woff2")) {
            return `fonts/${name.split("-")[0]}/[name][extname]`;
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
