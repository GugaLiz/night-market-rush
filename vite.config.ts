import {defineConfig} from 'vite';
import {sharedCocosWebTransform,webEsbuildOptions} from './scripts/web-esbuild-options';
export default defineConfig({base:'./',plugins:[sharedCocosWebTransform()],esbuild:webEsbuildOptions,server:{host:'0.0.0.0',port:5173},build:{target:'es2022',sourcemap:true}});
