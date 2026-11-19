import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {WORLD} from '../src/core/config';
import {DamageLabels,DAMAGE_LABEL_LAYOUT as layout,type DamageLabelGroup} from '../src/render/damage-labels';
import type {DamageSource} from '../src/shared/types';
import type {Assets} from '../src/render/assets';

function fixture(){
  const game=new Game(1);game.reset(1,true);
  const labels=new DamageLabels();
  const victim=game.spawnEnemy('bowl',{x:800,y:400});
  const add=(id:number,amount:number,source:DamageSource='knife',victimId=victim.id,time=id)=>
    labels.add({type:'damage',id,victimId,source,amount,nominal:amount,x:victim.x,y:victim.y,time});
  const kill=()=>labels.add({type:'kill',kind:'bowl',victimId:victim.id,x:victim.x,y:victim.y,points:1});
  const step=(dt=0)=>{labels.update(dt,game.state);return labels.snapshot();};
  return {game,labels,victim,add,kill,step};
}
function expectSeparated(groups:DamageLabelGroup[]):void{
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
    const a=groups[i],b=groups[j];
    expect(Math.abs(a.x-b.x)<layout.width&&a.y<b.y+b.height&&b.y<a.y+a.height,`groups ${a.victimId}/${b.victimId} overlap`).toBe(false);
  }
}
describe('each monster keeps its own actual damage total',()=>{
  it('adds true distinct segments, displays the newest five in order, and counts every hit',()=>{
    const {add,step}=fixture();
    add(3,12,'skate');add(1,24);add(2,12,'skate');add(4,22,'tray');add(5,8,'tongs');add(6,8,'tongs');
    const group=step()[0];
    expect(group).toMatchObject({amount:86,count:6});
    expect(group.recent.map(r=>r.id)).toEqual([2,3,4,5,6]);
    expect(group.recent.map(r=>r.source)).toEqual(['skate','skate','tray','tongs','tongs']);
  });
  it('keeps all prior damage after a long gap and starts a fresh detail line on the next hit',()=>{
    const {add,step}=fixture();add(1,9);add(2,11);
    expect(step(3)[0].recent.map(h=>h.amount)).toEqual([9,11]);
    expect(step(12)[0]).toMatchObject({amount:20,count:2,recent:[]});
    add(3,12);add(4,14);
    const group=step()[0];expect(group).toMatchObject({amount:46,count:4});
    expect(group.recent.map(h=>h.amount)).toEqual([12,14]);
  });
  it('keeps totals independent even when two enemies are hit by the same weapon',()=>{
    const {game,add,victim,step}=fixture();
    const other=game.spawnEnemy('bun',{x:400,y:400});
    add(2,8);add(3,11,'knife',other.id);add(4,13);
    const groups=step();
    expect(groups.find(g=>g.victimId===victim.id)).toMatchObject({amount:21,count:2});
    expect(groups.find(g=>g.victimId===other.id)).toMatchObject({amount:11,count:1});
  });
  it('preserves thousands of hits while bounding recent details and ignoring old and recent replays',()=>{
    const {add,step}=fixture();for(let id=1;id<=5100;id++)add(id,2);
    add(1,2);add(5097,2);add(5100,2);
    expect(step()[0]).toMatchObject({amount:10200,count:5100});
    expect(step()[0].recent.map(r=>r.id)).toEqual([5096,5097,5098,5099,5100]);
  });
  it('uses real HP lost in combat and stops a burst when its target dies',()=>{
    const {game,labels,victim,step}=fixture();
    victim.x=victim.px=740;victim.hp=7;victim.stunUntil=1000;
    game.update(.2,{x:0,y:0});
    const events=game.drainEvents(), damage=events.filter(e=>e.type==='damage'&&e.victimId===victim.id);
    expect(damage.length).toBeGreaterThan(0);expect(damage.length).toBeLessThan(5);
    expect(events.some(e=>e.type==='kill'&&e.victimId===victim.id)).toBe(true);
    for(const e of events)labels.add(e);
    expect(step()[0]).toMatchObject({amount:7,count:damage.length});
    expect(step(layout.deathTtl+.01)).toHaveLength(0);
  });
  it('rejects invalid values and uses the damage amount after overkill clamping',()=>{
    const {labels,victim,add,step}=fixture();
    labels.add({type:'damage',id:5,victimId:victim.id,source:'sword',amount:3,nominal:110,x:800,y:400,time:1});
    add(6,0);add(7,NaN);add(8,-3);add(9,Infinity);add(5,3);
    expect(step()[0]).toMatchObject({amount:3,count:1});
  });
  it('follows the live body then holds the exact death position and fades only near the end',()=>{
    const {game,victim,add,kill,step}=fixture();add(1,22);step();
    victim.x+=40;expect(step()[0].anchorX).toBe(victim.x);
    victim.x+=15;kill();game.state.enemies=[];add(2,88);
    for(let i=0;i<40;i++)step(0);
    const group=step(1.6)[0];expect(group).toMatchObject({anchorX:victim.x,amount:22,count:1,alpha:1});
    expect(step(.6)[0].alpha).toBeGreaterThan(0);expect(step()[0].alpha).toBeLessThan(1);
    expect(step(.21)).toHaveLength(0);
  });
  it('retains visible totals while paused and resets history and event IDs for another game',()=>{
    const {labels,add,step}=fixture();add(1,22);add(2,33);const before=step(.31);
    expect(step(0)).toEqual(before);expect(step(NaN)).toEqual(before);
    labels.reset();expect(step()).toEqual([]);add(1,10);expect(step()[0]).toMatchObject({amount:10,count:1});
  });
  it('never resurrects a despawned target from a late orphan event',()=>{
    const {game,add,kill,step}=fixture();add(1,31);kill();game.state.enemies=[];step(layout.deathTtl+.1);
    add(2,35);expect(step()).toHaveLength(0);
  });
  it('restores the full total of an obscured enemy when it moves into free space',()=>{
    const {game,add,step}=fixture();
    const enemies=Array.from({length:24},()=>game.spawnEnemy('bowl',{x:800,y:400}));
    for(const [i,e] of enemies.entries()){add(100+2*i,12,'skate',e.id);add(101+2*i,6,'tray',e.id);}
    game.state.weapon.targetId=enemies[6].id;
    const first=step();expect(first[0].victimId).toBe(enemies[6].id);expectSeparated(first);
    const hidden=enemies.find(e=>!first.some(g=>g.victimId===e.id))!;
    add(201,7,'tray',hidden.id);
    hidden.x=300;game.state.weapon.targetId=hidden.id;
    expect(step(.5)[0]).toMatchObject({victimId:hidden.id,amount:25,count:3});
  });
  it('keeps a bounded layout while reserving separate slots for the player and avoiding edges',()=>{
    const {game,add,labels,step}=fixture();game.state.player.x=WORLD.bounds.left;game.state.player.y=WORLD.bounds.top;
    for(let n=0;n<60;n++){const e=game.spawnEnemy('box',{x:100+(n%15)*68,y:165+Math.floor(n/15)*101});add(100+2*n,12,'skate',e.id);add(101+2*n,12,'skate',e.id);}
    add(500,18,'bowl',0);labels.add({type:'heal',id:501,amount:25,x:80,y:100});
    const groups=step();
    expectSeparated(groups);
    expect(groups.filter(g=>!g.player).reduce((n,g)=>n+(g.height>layout.rowHeight?2:1),0)).toBeLessThanOrEqual(layout.budget);
    expect(groups.filter(g=>g.player).map(g=>g.amount)).toEqual([18,25]);expect(groups.find(g=>g.heal)?.amount).toBe(25);
    for(const g of groups){expect(g.y).toBeGreaterThanOrEqual(84);expect(g.x-layout.width/2).toBeGreaterThanOrEqual(16);expect(g.y+g.height).toBeLessThanOrEqual(WORLD.height-110);}
    expect(step(1.1).filter(g=>g.player)).toHaveLength(0);
  });
  it('immediately reflows live labels that move into one another',()=>{
    const {game,add,step}=fixture();game.state.player.x=200;
    const a=game.spawnEnemy('bowl',{x:600,y:400}),b=game.spawnEnemy('bowl',{x:900,y:400});
    add(100,12,'skate',a.id);add(101,12,'skate',b.id);expect(step()).toHaveLength(2);
    b.x=610;const after=step(.01);expect(after).toHaveLength(2);expectSeparated(after);
  });
  it('keeps clustered hits readable without printing every segment over the contact',()=>{
    const {game,add,step}=fixture();
    const enemies=Array.from({length:7},(_,i)=>game.spawnEnemy('bun',{x:340+i*15,y:390}));
    for(const [i,e] of enemies.entries())for(let j=0;j<3;j++)add(100+i*3+j,10,'tongs',e.id);
    game.state.weapon.targetId=enemies[0].id;
    const groups=step();
    expect(groups.length).toBeGreaterThan(1);
    for(const group of groups){
      expect(group).toMatchObject({amount:30,count:3});
      if(group.victimId!==game.state.weapon.targetId)expect(group).toMatchObject({compact:true,recent:[]});
      for(const e of enemies){
        const contactY=e.y-28;
        expect(Math.abs(group.x-e.x)<layout.width/2+22 && group.y<contactY+18 && group.y+group.height>contactY-18).toBe(false);
      }
    }
  });
  it('draws the sum, segment count and recent details with stable size in reduced motion',()=>{
    const {game,labels,add,step}=fixture();const texts:{text:string;font:string}[]=[];
    const target: Record<string,unknown>={font:'',fillText(text:string){texts.push({text,font:String(target.font)});}};
    const context=new Proxy(target,{get:(o,k)=>k in o?o[k as string]:(()=>{}),set:(o,k,v)=>{o[k as string]=v;return true;}}) as unknown as CanvasRenderingContext2D;
    const assets={sprites:{}} as Assets;
    add(1,9);add(2,11);step();labels.draw(context,assets,game.state,true);
    expect(texts.map(t=>t.text)).toEqual(['−20','2段','+9 +11']);const large=texts[0].font;
    texts.length=0;step(.1);labels.draw(context,assets,game.state,true);expect(texts[0].font).toBe(large);
    texts.length=0;labels.draw(context,assets,game.state);expect(texts[0].font).not.toBe(large);
  });
});
