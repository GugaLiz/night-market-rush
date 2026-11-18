import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {WEAPONS,updateWeapons} from '../src/core/weapons';
import {CONFIG} from '../src/core/config';
import {WEAPON_KINDS,type Enemy,type GameEvent,type WeaponKind} from '../src/shared/types';
import type {CombatContext} from '../src/core/contracts';

function fixture(kind:WeaponKind){
  const game=new Game(1);game.reset(1,true);const s=game.state;s.weapon.kind=kind;let id=1000;
  const events:GameEvent[]=[],hits:{id:number;amount:number}[]=[];
  const ctx:CombatContext={id:()=>id++,emit:e=>events.push(e),active:e=>e.hp>0,random:()=>.5,spawnPickup:()=>null,push:()=>{},damage:(e,amount)=>{hits.push({id:e.id,amount});const actual=Math.min(e.hp,amount);e.hp-=actual;return actual;}};
  const tick=(seconds:number)=>{for(let i=0;i<Math.round(seconds*60);i++){s.time+=1/60;updateWeapons(s,1/60,ctx);}};
  const enemy=(x:number,y=370)=>{const e=game.spawnEnemy('bowl',{x,y});e.hp=e.maxHp=1000;return e;};
  const release=()=>{for(let i=0;i<40;i++){tick(1/60);if(events.some(e=>e.type==='attack')){s.weapon.readyAt=Infinity;return;}}throw Error('did not attack');};
  return {s,events,hits,tick,enemy,release};
}
describe('V3 continuous directional weapons',()=>{
  for(const kind of WEAPON_KINDS)it(`${kind} attacks periodically without any enemies`,()=>{
    const {s,events,tick}=fixture(kind);tick(4);const attacks=events.filter(e=>e.type==='attack');
    expect(attacks.length).toBeGreaterThanOrEqual(2);expect(attacks.every(e=>e.type==='attack'&&e.angle===0)).toBe(true);expect(s.weapon.targetId).toBeNull();
  });
  it('movement, then remembered movement, determines direction regardless of a rear enemy',()=>{
    const {s,events,enemy,tick}=fixture('bag');enemy(500);s.player.moveDirection={x:0,y:-1};tick(2);
    expect(events.filter(e=>e.type==='attack').every(e=>e.type==='attack'&&Math.abs(e.angle+Math.PI/2)<1e-9)).toBe(true);
    expect(s.projectiles.every(p=>p.vy<0)).toBe(true);
  });
  it('direction updates during windup and locks at release rather than tracking enemies',()=>{
    const {s,events,enemy,tick}=fixture('sword');enemy(800);tick(1/60);s.player.moveDirection={x:-1,y:0};tick(.25);
    expect(events.find(e=>e.type==='attack')).toMatchObject({angle:Math.PI});
    const angle=s.weapon.attack!.angle;s.player.moveDirection={x:0,y:1};tick(.05);expect(s.weapon.attack?.angle).toBe(angle);
  });
  it('wide melee sweeps several forward targets and excludes rear targets',()=>{
    for(const kind of ['tongs','knife','sword','umbrella'] as WeaponKind[]){
      const {hits,enemy,release,tick}=fixture(kind);const front=[enemy(735,350),enemy(755,370),enemy(740,390)],rear=enemy(590);
      release();tick(.2);expect(front.every(e=>hits.some(h=>h.id===e.id))).toBe(true);expect(hits.some(h=>h.id===rear.id)).toBe(false);
      expect(hits.filter(h=>h.id===front[0].id)).toHaveLength(1);
    }
  });
  it('bag fans five rays but one enemy receives the configured total only once',()=>{
    const {s,hits,enemy,release,tick}=fixture('bag');const e=enemy(710);release();expect(s.projectiles).toHaveLength(5);tick(.5);
    expect(hits.filter(h=>h.id===e.id)).toEqual([{id:e.id,amount:24}]);
  });
  it('chopsticks pierce five targets with decreasing totals',()=>{
    const {hits,enemy,release,tick}=fixture('chopsticks');[710,765,820,875,930].forEach(x=>enemy(x));release();tick(.7);
    expect(hits.map(h=>h.amount)).toEqual([42,36,32,28,24]);
  });
  it('spirit never acquires a rear-only target and still flies forward',()=>{
    const {s,hits,enemy,release,tick}=fixture('spirit');enemy(520);release();expect(s.projectiles[0].targetId).toBe(-1);tick(.3);
    expect(s.projectiles[0].x).toBeGreaterThan(640);expect(hits).toHaveLength(0);
  });
  it('spirit selects a front initial enemy and only a nearby second one',()=>{
    const {hits,enemy,release,tick}=fixture('spirit');const first=enemy(740),second=enemy(790,405),far=enemy(1000,500);
    release();tick(1.1);expect(hits.map(h=>h.id)).toEqual([first.id,second.id]);expect(far.hp).toBe(1000);expect(hits.map(h=>h.amount)).toEqual([40,30]);
  });
  it('tray has independent outbound and return hits',()=>{
    const {hits,enemy,release,tick}=fixture('tray');const e=enemy(800);release();tick(1.4);expect(hits.filter(h=>h.id===e.id).map(h=>h.amount)).toEqual([32,26]);
  });
  it('lunchbox flies to a fixed forward point without a target and explodes in a wide area',()=>{
    const {s,hits,enemy,release,tick}=fixture('lunchbox');release();expect(s.projectiles[0]).toMatchObject({targetX:940,targetY:370});
    const e=enemy(940,435);tick(.6);expect(hits).toHaveLength(0);tick(.08);expect(hits).toEqual([{id:e.id,amount:60}]);
  });
  it('talisman flies first and chains only after physical impact',()=>{
    const {s,hits,enemy,release,tick}=fixture('talisman');const targets=[enemy(800),enemy(870,400),enemy(950,430),enemy(1020,400)];release();
    expect(s.projectiles[0].phase).toBe('out');expect(hits).toHaveLength(0);tick(.2);expect(hits).toHaveLength(0);tick(.5);
    expect(hits.map(h=>h.id)).toEqual(targets.map(e=>e.id));expect(hits.map(h=>h.amount)).toEqual([40,32,28,24]);
  });
  it('umbrella repeats forward strikes and retains a one-use block window',()=>{
    const {s,events,enemy,release,tick}=fixture('umbrella');release();const e:Enemy=enemy(680);e.px=710;e.x=680;tick(1/60);
    expect(events.filter(e=>e.type==='defend')).toHaveLength(1);expect(s.weapon.attack?.blocked).toBe(true);
    tick(.05);expect(events.filter(e=>e.type==='defend')).toHaveLength(1);
  });
  it('umbrella blocks the earliest incoming shot without damaging its owner',()=>{
    const {s,hits,events,release,tick}=fixture('umbrella');release();
    const shot=(id:number,px:number,x:number)=>({id,ownerId:77,x,y:370,px,py:370,vx:-150,vy:0,radius:6,damage:8,bornAt:0,expiresAt:10});
    s.enemyShots=[shot(21,710,680),shot(22,690,675)];tick(1/60);
    expect(s.enemyShots.map(q=>q.id)).toEqual([21]);expect(events.filter(e=>e.type==='defend')).toHaveLength(1);expect(hits).toHaveLength(0);
  });
  it('dash protection preserves umbrella block including its final partial step',()=>{
    const {s,events,release,tick}=fixture('umbrella');release();
    s.enemyShots=[{id:21,ownerId:77,x:680,y:370,px:710,py:370,vx:-150,vy:0,radius:6,damage:8,bornAt:0,expiresAt:10}];
    s.player.dashUntil=s.time+.005;tick(1/60);
    expect(s.weapon.attack?.blocked).toBe(false);expect(s.enemyShots).toHaveLength(1);expect(events.some(e=>e.type==='defend')).toBe(false);
    tick(1/60);expect(s.weapon.attack?.blocked).toBe(true);expect(s.enemyShots).toHaveLength(0);
  });
  it('keeps sustained shots within the shared cap',()=>{
    const {s,tick}=fixture('bag');for(let i=0;i<300;i++){tick(1/60);expect(s.projectiles.length).toBeLessThanOrEqual(CONFIG.weapons.projectileCap);}
  });
  it('keeps all per-contact totals bounded without multiplying fivefold',()=>{
    expect(Object.values(WEAPONS).every(w=>w.damage>=24&&w.damage<=65)).toBe(true);
    expect(Object.values(WEAPONS).every(w=>w.cooldown>=.55&&w.cooldown<=1.5)).toBe(true);
  });
});
