/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// El worker de libarchive carga su .wasm relativo a sí mismo: se emiten juntos.
const libarchiveAssets = (): Plugin => ({
  name: 'libarchive-assets',
  apply: 'build',
  generateBundle() {
    for (const f of ['worker-bundle.js', 'libarchive.wasm']) {
      this.emitFile({
        type: 'asset',
        fileName: `libarchive/${f}`,
        source: readFileSync(`node_modules/libarchive.js/dist/${f}`),
      });
    }
  },
});

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    libarchiveAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Comic Reader',
        short_name: 'Comic Reader',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
