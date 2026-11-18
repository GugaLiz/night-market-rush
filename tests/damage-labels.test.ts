import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {WORLD} from '../src/core/config';
import {DamageLabels,DAMAGE_LABEL_LAYOUT,type DamageLabelGroup} from '../src/render/damage-labels';
import type {DamageSource} from '../src/shared/types';
import type {Assets} from '../src/render/assets';

const {width:WIDTH,rowHeight:ROW_HEIGHT,budget:BUDGET,deathTtl:DEATH_TTL}=DAMAGE_LABEL_LAYOUT;
function fixture(){
  const game=new Game(1);game.reset(1,true);const labels=new DamageLabels();
  const victim=game.spawnEnemy('bowl',{x:800,y:400});
  const add=(id:number,amount:number,source:DamageSource='knife',victimId=victim.id,time=id)=>labels.add({type:'damage',id,victimId,source,amount,nominal:amount,x:victim.x,y:victim.y,time});
  const step=(dt=0)=>{labels.update(dt,game.state);return labels.snapshot();};
  return {game,labels,victim,add,step};
}
function expectSeparated(groups:DamageLabelGroup[]):void{
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
    const a=groups[i],b=groups[j];
    const overlap=a.x-WIDTH/2<b.x+WIDTH/2&&a.x+WIDTH/2>b.x-WIDTH/2&&a.y<b.y+b.rows.length*ROW_HEIGHT&&a.y+a.rows.length*ROW_HEIGHT>b.y;
    expect(overlap,`groups ${a.victimId}/${b.victimId} overlap`).toBe(false);
  }
}

describe('bounded multi-hit damage labels',()=>{
  it('shows five actual burst events independently without fabricating missing rows',()=>{
    const {labels,victim,step}=fixture();
    for(let i=0;i<5;i++)labels.add({type:'damage',id:100+i,victimId:victim.id,source:'knife',amount:i===4?4:7,nominal:7,x:800,y:400,time:0,burstIndex:i,burstCount:5});
    const rows=step()[0].rows;expect(rows).toHaveLength(5);expect(rows.map(r=>r.amount)).toEqual([7,7,7,7,4]);expect(rows.every(r=>!r.folded)).toBe(true);
  });
  it('low HP death from the actual battle emits and displays only the hits that occurred',()=>{
    const {game,labels,victim,step}=fixture();victim.x=victim.px=740;victim.hp=7;victim.stunUntil=1000;
    game.update(.2,{x:0,y:0});const events=game.drainEvents();const damage=events.filter(e=>e.type==='damage'&&e.victimId===victim.id);
    expect(damage).toHaveLength(2);for(const e of events)labels.add(e);
    const groups=step();expect(groups[0].rows.map(r=>r.amount)).toEqual([6,1]);expect(groups[0].rows.reduce((n,r)=>n+r.amount,0)).toBe(7);
    expect(step(DEATH_TTL+.01)).toHaveLength(0);
  });
  it('shrinks each new number from 28 toward 14 independently of later hits',()=>{
    const {add,step}=fixture();add(1,6);const first=step()[0].rows[0];expect(first).toMatchObject({age:0,scale:1,fontSize:28});
    step(.5);add(2,6);const rows=step()[0].rows;expect(rows[0].fontSize).toBeLessThan(rows[1].fontSize);expect(rows[0].age).toBeCloseTo(.5);expect(rows[1].scale).toBe(1);
    const last=step(.54)[0].rows[0];expect(last.fontSize).toBeLessThan(14.2);expect(last.fontSize).toBeGreaterThanOrEqual(14);
    expect(step(.02)[0].rows.map(r=>r.ids)).toEqual([[2]]);
  });
  it('reduce motion draws stable-size outlined text while normal mode shrinks',()=>{
    const {game,labels,add,step}=fixture();const fonts:string[]=[];
    const target:Record<string,unknown>={font:''};const context=new Proxy(target,{get:(o,k)=>k in o?o[k as string]:(()=>{}),set:(o,k,v)=>{o[k as string]=v;if(k==='font')fonts.push(String(v));return true;}}) as unknown as CanvasRenderingContext2D;
    const assets={sprites:{}} as Assets;add(1,6);step();labels.draw(context,assets,game.state,true);expect(fonts.at(-1)).toContain('22px');
    step(.5);labels.draw(context,assets,game.state,true);expect(fonts.at(-1)).toContain('22px');labels.draw(context,assets,game.state);expect(fonts.at(-1)).not.toContain('22px');
  });
  it('keeps three real hits in event order with their sources',()=>{
    const {add,step}=fixture();add(3,12,'skate');add(1,24,'knife');add(2,12,'skate');
    const rows=step()[0].rows;expect(rows.map(r=>r.amount)).toEqual([24,12,12]);expect(rows.map(r=>r.source)).toEqual(['knife','skate','skate']);
    expect(rows.every(r=>r.count===1)).toBe(true);
  });
  it('sixth hit folds earlier records and preserves latest four separately',()=>{
    const {add,step}=fixture();add(1,24,'knife');add(2,12,'skate');add(3,12,'skate');add(4,22,'tray');add(5,8,'tongs');add(6,8,'tongs');
    const rows=step()[0].rows;expect(rows.map(r=>r.amount)).toEqual([36,12,22,8,8]);expect(rows[0]).toMatchObject({count:2,source:null,folded:true,ids:[1,2]});
  });
  it('folded members expire independently without being renewed by later hits',()=>{
    const {add,step}=fixture();add(1,24);step(.6);add(2,12,'skate');add(3,12,'skate');add(4,22,'tray');add(5,8,'tongs');add(6,8,'tongs');
    expect(step()[0].rows[0].amount).toBe(36);const rows=step(.46)[0].rows;
    expect(rows.map(r=>r.amount)).toEqual([12,12,22,8,8]);expect(rows.flatMap(r=>r.ids)).not.toContain(1);
    expect(step(.6)).toHaveLength(0);
  });
  it('deduplicates a repeated event ID without merging distinct hit IDs',()=>{
    const {add,step}=fixture();add(1,12);add(1,12);add(2,12);expect(step()[0].rows.map(r=>r.amount)).toEqual([12,12]);
  });
  it('uses actual damage and rejects non-positive or non-finite feedback',()=>{
    const {labels,victim,add,step}=fixture();
    labels.add({type:'damage',id:5,victimId:victim.id,source:'sword',amount:3,nominal:52,x:800,y:400,time:1});
    add(6,0);add(7,NaN);add(8,-3);expect(step()[0].rows.map(r=>r.amount)).toEqual([3]);
  });
  it('caps monster rows at thirty while reserving player damage and healing',()=>{
    const {game,add,labels,step}=fixture();
    for(let n=0;n<60;n++){const e=game.spawnEnemy('bun',{x:150+(n%15)*65,y:240+Math.floor(n/15)*90});add(100+n,12,'skate',e.id);}
    add(500,18,'bowl',0);labels.add({type:'heal',id:501,amount:25,x:640,y:370});
    const groups=step();expect(groups.filter(g=>!g.player).reduce((n,g)=>n+g.rows.length,0)).toBeLessThanOrEqual(BUDGET);
    expect(groups.filter(g=>g.player)).toHaveLength(2);expect(groups.find(g=>g.heal)?.rows[0].amount).toBe(25);
  });
  it('prioritizes the locked target and never queues suppressed distant numbers',()=>{
    const {game,labels,add,step}=fixture();
    const enemies=Array.from({length:20},()=>game.spawnEnemy('bowl',{x:800,y:400}));game.state.weapon.targetId=enemies[4].id;
    for(const [i,e] of enemies.entries())for(let j=0;j<3;j++)add(i*3+j+100,12,'skate',e.id);
    const first=step();expect(first[0].victimId).toBe(enemies[4].id);expect(first.length).toBeLessThan(20);
    const hidden=enemies.find(e=>!first.some(g=>g.victimId===e.id))!;
    for(const shown of first)labels.add({type:'kill',kind:'bowl',x:800,y:400,points:15,victimId:shown.victimId});
    // Keep hidden entries alive while visible groups complete their short death fade.
    expect(step(DEATH_TTL+.01).some(g=>g.victimId===hidden.id)).toBe(false);
  });
  it('freezes a death group and fades it out within its half-second death window',()=>{
    const {labels,victim,game,add,step}=fixture();add(1,22,'tray');const before=step()[0];
    labels.add({type:'kill',kind:'bowl',x:victim.x,y:victim.y,points:15,victimId:victim.id});game.state.enemies=[];add(2,18,'tray');
    const during=step(DEATH_TTL/2)[0];expect(during.rows).toHaveLength(1);expect(during.rows[0].alpha).toBeCloseTo(.5);expect(during.anchorX).toBe(before.anchorX);
    expect(step(DEATH_TTL/2)).toHaveLength(0);
  });
  it('keeps every row outside top HUD and bottom controls near arena edges',()=>{
    const {victim,add,step}=fixture();victim.x=WORLD.bounds.left;victim.y=WORLD.bounds.top;add(1,24);add(2,12);add(3,12);
    const group=step()[0];expect(group.y).toBeGreaterThanOrEqual(84);expect(group.x-WIDTH/2).toBeGreaterThanOrEqual(16);
    expect(group.y+group.rows.length*ROW_HEIGHT).toBeLessThanOrEqual(WORLD.height-110);
  });
  it('reset discards history, deduplication and player slots',()=>{
    const {labels,add,step}=fixture();add(1,12);add(2,8,'bun',0);step();labels.reset();expect(step()).toEqual([]);add(1,12);expect(step()).toHaveLength(1);
  });
  it('separates dense same-position groups and both reserved player slots',()=>{
    const {game,labels,add,step}=fixture();
    const enemies=Array.from({length:30},()=>game.spawnEnemy('bowl',{x:640,y:400}));
    game.state.weapon.targetId=enemies[29].id;
    for(const [index,e] of enemies.entries())for(let hit=0;hit<5;hit++)add(100+index*5+hit,12,'skate',e.id);
    add(500,12,'box',0);labels.add({type:'heal',id:501,amount:24,x:640,y:370});
    const groups=step();expectSeparated(groups);expect(groups[0].victimId).toBe(enemies[29].id);
    expect(groups.filter(g=>g.player)).toHaveLength(2);expect(groups.filter(g=>!g.player).reduce((n,g)=>n+g.rows.length,0)).toBeLessThanOrEqual(BUDGET);
    expect(groups.filter(g=>!g.player).length).toBeGreaterThan(1);
  });
  it('breaks the layout lock immediately when moving groups collide',()=>{
    const {game,add,step}=fixture();game.state.player.x=200;
    const a=game.spawnEnemy('bowl',{x:600,y:400}),b=game.spawnEnemy('bowl',{x:900,y:400});
    add(100,12,'skate',a.id);add(101,12,'skate',b.id);const before=step();expect(before).toHaveLength(2);expectSeparated(before);
    b.x=610;const after=step(.01);expect(after).toHaveLength(2);expectSeparated(after);
    expect(Math.abs(after[0].x-after[1].x)>=WIDTH+8||Math.abs(after[0].y-after[1].y)>=ROW_HEIGHT+8).toBe(true);
  });
  it('drops groups with no free candidate instead of drawing or replaying overlapping labels',()=>{
    const {game,labels,add,step}=fixture();
    const enemies=Array.from({length:10},()=>game.spawnEnemy('bowl',{x:WORLD.bounds.left,y:WORLD.bounds.top}));
    for(const [index,e] of enemies.entries())add(100+index,12,'skate',e.id);
    const first=step();expectSeparated(first);expect(first.length).toBeGreaterThan(0);expect(first.length).toBeLessThan(10);
    const hidden=enemies.find(e=>!first.some(g=>g.victimId===e.id))!;
    for(const group of first)labels.add({type:'kill',kind:'bowl',x:80,y:100,points:15,victimId:group.victimId});
    hidden.x=900;hidden.y=400;game.state.weapon.targetId=hidden.id;
    expect(step(DEATH_TTL+.01).some(g=>g.victimId===hidden.id)).toBe(false);
  });
  it('keeps player damage and heal separate at the top-left corner before placing enemies',()=>{
    const {game,labels,add,step}=fixture();game.state.player.x=WORLD.bounds.left;game.state.player.y=WORLD.bounds.top;
    for(let i=0;i<12;i++){const enemy=game.spawnEnemy('box',{x:100+i*15,y:210});add(100+i,12,'tray',enemy.id);}
    add(500,12,'box',0);labels.add({type:'heal',id:501,amount:24,x:80,y:100});const groups=step();
    expect(groups.filter(g=>g.player)).toHaveLength(2);expectSeparated(groups);
  });
});
