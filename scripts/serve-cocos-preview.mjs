import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createStaticServer} from './serve.mjs';

const ENTRY=fileURLToPath(import.meta.url);
const ROOT=path.resolve(path.dirname(ENTRY),'..');
const RUNTIME=path.join(ROOT,'.runtime');
const METADATA=path.join(RUNTIME,'cocos-preview.json');
const SERVICE='night-market-rush-cocos-preview-v1';
const BASE='/cocos-preview/';

async function main(){
  const args=process.argv.slice(2);
  const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
  const build=option('--build',''),port=Number(option('--port','45590'));
  if(!/^[a-zA-Z0-9_-]+$/.test(build))throw new Error('Provide a valid Creator build directory name');
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port');
  const buildRoot=await fs.realpath(path.join(ROOT,'cocos','build'));
  const root=await fs.realpath(path.join(buildRoot,build));
  const relative=path.relative(buildRoot,root);
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Build resolves outside cocos/build');
  try{
    await fs.access(path.join(root,'candidate-build.json'));
    throw new Error('Storage-enabled candidates require an isolated test profile');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const {server,projectId,instance}=await createStaticServer({root,projectRoot:ROOT,instance:randomUUID(),serviceId:SERVICE,urlBase:BASE});
  await fs.mkdir(RUNTIME,{recursive:true});
  // Exclusive creation prevents two starts on different ports from replacing ownership.
  const lock=await fs.open(METADATA,'wx');
  const metadata={service:SERVICE,pid:process.pid,projectRoot:ROOT,entryPath:ENTRY,build,root,projectId,instance,port,host:'127.0.0.1',base:BASE,startedAt:new Date().toISOString()};
  let listening=false;
  try{
    await lock.writeFile(JSON.stringify(metadata,null,2));
    await lock.close();
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    listening=true;
  }catch(error){
    try{await lock.close();}catch{}
    try{const saved=JSON.parse(await fs.readFile(METADATA,'utf8'));if(saved.instance===instance)await fs.unlink(METADATA);}catch{}
    throw error;
  }
  if(listening)console.log(`Cocos DEVELOPMENT PROTOTYPE (${build}): http://127.0.0.1:${port}${BASE}`);
  let closing=false;
  const shutdown=async()=>{
    if(closing)return;closing=true;
    server.close(()=>process.exit(0));server.closeIdleConnections?.();
    try{const saved=JSON.parse(await fs.readFile(METADATA,'utf8'));if(saved.instance===instance&&saved.pid===process.pid)await fs.unlink(METADATA);}catch{}
    setTimeout(()=>process.exit(0),2000).unref();
  };
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
main().catch(error=>{console.error(`Cannot start Cocos development preview: ${error.code==='EADDRINUSE'?'port is in use; no process was stopped':error.code==='EEXIST'?'preview metadata already exists; inspect or stop the managed preview':error.message}`);process.exitCode=1;});
