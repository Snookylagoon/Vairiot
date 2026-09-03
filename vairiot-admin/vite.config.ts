import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // Guard against two Reacts in the module graph.
    //
    // During the React 19 upgrade npm left an 18 hoisted at the root while the
    // frontends nested 19, so @testing-library/react — hoisted beside the root
    // copy — rendered with react-dom 18 the elements that web's React 19 had
    // created. React reports that as "Objects are not valid as a React child",
    // which reads like a component bug and is not one.
    //
    // The actual fix was a root `overrides` entry pinning react and react-dom
    // to 19 (npm needed the lockfile regenerated before it took effect). This
    // is belt and braces: it did NOT resolve that failure on its own, but it
    // keeps a future hoisting change from reintroducing the same trap.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 3002,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
