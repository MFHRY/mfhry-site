import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://mfhry.store',
  output: 'static',
  build: {
    format: 'directory',
  },
});
