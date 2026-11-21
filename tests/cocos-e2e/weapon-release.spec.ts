import {expect,test} from '@playwright/test';

test('melee and ranged release marks follow the matching visual anchor',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const ready=page.waitForEvent('console',{predicate:message=>message.text().includes('GameUi and real simulation ready'),timeout:45000});
  await page.goto('/');await ready;
  await page.evaluate(async()=>{
    const w=window as any,cc=await w.System.import('cc');
    w.__releaseGame=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('AtlasSmoke');
    if(!w.__releaseGame)throw new Error('Cocos prototype component unavailable');
    w.__releaseGame.action('practice');
  });
  for(const kind of ['tongs','bag'] as const){
    const result=await page.evaluate(kind=>{
      const g=(window as any).__releaseGame;if(g.view==='play')g.action('lab');
      g.action('reset-lab');g.action('choose-weapon',kind);g.action('lab');g.action('spawn',{kind:'bowl',group:false});
      const original=g.melee.drawRelease.bind(g.melee);let drawn:any=null;
      g.melee.drawRelease=(weapon:string,x:number,y:number,angle:number,progress:number,reduced:boolean)=>{
        drawn={weapon,x,y,angle,progress};return original(weapon,x,y,angle,progress,reduced);
      };
      let found:any=null;
      for(let i=0;i<900&&g.session.isRunning;i++){
        drawn=null;g.session.update(1/60,{x:0,y:0});g.render(1/60);
        const attack=g.session.state.weapon.attack,anchor=kind==='tongs'?g.courier.strike:g.courier.launch;
        if(drawn&&drawn.weapon===kind&&attack&&anchor?.id===attack.id){
          found={drawn,anchor:{id:anchor.id,x:anchor.point.x,y:anchor.point.y},attackId:attack.id};break;
        }
      }
      g.melee.drawRelease=original;return found;
    },kind);
    expect(result,`${kind}: actual attack and release mark`).not.toBeNull();
    expect(result!.drawn.x).toBeCloseTo(result!.anchor.x,5);expect(result!.drawn.y).toBeCloseTo(result!.anchor.y,5);
    expect(result!.anchor.id).toBe(result!.attackId);
  }
  expect(errors).toEqual([]);
});
