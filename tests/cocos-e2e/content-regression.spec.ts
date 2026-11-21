import {expect,test} from '@playwright/test';
import {ENEMY_NAMES,SKILL_KINDS,WEAPON_KINDS} from '../../cocos/assets/scripts/domain/shared/types';

/**
 * Development build only: this exercises the real lab action handlers and
 * fixed-step simulation, but uses test-side access to the prototype component.
 * Skills mostly run in an empty arena; an attack/skill event does not prove a
 * hit, visual fidelity, audio, mobile performance, or platform release quality.
 * The caller must first build the Creator web-mobile prototype with DEBUG on.
 */
test('development lab triggers every weapon, skill and enemy',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});

  // Playwright supplies a fresh browser context; sentinels detect accidental
  // access to the old keys without touching an existing player's browser.
  await page.addInitScript(()=>{
    localStorage.setItem('night-market-rush.save.v4','cocos-e2e-v4-sentinel');
    localStorage.setItem('night-market-rush.save.v1','cocos-e2e-v1-sentinel');
  });
  const ready=page.waitForEvent('console',{
    predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:60000,
  });
  await page.goto('/');
  await ready;
  const initial=await page.evaluate(async()=>{
    const w=window as any;
    const cc=await w.System.import('cc');
    const game=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!game)throw new Error('Cocos development prototype component is unavailable');
    w.__cocosRegressionGame=game;
    w.__cocosRegressionEvents=[];
    const original=game.onGameEvents.bind(game);
    game.onGameEvents=(events:any[],state:unknown)=>{
      w.__cocosRegressionEvents.push(...events);
      original(events,state);
    };
    game.action('practice');
    return {view:game.view,practice:game.session.state.practice};
  });
  expect(initial,'requires a DEBUG development build with the lab enabled').toEqual({view:'lab',practice:true});
  expect(WEAPON_KINDS).toHaveLength(10);
  expect(SKILL_KINDS).toHaveLength(21);
  const enemies=Object.keys(ENEMY_NAMES);
  expect(enemies).toHaveLength(21);

  await test.step('all ten weapons equip and attack',async()=>{
    for(const kind of WEAPON_KINDS){
      const result=await page.evaluate(kind=>{
        const w=window as any,g=w.__cocosRegressionGame;
        if(g.view==='play')g.action('lab');
        g.action('reset-lab');g.action('choose-weapon',kind);
        g.action('lab');g.action('spawn',{kind:'bowl',group:true});
        g.session.state.player.invulnerableUntil=9999;
        for(const enemy of g.session.state.enemies){enemy.hp=enemy.maxHp=99999;enemy.stunUntil=9999;}
        w.__cocosRegressionEvents=[];
        for(let i=0;i<80;i++){
          g.session.update(.05,{x:0,y:0});
          if(i%4===0)g.render(.05);
        }
        return {selected:g.session.state.weapon.kind,view:g.view,
          attacks:w.__cocosRegressionEvents.filter((e:any)=>e.type==='attack'&&e.kind===kind).length};
      },kind);
      expect(result,`${kind}: equip and trigger actual attacks`).toMatchObject({selected:kind,view:'play'});
      expect(result.attacks,`${kind}: at least one attack event`).toBeGreaterThan(0);
    }
  });

  await test.step('all 21 skills activate',async()=>{
    for(const kind of SKILL_KINDS){
      const result=await page.evaluate(kind=>{
        const w=window as any,g=w.__cocosRegressionGame;
        if(g.view==='play')g.action('lab');
        g.action('reset-lab');g.session.state.player.hp=50;
        w.__cocosRegressionEvents=[];g.action('trigger-skill',kind);
        g.session.state.player.invulnerableUntil=9999;
        for(let i=0;i<80;i++){
          g.session.update(.05,{x:0,y:0});
          if(i%4===0)g.render(.05);
        }
        return {view:g.view,events:w.__cocosRegressionEvents.filter((e:any)=>e.type==='skill').map((e:any)=>e.kind),
          hp:g.session.state.player.hp};
      },kind);
      expect(result.view,`${kind}: return to arena`).toBe('play');
      expect(result.events,`${kind}: actual skill event`).toContain(kind);
      if(kind==='health')expect(result.hp,'health pickup restores HP').toBeGreaterThan(50);
    }
  });

  await test.step('all 21 enemies spawn and advance their real behavior',async()=>{
    const epicNames:Record<string,string[]>={
      epicHotpot:['鸳鸯双沸','沸锅翻浪','开摊招伙'],
      epicDragon:['游龙走糖','糖火龙息','开摊招伙'],
      epicOpera:['十字削面','变脸双扇','开摊招伙'],
      epicPearl:['黑糖珍珠雨','杯沿回旋','开摊招伙'],
      epicSteamer:['三屉冲顶','笼屉放汽','开摊招伙'],
    };
    for(const kind of enemies){
      const result=await page.evaluate(kind=>{
        const w=window as any,g=w.__cocosRegressionGame;
        if(g.view==='play')g.action('lab');
        g.action('reset-lab');g.action('spawn',{kind,group:false});
        const enemy=g.session.state.enemies.find((e:any)=>e.kind===kind);
        if(!enemy)return {spawned:false,casts:[],warnings:[],warningNode:false,live:0};
        enemy.hp=enemy.maxHp=99999;g.session.state.weapon.readyAt=9999;
        g.session.state.player.invulnerableUntil=9999;
        const casts=new Set<string>(),warnings=new Set<string>();
        for(let i=0;i<320;i++){
          g.session.update(.05,{x:0,y:0});
          if(i%4===0)g.render(.05);
          const cast=enemy.guardCast,time=g.session.state.time;
          if(cast){
            casts.add(cast.name);
            if(cast.marks.some((mark:any)=>mark.warnAt<=time&&time<mark.hitAt))warnings.add(cast.name);
          }
        }
        return {spawned:true,casts:[...casts],warnings:[...warnings],warningNode:g.enemies.warningNode.activeInHierarchy,live:g.enemies.live.size};
      },kind);
      expect(result.spawned,`${kind}: lab spawned enemy`).toBe(true);
      expect(result.live,`${kind}: Cocos enemy presentation exists`).toBeGreaterThan(0);
      expect(result.warningNode,`${kind}: warning layer enabled`).toBe(true);
      for(const cast of epicNames[kind]??[]){
        expect(result.casts,`${kind}: observed ${cast}`).toContain(cast);
        expect(result.warnings,`${kind}: ${cast} enters its warning window`).toContain(cast);
      }
    }
  });

  expect(errors,'page exceptions, console errors and HTTP failures').toEqual([]);
  expect(await page.evaluate(()=>({v4:localStorage.getItem('night-market-rush.save.v4'),
    v1:localStorage.getItem('night-market-rush.save.v1'),keys:Object.keys(localStorage).sort()}))).toEqual({
    v4:'cocos-e2e-v4-sentinel',v1:'cocos-e2e-v1-sentinel',
    keys:['night-market-rush.save.v1','night-market-rush.save.v4'],
  });
});
