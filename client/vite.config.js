import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        open: true,
    },
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                register: 'submit.html',
                thankYou: 'thank-you.html'
            }
        }
    }
});
