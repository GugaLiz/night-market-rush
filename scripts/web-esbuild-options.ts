import {transformWithEsbuild} from 'vite';

/** Browser-safe shared modules are inside the Creator project, whose tsconfig
 * extends a generated, ignored editor file. A clean checkout has no editor
 * cache. Compile only those modules with the same relevant Creator 3.8.8
 * options instead of asking Vite to traverse the missing editor tsconfig.
 * Other Web sources retain their own existing root tsconfig. This is not a
 * replacement for Creator type checking or a Creator game build. */
const cocosSource=/[\\/]cocos[\\/]assets[\\/]scripts[\\/].*\.ts(?:\?.*)?$/;
const creatorTransform=JSON.stringify({compilerOptions:{target:'ES2015',experimentalDecorators:true}});

export const webEsbuildOptions={exclude:cocosSource};
export function sharedCocosWebTransform(){
  return {
    name:'shared-cocos-web-transform',
    enforce:'pre' as const,
    async transform(code:string,id:string){
      if(!cocosSource.test(id))return null;
      return transformWithEsbuild(code,id,{loader:'ts',tsconfigRaw:creatorTransform});
    },
  };
}
