import {describe,it,expect} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG} from '../src/core/config';
const zero={x:0,y:0};
const run=(g:Game,n:number)=>{for(let i=0;i<n;i++)g.update(1/60,zero);};

describe('V3 final mechanism audit',()=>{
 it('actual game umbrella blocks one forward shot, then a second shot still deals damage',()=>{
  const g=new Game(23);g.reset(23,true);g.setWeapon('umbrella');g.state.weapon.readyAt=100;
  g.state.weapon.attack={id:77,kind:'umbrella',phase:'active',startedAt:0,releaseAt:0,endsAt:1,angle:0,targetId:-1,hitIds:[],blocked:false};
  const shot=(id:number)=>({id,ownerId:99,x:700,y:370,px:700,py:370,vx:-3600,vy:0,radius:6,damage:8,bornAt:0,expiresAt:10});
  g.state.enemyShots=[shot(81),shot(82)];g.update(1/60,zero);
  expect(g.state.player.hp).toBe(92);expect(g.state.enemyShots).toHaveLength(0);
  const events=g.drainEvents();expect(events.filter(e=>e.type==='defend')).toHaveLength(1);expect(events.filter(e=>e.type==='damage')).toMatchObject([{victimId:0,amount:8}]);
 });
 it('dash ignores a crossed shot without consuming either umbrella or bubble',()=>{
  const g=new Game(24);g.reset(24,true);g.setWeapon('umbrella');g.triggerSkill('bubble');g.state.weapon.readyAt=100;
  g.state.weapon.attack={id:77,kind:'umbrella',phase:'active',startedAt:0,releaseAt:0,endsAt:1,angle:0,targetId:-1,hitIds:[],blocked:false};
  g.state.enemyShots=[{id:81,ownerId:99,x:700,y:370,px:700,py:370,vx:-3600,vy:0,radius:6,damage:8,bornAt:0,expiresAt:10}];g.dash();g.update(1/60,zero);
  expect(g.state.player.hp).toBe(100);expect(g.state.enemyShots).toHaveLength(0);expect(g.state.weapon.attack?.blocked).toBe(false);expect(g.state.player.bubbleUntil).toBeGreaterThan(g.state.time);
 });
 it('a crowd inside its notice radius converges while retaining distinct finite positions',()=>{
  const g=new Game(15);g.reset(15,true);g.state.weapon.readyAt=Infinity;g.state.player.invulnerableUntil=Infinity;
  for(let i=0;i<40;i++){const angle=i*Math.PI/20;g.spawnEnemy('bun',{x:640+Math.cos(angle)*180,y:370+Math.sin(angle)*160});}
  const average=()=>g.state.enemies.reduce((sum,e)=>sum+Math.hypot(e.x-640,e.y-370),0)/40;
  const initial=average();run(g,1200);const final=average();
  expect(g.state.enemies.every(e=>e.alerted&&Number.isFinite(e.x)&&Number.isFinite(e.y))).toBe(true);
  expect(final).toBeLessThan(initial*.7);expect(new Set(g.state.enemies.map(e=>`${e.x.toFixed(2)},${e.y.toFixed(2)}`)).size).toBe(40);
 });
 it('multiple simultaneous weapon sources cannot duplicate a five-part kill',()=>{
  const g=new Game(13);g.reset(13,true);g.state.weapon.readyAt=Infinity;const e=g.spawnEnemy('bun',{x:700,y:370});e.hp=9;e.stunUntil=100;
  const projectile=(id:number)=>({id,attackId:id,kind:'chopsticks' as const,x:650,y:370,px:650,py:370,vx:6000,vy:0,radius:8,originX:650,originY:370,targetX:950,targetY:370,bornAt:0,expiresAt:3,travelled:0,maxDistance:360,phase:'out' as const,hitIds:[],phaseHitIds:[],targetId:-1,retargets:0,nextHitAt:0,hits:0});
  g.state.projectiles=[projectile(101),projectile(102)];g.update(1/60,zero);const events=g.drainEvents();
  const damages=events.filter(v=>v.type==='damage'&&v.victimId===e.id);expect(damages.reduce((sum,v)=>sum+(v.type==='damage'?v.amount:0),0)).toBe(9);expect(events.filter(v=>v.type==='kill')).toHaveLength(1);expect(g.state.kills).toBe(1);
 });
 it('repeated vouchers keep a single group of three selectable stands',()=>{
  const g=new Game(4);g.reset(4,true);g.state.weapon.readyAt=Infinity;g.triggerSkill('supply');run(g,24);
  const choice=g.state.pickups[0];g.state.player.x=choice.x;g.state.player.y=choice.y;g.update(1/60,zero);
  g.triggerSkill('supply');g.triggerSkill('supply');for(let i=0;i<600;i++){g.update(1/60,zero);const stands=g.state.pickups.filter(p=>p.groupId&&!p.retiringUntil);expect(stands.length).toBeLessThanOrEqual(3);expect(new Set(stands.map(p=>p.groupId)).size).toBeLessThanOrEqual(1);}
 });
 it('ten minutes of moving crowds, live weapons and enemy bullets remain bounded',()=>{
  const g=new Game(810);g.state.player.invulnerableUntil=Infinity;let maxEnemies=0,maxShots=0,maxProjectiles=0,maxStep=0;const started=performance.now();
  for(let i=0;i<36000;i++){
   const before=performance.now();g.update(1/60,zero);maxStep=Math.max(maxStep,performance.now()-before);
   maxEnemies=Math.max(maxEnemies,g.state.enemies.length);maxShots=Math.max(maxShots,g.state.enemyShots?.length??0);maxProjectiles=Math.max(maxProjectiles,g.state.projectiles.length);g.drainEvents();
   if(i%60===0){expect(g.state.enemies.length).toBeLessThanOrEqual(100);expect(g.state.enemyShots!.length).toBeLessThanOrEqual(CONFIG.ranged.cap);expect(g.state.projectiles.length).toBeLessThanOrEqual(24);expect(g.state.enemies.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&e.hp>0)).toBe(true);}
  }
  const elapsed=performance.now()-started;expect(g.state.time).toBeCloseTo(600,6);expect(g.state.ended).toBe(false);expect(maxEnemies).toBeGreaterThan(50);
  console.log(JSON.stringify({audit:'600s natural crowd, default weapon, stationary invulnerable benchmark',elapsedMs:Math.round(elapsed),averageStepMs:+(elapsed/36000).toFixed(4),maxObservedStepMs:+maxStep.toFixed(2),maxEnemies,maxShots,maxProjectiles,kills:g.state.kills}));
 },30000);
});
