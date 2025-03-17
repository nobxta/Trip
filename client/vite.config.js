import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: './src/pages', // Ensures Vite starts from pages directory
  publicDir: path.resolve(__dirname, 'public'), 
  server: {
    open: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'), // Ensures output is inside dist
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/pages/index.html'),
        register: path.resolve(__dirname, 'src/pages/submit.html'),
        thankYou: path.resolve(__dirname, 'src/pages/thank-you.html'),
        terms: path.resolve(__dirname, 'src/pages/terms.html'),
        tourDetails: path.resolve(__dirname, 'src/pages/tour-details.html'),
        privacy: path.resolve(__dirname, 'src/pages/privacy.html'),  // Ensure privacy.html is built
        registrationCheck: path.resolve(__dirname, 'src/pages/booking.html')
      }
    }
  }
});
