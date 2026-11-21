import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createStaticServer,SERVICE_ID} from './serve.mjs';

const prefix=path.join(os.tmpdir(),'night-market-server-test-');
const fixture=await fs.mkdtemp(prefix);
const root=path.join(fixture,'dist');
await fs.mkdir(path.join(root,'assets'),{recursive:true});
await fs.writeFile(path.join(root,'index.html'),'<!doctype html><title>fixture</title>');
await fs.writeFile(path.join(root,'assets','app.js'),'export const ready=true;');
await fs.writeFile(path.join(root,'assets','style.css'),'body{color:#222}');
await fs.writeFile(path.join(root,'assets','sprite.png'),Buffer.from([137,80,78,71]));
await fs.writeFile(path.join(root,'.private'),'not public');
await fs.mkdir(path.join(fixture,'outside'));
await fs.writeFile(path.join(fixture,'outside','secret.txt'),'do not leak');
const {server,projectId}=await createStaticServer({root,projectRoot:fixture});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
function request(url='/',method='GET',headers={},targetPort=port){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:targetPort,path:url,method,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
    });req.on('error',reject);req.end();
  });
}
after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  const resolved=path.resolve(fixture);
  assert.ok(resolved.startsWith(path.resolve(prefix)),'Cleanup must stay in generated fixture');
  await fs.rm(resolved,{recursive:true,force:true});
});

test('root HTML and extensionless SPA route render actual index',async()=>{
  const home=await request('/');assert.equal(home.status,200);assert.match(home.headers['content-type'],/^text\/html/);assert.match(home.body,/<title>fixture/);
  const route=await request('/practice/round');assert.equal(route.status,200);assert.equal(route.body,home.body);
});
test('static scripts, CSS and PNG use correct MIME and HEAD length',async()=>{
  const js=await request('/assets/app.js');assert.equal(js.status,200);assert.match(js.headers['content-type'],/^text\/javascript/);assert.match(js.body,/export const/);
  const css=await request('/assets/style.css');assert.match(css.headers['content-type'],/^text\/css/);
  const png=await request('/assets/sprite.png','HEAD');assert.equal(png.status,200);assert.equal(png.headers['content-type'],'image/png');assert.equal(png.headers['content-length'],'4');assert.equal(png.body,'');
});
test('missing assets never become successful HTML responses',async()=>{
  for(const pathname of ['/assets/nope','/assets/missing.png','/missing.js'])assert.equal((await request(pathname)).status,404);
});
test('path traversal, encoded separators and hidden files are denied',async()=>{
  for(const pathname of ['/../outside/secret.txt','/%2e%2e/outside/secret.txt','/assets/%2e%2e/%2e%2e/outside/secret.txt','/..%5coutside%5csecret.txt','/.private','/%00'])assert.equal((await request(pathname)).status,403,pathname);
  assert.equal((await request('/%E0%A4%A')).status,400);
});
test('symlink or junction cannot expose a file outside the static root',async t=>{
  try{await fs.symlink(path.join(fixture,'outside'),path.join(root,'external'),process.platform==='win32'?'junction':'dir');}
  catch(error){if(error.code==='EPERM'||error.code==='EACCES'){t.skip('Host does not permit test symlinks');return;}throw error;}
  const response=await request('/external/secret.txt');assert.equal(response.status,403);assert.doesNotMatch(response.body,/do not leak/);
});
test('unsupported methods are rejected without mutation',async()=>{
  const response=await request('/','POST');assert.equal(response.status,405);assert.equal(response.headers.allow,'GET, HEAD');
});
test('ETag validation produces 304 and health identifies this service',async()=>{
  const first=await request('/assets/app.js');const cached=await request('/assets/app.js','GET',{'If-None-Match':first.headers.etag});assert.equal(cached.status,304);assert.equal(cached.body,'');
  const response=await request('/__night_market_health');const body=JSON.parse(response.body);assert.equal(body.service,SERVICE_ID);assert.equal(body.projectId,projectId);assert.equal(body.pid,process.pid);assert.equal(body.status,'ok');assert.equal(response.headers['cache-control'],'no-store');
});
test('an isolated preview mount keeps assets under its prefix and identifies itself',async()=>{
  const preview=await createStaticServer({root,projectRoot:fixture,urlBase:'/cocos-preview/',serviceId:'preview-test'});
  await new Promise(resolve=>preview.server.listen(0,'127.0.0.1',resolve));
  const previewPort=preview.server.address().port;
  try{
    const get=(url)=>request(url,'GET',{},previewPort);
    const redirect=await get('/cocos-preview');assert.equal(redirect.status,308);assert.equal(redirect.headers.location,'/cocos-preview/');
    const home=await get('/cocos-preview/');assert.equal(home.status,200);assert.match(home.body,/<title>fixture/);
    const js=await get('/cocos-preview/assets/app.js');assert.equal(js.status,200);assert.match(js.headers['content-type'],/^text\/javascript/);
    assert.equal((await get('/assets/app.js')).status,404);
    assert.equal((await get('/cocos-preview/assets/missing.png')).status,404);
    assert.equal((await get('/cocos-preview/%2e%2e/outside/secret.txt')).status,403);
    assert.equal(JSON.parse((await get('/__night_market_health')).body).service,'preview-test');
  }finally{await new Promise(resolve=>preview.server.close(resolve));}
});
