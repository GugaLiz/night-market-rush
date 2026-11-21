import http from 'node:http';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const SERVICE_ID = 'night-market-rush-static-v1';
const ENTRY = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(ENTRY), '..');
const PID_FILE = path.join(PROJECT_ROOT, '.night-market-server.json');
const MIME = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.map':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.avif':'image/avif','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf',
  '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4',
  '.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json',
};

export function projectIdentity(root) {
  return createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,20);
}
function isInside(root, candidate) {
  const relative=path.relative(root,candidate);
  return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));
}

/** Exported for HTTP/security tests; CLI always serves this project's dist. */
export async function createStaticServer({root, projectRoot=PROJECT_ROOT, instance=randomUUID(), serviceId=SERVICE_ID, urlBase='/'}={}) {
  if(!root)throw new Error('A static root is required');
  if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(urlBase))throw new Error('Invalid URL base');
  const realRoot=await fsp.realpath(root);
  const indexPath=path.join(realRoot,'index.html');
  if(!(await fsp.stat(indexPath)).isFile())throw new Error('dist/index.html is required');
  const projectId=projectIdentity(projectRoot);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    const finish=(status,message)=>{
      if(res.headersSent){res.destroy();return;}
      res.statusCode=status;res.setHeader('Content-Type','text/plain; charset=utf-8');
      res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:message);
    };
    if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');finish(405,'Method not allowed');return;}
    let pathname;
    try{pathname=decodeURIComponent((req.url??'/').split('?')[0]);}catch{finish(400,'Malformed URL');return;}
    if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').some(part=>part==='..')){finish(403,'Forbidden path');return;}
    if(pathname==='/__night_market_health'){
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
      res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',service:serviceId,projectId,pid:process.pid,instance}));return;
    }
    if(urlBase!=='/'){
      if(pathname===urlBase.slice(0,-1)){res.statusCode=308;res.setHeader('Location',urlBase);res.end();return;}
      if(!pathname.startsWith(urlBase)){finish(404,'Not found');return;}
      pathname='/'+pathname.slice(urlBase.length);
    }
    if(pathname.split('/').some(part=>part.startsWith('.'))){finish(403,'Hidden files are not served');return;}
    let requested=path.resolve(realRoot,pathname.replace(/^\/+/,''));
    if(!isInside(realRoot,requested)){finish(403,'Forbidden path');return;}
    try{
      let info;
      try{
        info=await fsp.stat(requested);
        if(info.isDirectory()){requested=path.join(requested,'index.html');info=await fsp.stat(requested);}
      }catch(error){
        if(error?.code!=='ENOENT'&&error?.code!=='ENOTDIR')throw error;
        // Only extensionless application routes can fall back to the SPA.
        if(pathname==='/assets'||pathname.startsWith('/assets/')||path.extname(pathname)){finish(404,'Not found');return;}
        requested=indexPath;info=await fsp.stat(requested);
      }
      const realFile=await fsp.realpath(requested);
      if(!isInside(realRoot,realFile)){finish(403,'Forbidden symlink');return;}
      if(!info.isFile()){finish(404,'Not found');return;}
      const extension=path.extname(realFile).toLowerCase();
      const etag=`W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
      res.setHeader('ETag',etag);
      res.setHeader('Cache-Control',/[-.][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(path.basename(realFile))&&pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
      res.setHeader('Content-Type',MIME[extension]??'application/octet-stream');
      if(req.headers['if-none-match']===etag){res.statusCode=304;res.end();return;}
      res.setHeader('Content-Length',info.size);
      if(req.method==='HEAD'){res.end();return;}
      const stream=fs.createReadStream(realFile);
      stream.on('error',error=>{console.error('[static] read failed:',error.message);finish(500,'Unable to read asset');});
      res.on('close',()=>{if(!res.writableEnded)stream.destroy();});stream.pipe(res);
    }catch(error){console.error('[static] request failed:',error.message);finish(error?.code==='EACCES'?403:500,'Unable to serve request');}
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;server.keepAliveTimeout=5_000;
  server.on('clientError',(_error,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
  return {server,projectId,instance};
}

async function main(){
  const args=process.argv.slice(2);
  const option=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
  const port=Number(option('--port',process.env.PORT??'4173'));
  const host=option('--host','0.0.0.0');
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Port must be an integer from 1 to 65535');
  if(!host)throw new Error('Host is required');
  const {server,projectId,instance}=await createStaticServer({root:path.join(PROJECT_ROOT,'dist')});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const metadata={service:SERVICE_ID,pid:process.pid,projectRoot:PROJECT_ROOT,entryPath:ENTRY,projectId,instance,port,host,startedAt:new Date().toISOString()};
  try{await fsp.writeFile(PID_FILE,JSON.stringify(metadata,null,2),'utf8');}
  catch(error){await new Promise(resolve=>server.close(resolve));throw new Error(`Unable to write owned server metadata: ${error.message}`);}
  console.log(`Night Market Rush: http://localhost:${port} (listening on ${host})`);
  let closing=false;
  const shutdown=async()=>{
    if(closing)return;closing=true;
    try{const data=JSON.parse(await fsp.readFile(PID_FILE,'utf8'));if(data.pid===process.pid&&data.instance===instance)await fsp.unlink(PID_FILE);}catch{}
    server.close(()=>process.exit(0));server.closeIdleConnections?.();
    setTimeout(()=>process.exit(0),2000).unref();
  };
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(ENTRY)){
  main().catch(error=>{console.error(`Cannot start Night Market Rush: ${error.code==='EADDRINUSE'?'port already in use; no process was stopped':error.message}`);process.exitCode=1;});
}
