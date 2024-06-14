/// <reference types="vitest" />

import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            formats: ['es', 'cjs'],
            fileName: (format) => format === 'cjs' ? 'index.cjs' : 'index.mjs', // Need function otherwise it produces 'index.mjs.js'!
            entry: resolve(__dirname, 'src/index.ts'),
        },
    },
    plugins: [dts({ rollupTypes: true })],
});
