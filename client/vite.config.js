import { defineConfig } from 'vite';

export default defineConfig({
  root: './src/pages',  // New root directory
  publicDir: '../../public',  // Points to public directory
  server: {
    open: true,
  },
  build: {
    outDir: '../../dist',  // Output directory
    rollupOptions: {
      input: {
        main: 'src/pages/index.html',
        register: 'src/pages/submit.html',
        thankYou: 'src/pages/thank-you.html',
        terms: 'src/pages/terms.html',
        tourDetails: 'src/pages/tour-details.html',
        privacy: 'src/pages/privacy.html'

      }
    }
  }
});
