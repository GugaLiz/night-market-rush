import {expect,test,type Page} from '@playwright/test';

const workwear=/\/assets\/resources\/native\/65\/65cbb2c3-069b-4150-afac-de5f8c0e9fc5\.(?:png|webp)(?:\?.*)?$/;
test.use({launchOptions:{args:['--autoplay-policy=user-gesture-required']}});

async function activate(page:Page,name:string){
  const button=page.getByRole('button',{name,exact:true});
  await expect(button).toBeAttached();await button.focus();await page.keyboard.press('Enter');
}

test.describe('deferred audio during battle loading',()=>{
  for(const gesture of ['menu','keyboard'] as const)test(`${gesture} gesture does not load audio before the world is ready`,async({page})=>{
    let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requests=0;
    await page.addInitScript(()=>{
      const w=window as any,Original=window.AudioContext;
      w.__audioContexts=[];
      w.AudioContext=class extends Original {
        constructor(options?:AudioContextOptions){super(options);w.__audioContexts.push(this);}
      };
    });
    await page.route(workwear,async route=>{requests++;await held;await route.continue();});
    try{
      await page.goto('/');
      await expect(page.getByRole('button',{name:'开始挑战',exact:true})).toBeAttached({timeout:45000});
      await expect.poll(()=>requests,{timeout:45000}).toBeGreaterThan(0);
      await page.evaluate(async()=>{
        const w=window as any,cc=await w.System.import('cc');
        const app=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
        if(!app?.audio||app.worldReady)throw new Error('Expected an audio host waiting for the world');
        const audio=app.audio,preload=audio.preload.bind(audio);
        w.__deferredAudio={app,calls:0};
        audio.preload=()=>{w.__deferredAudio.calls++;return preload();};
      });
      if(gesture==='keyboard'){
        await page.locator('#GameCanvas').focus();await page.keyboard.press('a');
        await expect.poll(()=>page.evaluate(()=>(window as any).__deferredAudio.app.audio.unlocked)).toBe(true);
      }
      await activate(page,'开始挑战');
      expect(await page.evaluate(()=>{
        const {app,calls}=(window as any).__deferredAudio;
        return {calls,unlocked:app.audio.unlocked,worldReady:app.worldReady,view:app.view};
      })).toEqual({calls:0,unlocked:true,worldReady:false,view:'loading'});
      release();
      await expect.poll(()=>page.evaluate(()=>{
        const {app,calls}=(window as any).__deferredAudio;
        return {worldReady:app.worldReady,calls,available:app.audio.available,playing:app.audio.music.playing,
          view:app.view,contextRunning:(window as any).__audioContexts.some((ctx:AudioContext)=>ctx.state==='running')};
      }),{timeout:45000}).toMatchObject({worldReady:true,calls:1,available:true,playing:true,view:'play',contextRunning:true});
    }finally{release();}
  });

  test('a failed deferred load retries on the next user gesture',async({page})=>{
    let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requests=0;
    await page.route(workwear,async route=>{requests++;await held;await route.continue();});
    try{
      await page.goto('/');
      await expect(page.getByRole('button',{name:'开始挑战',exact:true})).toBeAttached({timeout:45000});
      await expect.poll(()=>requests,{timeout:45000}).toBeGreaterThan(0);
      await page.evaluate(async()=>{
        const w=window as any,cc=await w.System.import('cc');
        const app=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
        if(!app?.audio||app.worldReady)throw new Error('Expected an audio host waiting for the world');
        const loadDir=cc.resources.loadDir.bind(cc.resources);w.__audioRetry={app,calls:0};
        cc.resources.loadDir=(path:string,...args:any[])=>{
          if(path==='audio'&&++w.__audioRetry.calls===1){
            const done=args[args.length-1];queueMicrotask(()=>done(new Error('simulated audio failure'),[]));return;
          }
          return loadDir(path,...args);
        };
      });
      await activate(page,'开始挑战');release();
      await expect.poll(()=>page.evaluate(()=>{
        const {app,calls}=(window as any).__audioRetry;
        return {worldReady:app.worldReady,calls,ready:app.audio.ready,loading:!!app.audio.loading,view:app.view};
      }),{timeout:45000}).toEqual({worldReady:true,calls:1,ready:false,loading:false,view:'play'});
      await page.locator('#GameCanvas').focus();await page.keyboard.press('p');
      await expect.poll(()=>page.evaluate(()=>{
        const {app,calls}=(window as any).__audioRetry;
        return {calls,available:app.audio.available,scene:app.audio.policy.scene};
      }),{timeout:45000}).toMatchObject({calls:2,available:true,scene:'paused'});
      await activate(page,'继续挑战');
      await expect.poll(()=>page.evaluate(()=>(window as any).__audioRetry.app.audio.music.playing),{timeout:10000}).toBe(true);
    }finally{release();}
  });
});
