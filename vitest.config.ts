import {defineConfig} from 'vitest/config';
import {sharedCocosWebTransform,webEsbuildOptions} from './scripts/web-esbuild-options';
export default defineConfig({plugins:[sharedCocosWebTransform()],esbuild:webEsbuildOptions,test: {include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**']}});
