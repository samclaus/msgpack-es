/// <reference types="vitest" />

import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            formats: ['es'],
            entry: resolve(__dirname, 'src/index.ts'),
        },
    },
    plugins: [dts({ rollupTypes: true })],
});
