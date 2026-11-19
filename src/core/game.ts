import {WEAPON_KINDS,type Enemy,type EnemyKind,type GameEvent,type GameState,type Pickup,type SkillKind,type Vec,type WeaponKind,type DamageSource} from '../shared/types';
import {CONFIG,WORLD,difficultyAt,pickupReach} from './config';
import {clamp,distanceSquared,isOnPaperRoute,relativeSweep,sweepContact,segmentDistanceSquared} from './geometry';
import type {CombatContext} from './contracts';
import {updateWeapons} from './weapons';
import {activateSkill,canCollectPickup,restorePlayerHealth,updateSkills} from './skills';
import {updateEnemies,updateEnemyShots} from './enemies';
import {collectCoins,dropCoins} from './rewards';
import {advanceWave,spawnMarketEnemies} from './waves';
import {driftPickup,launchPickup,skillContact} from './pickup-motion';
import {giantPulseContact,giantPulseLifetime} from './giant-bun';
import {ELEMENTAL_KINDS,ULTIMATE_KINDS,isUltimate,type ElementalKind,type UltimateKind} from '../shared/types';

/** Resolve each crossed drop in travel order. A stationary rider gets the closest overlapping choice. */
function pickupContacts<T extends Vec & {id:number}>(start:Vec,end:Vec,items:T[],reach:(item:T)=>number) {
  const contacts:{item:T;time:number}[]=[];
  for(const item of items){
    const time=sweepContact(start,end,item,reach(item));
    if(time!==null)contacts.push({item,time});
  }
  return contacts.sort((a,b)=>a.time-b.time || distanceSquared(a.item,start)-distanceSquared(b.item,start) || a.item.id-b.item.id);
}

/** Seeded simulation shared by the main game and the practice arena. */
export class Game {
  state!:GameState;
  private randomState=1;private nextId=1;private nextEnemyAt=.35;private nextPickupAt=1;private nextWeaponAt=4;
  private emptySince=0;private events:GameEvent[]=[];private weaponBag:WeaponKind[]=[];
  private batch=0;private openingPlaced=false;private dropsSinceFan=0;private waveDemo=false;
  private nextUltimateAt=8;private ultimateIndex=0;
  private nextHealthAt=0;
  private dispatchWasActive=false;private contactDamage=new Map<number,number>();
  private ctx:CombatContext={damage:(e,a,source,impactAngle)=>this.damage(e,a,source,impactAngle),emit:e=>this.emit(e),id:()=>this.nextId++,random:()=>this.random(),push:(e,o,d)=>this.push(e,o,d),active:e=>this.active(e),spawnPickup:(k,p,extra)=>this.addPickup(k,p,extra)};
  constructor(seed=Date.now()){this.reset(seed);}
  reset(seed=Date.now(),practice=false):void {
    const stableSeed=Number.isFinite(seed)?seed>>>0:1;
    this.randomState=stableSeed||0x6d2b79f5;this.nextId=1;this.nextEnemyAt=.35;this.nextPickupAt=CONFIG.pickup.firstAt;this.nextWeaponAt=CONFIG.weapons.dropFirst;
    this.emptySince=0;this.events=[];this.weaponBag=[];this.dispatchWasActive=false;
    this.batch=0;this.openingPlaced=false;this.dropsSinceFan=0;this.waveDemo=false;
    this.nextUltimateAt=8;this.ultimateIndex=0;
    this.nextHealthAt=0;
    this.state={ultimates:[],elementalFields:[],seed:stableSeed,time:0,score:0,kills:0,stage:1,wave:1,waveStartedAt:0,coins:[],collectedCoins:0,combo:0,comboUntil:0,revivesUsed:0,fields:[],ended:false,cause:null,practice,
      player:{...WORLD.start,px:WORLD.start.x,py:WORLD.start.y,vx:0,vy:0,facing:1,radius:CONFIG.player.radius,skateUntil:0,hp:100,maxHp:100,invulnerableUntil:0,hurtAt:-100,bubbleUntil:0,heatUntil:0,stampUntil:0,moveDirection:{x:1,y:0},sprintTime:0,sprintMultiplier:1,dashUntil:0,dashReadyAt:0,dashDirection:{x:1,y:0}},
      enemies:[],pickups:[],weapon:{kind:'tongs',readyAt:0,equippedAt:0,targetId:null,attack:null},meleeWaves:[],projectiles:[],enemyShots:[],weaponDrops:[],zones:[],
      effects:{dispatchUntil:0,dispatchStartedAt:0,dispatchCooldownUntil:0,pendingSupplyAt:0,pendingSupplyUntil:0,supplyGroupId:0},lastDamage:null,lastDamageAmount:0};
  }
  update(dt:number,input:Vec):void {
    if(this.state.ended||!Number.isFinite(dt)||dt<=0)return;
    const safeInput={x:Number.isFinite(input.x)?input.x:0,y:Number.isFinite(input.y)?input.y:0};
    // Hosts use fixed steps. Limit an accidental enormous elapsed value to bounded work.
    let remaining=Math.min(dt,1);
    while(remaining>1e-10&&!this.state.ended){const step=Math.min(CONFIG.step,remaining);this.step(step,safeInput);remaining-=step;}
  }
  drainEvents():GameEvent[]{const result=this.events;this.events=[];return result;}
  setPractice(practice:boolean):void{this.state.practice=practice;}
  setWeapon(kind:WeaponKind):void{if(WEAPON_KINDS.includes(kind)&&!this.state.ended)this.equip(kind,false);}
  triggerSkill(kind:SkillKind):void{if(!this.state.ended)activateSkill(this.state,kind,this.state.player,this.ctx);}
  revive():boolean {
    const s=this.state;
    if(!s.ended||s.practice||s.revivesUsed!==0)return false;
    s.revivesUsed++;
    s.ended=false;s.cause=null;s.lastDamage=null;s.lastDamageAmount=0;
    s.player.hp=s.player.maxHp;s.player.hurtAt=-100;s.player.invulnerableUntil=s.time+CONFIG.reviveProtection;
    this.nextHealthAt=0;
    return true;
  }
  setupPickupDemo():void {
    this.reset(1425,true);
    const s=this.state;
    Object.assign(s.player,{x:390,y:440,px:390,py:440});
    // The first training order glides along the marked rightward approach.
    this.addPickup('fan',{x:540,y:440},{vx:90,vy:-28});
    this.addPickup('soda',{x:915,y:285});
    // Densities vary between the central group, the outer flames and the surviving queue.
    const groups=[[522,402,12],[643,432,8],[569,555,8],[440,509,6],[550,308,5],[1030,348,8]];
    for(const [x,y,count] of groups){
      for(let i=0;i<count;i++){
        const e=this.spawnEnemy('bun',{x:x+(i%4)*23,y:y+Math.floor(i/4)*23});
        e.march={x:1,y:0,until:2};
      }
    }
  }
  setupCombatDemo(kind:UltimateKind|ElementalKind|'giantBun'):void {
    this.reset(51623,true);
    const p=this.state.player;
    if(kind==='giantBun'){
      this.spawnEnemy('giantBun',{x:960,y:305});
      return;
    }
    // The same spread of targets makes it possible to compare each pickup's footprint.
    const positions=[[160,274],[309,263],[496,222],[797,244],[914,248],[1120,236],
      [236,406],[428,433],[822,383],[998,427],[1134,415],[172,544],[353,553],
      [496,581],[717,535],[871,577],[1045,577],[1140,552]];
    if(isUltimate(kind)){
      positions.forEach(([x,y],i)=>this.spawnEnemy(i%6===0?'bowl':i%4===0?'box':'bun',{x,y}));
    }else{
      // Put a ranged foe and several different snacks behind the pickup. The rider can
      // watch the status persist there while their forward-facing weapon keeps firing.
      const queue=['bowl','onigiri','box','siumai','bowl','zongzi'] as const;
      positions.forEach(([x,y],i)=>this.spawnEnemy(queue[i%queue.length],{x,y}));
      this.spawnEnemy('bowl',{x:p.x-136,y:p.y+45});
      this.spawnEnemy('zongzi',{x:p.x-70,y:p.y-145});
    }
    this.addPickup(kind,{x:p.x+80,y:p.y},{vx:88,vy:34});
  }
  setupWaveDemo():void {
    this.reset(3912,true);
    const s=this.state;
    s.time=CONFIG.waves.firstDuration-2;
    s.stage=difficultyAt(s.time).stage;
    this.waveDemo=true;
    this.addPickup('soda',{x:875,y:320},{vx:76,vy:-55});
    this.addPickup('fan',{x:795,y:475},{vx:89,vy:42});
    for(let i=0;i<6;i++)dropCoins(s,{x:850+i*23,y:430},1,this.ctx);
    for(let i=0;i<6;i++){
      const e=this.spawnEnemy('bun',{x:175+i*28,y:300});
      e.march={x:1,y:0,until:s.time+5};
    }
  }
  dash(intent?:Vec):boolean {
    const s=this.state,p=s.player;if(s.ended||s.time<(p.dashReadyAt??0))return false;
    const strength=intent?Math.hypot(intent.x,intent.y):0;
    p.dashFromMovement=Number.isFinite(strength)&&strength>=CONFIG.player.aimThreshold;
    const d=intent&&p.dashFromMovement
      ? {x:intent.x/strength,y:intent.y/strength} : p.moveDirection;
    p.dashDirection={...d};
    p.moveDirection={...d};
    p.dashUntil=s.time+CONFIG.player.dashDuration;p.dashReadyAt=s.time+CONFIG.player.dashCooldown;
    this.emit({type:'dash',x:p.x,y:p.y,angle:Math.atan2(d.y,d.x)});return true;
  }
  healPlayer():void {
    const s=this.state;
    if(!s.ended)restorePlayerHealth(s,s.player.maxHp,s.player,this.ctx);
  }
  clearArena():void{const s=this.state;s.giantPulses=[];s.ultimates=[];s.elementalFields=[];s.enemies=[];s.pickups=[];s.weaponDrops=[];s.projectiles=[];s.meleeWaves=[];s.enemyShots=[];s.zones=[];s.coins=[];s.fields=[];s.combo=0;s.comboUntil=0;this.waveDemo=false;s.player.dashUntil=0;s.player.dashReadyAt=0;s.player.sprintTime=0;s.player.sprintMultiplier=1;s.weapon.attack=null;s.weapon.targetId=null;}
  spawnEnemy(kind:EnemyKind,position?:Vec):Enemy {
    const cfg=CONFIG.enemies[kind],p=position??{x:this.state.player.x+140,y:this.state.player.y};
    const x=clamp(p.x,WORLD.bounds.left+cfg.radius,WORLD.bounds.right-cfg.radius),y=clamp(p.y,WORLD.bounds.top+cfg.radius,WORLD.bounds.bottom-cfg.radius);
    const facing=this.state.practice?(x<this.state.player.x?1:-1):(this.random()<.5?-1:1);
    const e:Enemy={id:this.nextId++,kind,x,y,px:x,py:y,radius:cfg.radius,spawnAt:this.state.practice?this.state.time-CONFIG.spawn.warning:this.state.time,slowUntil:0,phase:'chase',phaseUntil:this.state.time+CONFIG.spawn.warning+CONFIG.dash.approach,dashX:0,dashY:0,facing,hp:cfg.hp,maxHp:cfg.hp,hurtAt:-100,stunUntil:0,stunStartedAt:-100,bellResistUntil:0,contactSuppressedUntil:0,skateHitAt:-100,shotReadyAt:this.state.time+1.2+this.nextId%5*.3,shotWarnUntil:0,shotAngle:0};
    this.state.enemies.push(e);return e;
  }
  private emit(event:GameEvent){if(this.events.length>=1024)this.events.splice(0,256);this.events.push(event);}
  private random(){let x=this.randomState;x^=x<<13;x^=x>>>17;x^=x<<5;this.randomState=x>>>0;return this.randomState/0x100000000;}
  private active(e:Enemy){return e.hp>0&&e.jump?.phase!=='flight'&&this.state.time-e.spawnAt>=CONFIG.spawn.warning-1e-9;}
  private step(dt:number,input:Vec){
    const s=this.state,p=s.player;s.time+=dt;
    const difficulty=difficultyAt(s.time);
    s.stage=difficulty.stage;
    if(s.time>=s.comboUntil)s.combo=0;
    this.movePlayer(dt,input);
    if(!s.practice){
      const dispatch=s.effects.dispatchUntil>s.time;
      const batchSize=5+Math.min(s.wave,3),batchInterval=difficulty.interval*batchSize;
      if(this.dispatchWasActive&&!dispatch)this.nextEnemyAt=s.time+batchInterval;
      this.dispatchWasActive=dispatch;
      if(!dispatch&&s.time>=this.nextEnemyAt){
        const spawn=(kind:EnemyKind,at:Vec)=>this.spawnEnemy(kind,at);
        const opening=this.batch===0&&s.time<1&&s.enemies.length===0;
        const count=opening?CONFIG.spawn.openingCount:batchSize*(this.batch%3===2?2:1);
        spawnMarketEnemies(s,difficulty,count,spawn,this.ctx);
        this.batch++;
        this.nextEnemyAt=s.time+batchInterval;
      }
      this.schedulePickups();this.scheduleWeapon();this.scheduleHealth();
    }
    this.contactDamage=updateEnemies(s,dt,difficulty.speedScale,this.ctx);
    updateEnemyShots(s,dt);
    for(const pickup of s.pickups)driftPickup(pickup,s.seed,s.time,dt);
    updateSkills(s,dt,this.ctx,input);
    this.collectPickups(dt);this.collectWeapons();
    updateWeapons(s,dt,this.ctx);
    collectCoins(s,dt,this.ctx);
    this.contactPlayer(dt);
    if(!s.ended&&(!s.practice||this.waveDemo)){
      const previous=s.wave;
      advanceWave(s,this.ctx);
      if(s.wave!==previous){
        this.nextEnemyAt=s.time+.5;
        if(this.waveDemo){
          const count=5+Math.min(s.wave,3),y=490+(this.random()-.5)*25;
          for(let i=0;i<count;i++){
            const x=WORLD.bounds.left+34+i*28;
            const e=this.spawnEnemy('bun',{x,y});
            e.march={x:1,y:0,until:s.time+4.2};
            this.emit({type:'spawn',x,y});
          }
        }
      }
    }
  }
  private movePlayer(dt:number,input:Vec):void {
    const p=this.state.player;p.px=p.x;p.py=p.y;
    const length=Math.hypot(input.x,input.y);
    const direction=length>.001?{x:input.x/length,y:input.y/length}:p.moveDirection;
    const tuning=CONFIG.player;
    const strength=Math.min(1,length);
    p.sprintTime=length>.001?Math.min(tuning.sprintRampTime,(p.sprintTime??0)+dt):0;
    const progress=p.sprintTime/tuning.sprintRampTime;
    // Ease into the run without accelerating fine stick adjustments to full-throw pace.
    p.sprintMultiplier=1+(tuning.sprintMax-1)*progress**2*(3-2*progress)*strength**2;
    const onRoute=this.state.zones.some(z=>isOnPaperRoute(p,z,this.state.time));
    const multiplier=onRoute ? CONFIG.skills.route.speedMultiplier : 1;
    const pace=multiplier*p.sprintMultiplier;
    const maxSpeed=tuning.speed*pace;
    // Keep fine stick movements at walking pace and give a full throw the whole running speed.
    const targetSpeed=pace*strength*(tuning.precisionSpeed+(tuning.speed-tuning.precisionSpeed)*strength**2);
    if(length>=tuning.aimThreshold)p.moveDirection=direction;
    let dashRemaining=(p.dashUntil??0)-(this.state.time-dt);
    const dashDirection=p.dashDirection??direction;
    if(dashRemaining>1e-9){
      const released=p.dashFromMovement&&length<tuning.aimThreshold;
      const reversed=length>=tuning.aimThreshold&&direction.x*dashDirection.x+direction.y*dashDirection.y<-.5;
      if(released||reversed){p.dashUntil=0;dashRemaining=0;p.vx=0;p.vy=0;}
    }
    if(dashRemaining>1e-9){
      // A tap from rest keeps its impulse. A held direction blends into running at the exit.
      const progress=clamp(1-(dashRemaining-dt*.5)/tuning.dashExitTime,0,1);
      const exit=progress*progress*(3-2*progress);
      const impulse=tuning.dashSpeed*(1-exit);
      p.vx=dashDirection.x*impulse+direction.x*targetSpeed*exit;
      p.vy=dashDirection.y*impulse+direction.y*targetSpeed*exit;
    }else{
      // Rotate the velocity, then change its magnitude. Ordinary corners retain their pace.
      let speed=Math.hypot(p.vx,p.vy);
      let heading=Math.atan2(p.vy,p.vx);
      if(length>.001){
        const desired=Math.atan2(direction.y,direction.x);
        const angle=Math.atan2(direction.y*p.vx-direction.x*p.vy,direction.x*p.vx+direction.y*p.vy);
        if(speed<1e-6||Math.abs(angle)>=Math.PI*.75){
          heading=desired;
        }else{
          const step=tuning.turnRate*dt;
          heading+=clamp(angle,-step,step);
        }
      }
      const response=targetSpeed>speed?tuning.accelerationTime:tuning.decelerationTime;
      const speedStep=Math.max(speed,maxSpeed)*dt/response;
      speed+=clamp(targetSpeed-speed,-speedStep,speedStep);
      p.vx=Math.cos(heading)*speed;
      p.vy=Math.sin(heading)*speed;
    }
    if(Math.abs(p.vx)>tuning.speed*tuning.aimThreshold)p.facing=p.vx<0?-1:1;
    const x=p.x+p.vx*dt,y=p.y+p.vy*dt;
    p.x=clamp(x,WORLD.bounds.left+p.radius,WORLD.bounds.right-p.radius);
    p.y=clamp(y,Math.max(WORLD.bounds.top+p.radius,tuning.minY),WORLD.bounds.bottom-p.radius);
    if(p.x!==x)p.vx=0;
    if(p.y!==y)p.vy=0;
    if(p.x===p.px&&p.y===p.py){p.sprintTime=0;p.sprintMultiplier=1;}
  }
  private contactPlayer(dt:number){
    const s=this.state,p=s.player;
    const contacts:Array<{id:number;kind:EnemyKind;t:number;amount:number;source:DamageSource;shot:boolean}>=[];
for(const e of s.enemies){if(e.kind==='giantBun'||!this.active(e)||e.contactSuppressedUntil>s.time)continue;const t=relativeSweep({x:p.px,y:p.py},p,{x:e.px,y:e.py},e,p.radius+e.radius);if(t!==null){const amount=this.contactDamage.get(e.id)??CONFIG.enemies[e.kind].damage;contacts.push({id:e.id,kind:e.kind,t,amount,source:e.kind==='box'&&amount===CONFIG.dash.damage?'dash':e.kind,shot:false});}}
    if(s.giantPulses?.length){
      s.giantPulses=s.giantPulses.filter(w=>s.time-dt<=w.bornAt+giantPulseLifetime(w));
      for(const w of s.giantPulses){
        const t=giantPulseContact(w,p,s.time,dt);
        if(t===null)continue;
        w.spent=true;
        contacts.push({id:w.id,kind:'giantBun',t,amount:w.hop===3?CONFIG.giant.finalDamage:CONFIG.enemies.giantBun.damage,source:'giantBun',shot:false});
      }
    }
    const spent=new Set<number>();
    for(const q of s.enemyShots??[]){const t=relativeSweep({x:p.px,y:p.py},p,{x:q.px,y:q.py},q,p.radius+q.radius);if(t!==null){spent.add(q.id);contacts.push({id:q.id,kind:'bowl',t,amount:q.damage,source:'bowl',shot:true});}}
    s.enemyShots=(s.enemyShots??[]).filter(q=>!spent.has(q.id));
    if(p.invulnerableUntil>s.time||(p.dashUntil??0)>s.time-dt+1e-9)return;
    contacts.sort((a,b)=>a.t-b.t||b.amount-a.amount||a.id-b.id);const hit=contacts[0];if(!hit)return;
    if(p.bubbleUntil>s.time){p.bubbleUntil=0;p.invulnerableUntil=s.time+CONFIG.player.protection;for(const e of s.enemies)if(distanceSquared(e,p)<=48**2)this.push(e,p,24);this.emit({type:'defend',kind:'bubble',x:p.x,y:p.y,victimId:hit.id});return;}
    const amount=Math.min(p.hp,hit.amount);p.hp-=amount;p.hurtAt=s.time;p.invulnerableUntil=s.time+CONFIG.player.protection;s.lastDamage=hit.source;s.lastDamageAmount=amount;
    this.emit({type:'damage',id:this.nextId++,victimId:0,source:hit.source,amount,nominal:hit.amount,x:p.x,y:p.y,time:s.time});
    if(p.hp<=0){s.ended=true;s.cause=hit.kind;p.vx=0;p.vy=0;p.sprintTime=0;p.sprintMultiplier=1;this.emit({type:'fail',kind:hit.kind,x:p.x,y:p.y,source:hit.source,amount});}
  }
  private damage(enemy:Enemy,amount:number,source:DamageSource,impactAngle?:number):number {
    if(this.state.ended||!this.active(enemy)||!Number.isFinite(amount)||amount<=0)return 0;
    const burst=WEAPON_KINDS.includes(source as WeaponKind),count=burst?Math.min(5,Math.ceil(amount)):1,chunk=burst?Math.ceil(amount/5):amount;
    let remaining=amount,total=0;
    for(let i=1;i<=count&&remaining>0&&enemy.hp>0;i++){
      const nominal=Math.min(chunk,remaining),actual=Math.min(enemy.hp,nominal);remaining-=nominal;enemy.hp-=actual;total+=actual;enemy.hurtAt=this.state.time;
      this.emit({type:'damage',id:this.nextId++,victimId:enemy.id,source,amount:actual,nominal,x:enemy.x,y:enemy.y,time:this.state.time,impactAngle,...(burst?{burstIndex:i,burstCount:count}:{})});
    }
    if(enemy.hp<=0){
      const s=this.state;
      s.kills++;s.score=s.kills;s.combo=s.time<s.comboUntil?s.combo+1:1;s.comboUntil=s.time+CONFIG.rewards.comboDuration;
      s.enemies=s.enemies.filter(e=>e.id!==enemy.id);
      const value=CONFIG.enemies[enemy.kind].coins+(s.player.stampUntil>s.time?1:0);
      dropCoins(s,enemy,value,this.ctx);
      this.emit({type:'kill',kind:enemy.kind,victimId:enemy.id,x:enemy.x,y:enemy.y,points:1,maxHp:enemy.maxHp,facing:enemy.facing,source,impactAngle});
    }
    return total;
  }
  private push(e:Enemy,origin:Vec,distance:number){const dx=e.x-origin.x,dy=e.y-origin.y,n=Math.hypot(dx,dy);const ux=n?dx/n:(e.id%2?1:-1),uy=n?dy/n:0;e.x=clamp(e.x+ux*distance,WORLD.bounds.left+e.radius,WORLD.bounds.right-e.radius);e.y=clamp(e.y+uy*distance,WORLD.bounds.top+e.radius,WORLD.bounds.bottom-e.radius);}
  private addPickup(kind:SkillKind,position:Vec,extra:Partial<Pickup>={}):Pickup|null {
    const active=this.state.pickups.filter(p=>!p.retiringUntil);
    if(kind==='health' ? active.some(p=>p.kind==='health') : active.filter(p=>p.kind!=='health').length>=CONFIG.pickup.cap)return null;
    const radius=CONFIG.pickup.radius,p:Pickup={id:this.nextId++,kind,x:clamp(position.x,WORLD.bounds.left+radius,WORLD.bounds.right-radius),y:clamp(position.y,Math.max(WORLD.bounds.top+radius,CONFIG.player.minY),WORLD.bounds.bottom-radius),radius,bornAt:this.state.time,...extra};
    launchPickup(p,this.state.seed);
    this.state.pickups.push(p);return p;
  }
  private pickupPosition(kind:SkillKind, other?:Vec):Vec|null {
    const s=this.state,b=WORLD.bounds;
    const openingFan=kind==='fan'&&!this.openingPlaced;
    let best:Vec|null=null,bestCount=-1;
    // Sample local groups once per drop. A nearby crowd gives a reason to detour to the fan.
    let target:Enemy|undefined;
    if(kind==='fan'&&!openingFan&&s.enemies.length){
      let most=-1;
      for(let sample=0;sample<5;sample++){
        const candidate=s.enemies[Math.floor(this.random()*s.enemies.length)];
        let neighbors=0;
        for(const enemy of s.enemies)if(distanceSquared(candidate,enemy)<120**2)neighbors++;
        if(neighbors>most){most=neighbors;target=candidate;}
      }
    }
    for(let i=0;i<48;i++){
      let x:number,y:number;
      if(openingFan||kind==='health'){
        const angle=this.random()*Math.PI*2,distance=135+this.random()*110;
        x=clamp(s.player.x+Math.cos(angle)*distance,b.left+32,b.right-32);
        y=clamp(s.player.y+Math.sin(angle)*distance,CONFIG.player.minY+12,b.bottom-32);
      }else if(target&&i<16){
        const dx=s.player.x-target.x,dy=s.player.y-target.y,n=Math.hypot(dx,dy)||1;
        const side=(this.random()-.5)*90;
        x=clamp(target.x+(dx*75-dy*side)/n,b.left+55,b.right-55);
        y=clamp(target.y+(dy*75+dx*side)/n,CONFIG.player.minY+18,b.bottom-55);
      }else{
        x=b.left+64+this.random()*(b.right-b.left-128);
        y=CONFIG.player.minY+25+this.random()*(b.bottom-CONFIG.player.minY-75);
      }
      const position={x,y};
      if(distanceSquared(position,s.player)<(CONFIG.pickup.reach+20)**2 ||
        s.pickups.some(p=>distanceSquared(p,position)<(pickupReach(p)+CONFIG.pickup.reach)**2) ||
        s.weaponDrops.some(p=>distanceSquared(p,position)<(CONFIG.weapons.pickupReach+CONFIG.pickup.reach)**2))continue;
      if(isUltimate(kind)&&distanceSquared(position,s.player)>325**2)continue;
      if(kind==='health'&&s.enemies.some(e=>e.hp>0&&distanceSquared(e,position)<(e.radius+42)**2))continue;
      if(other){
        const dx=x-s.player.x,dy=y-s.player.y,ox=other.x-s.player.x,oy=other.y-s.player.y;
        if(distanceSquared(position,other)<145**2||dx*ox+dy*oy>.72*Math.hypot(dx,dy)*Math.hypot(ox,oy))continue;
      }
      if(openingFan){
        if(distanceSquared(position,s.player)<100**2)continue;
        const count=s.enemies.filter(e=>distanceSquared(e,position)<CONFIG.skills.fan.fullRadius**2).length;
        if(count>bestCount){best=position;bestCount=count;}
        continue;
      }
      return position;
    }
    return best;
  }
  /** A single recovery slot remains available even when all skill choices are on the street. */
  private scheduleHealth(){
    const s=this.state;
    if(s.player.hp>=s.player.maxHp||s.time<this.nextHealthAt||s.pickups.some(p=>p.kind==='health'))return;
    const position=this.pickupPosition('health');
    if(position)this.addPickup('health',position);
    else this.nextHealthAt=s.time+.5;
  }
  private schedulePickups(){
    const s=this.state;
    s.pickups=s.pickups.filter(p=>(!p.expiresAt||p.expiresAt>s.time)&&(!p.retiringUntil||p.retiringUntil>s.time));
    const ordinaryCount=s.pickups.filter(p=>p.kind!=='health').length;
    if(ordinaryCount)this.emptySince=s.time;
    if(s.time<this.nextPickupAt&&!(ordinaryCount===0&&s.time-this.emptySince>=CONFIG.pickup.emptyGrace))return;
    const support:SkillKind[]=['skate','soda','bubble','lure','bell',...ELEMENTAL_KINDS];
    if(!this.openingPlaced&&ordinaryCount+2<=CONFIG.pickup.cap){
      const kind=support[Math.floor(this.random()*support.length)];
      const fan=this.pickupPosition('fan');
      const alternate=fan&&this.pickupPosition(kind,fan);
      if(fan&&alternate){
        const pair:[SkillKind,Vec][]=[['fan',fan],[kind,alternate]];
        if(this.random()<.5)pair.reverse();
        for(const [skill,position] of pair)this.addPickup(skill,position);
        this.openingPlaced=true;
      }
    }else if(this.openingPlaced&&ordinaryCount<CONFIG.pickup.cap){
      const kinds:SkillKind[]=['fan','fan',...support];
      if(s.time>=30)kinds.push('route','cones','hook','supply');
      if(s.time>=90)kinds.push('heat','dispatch','stamp');
      const needsFan=this.dropsSinceFan>=2&&!s.pickups.some(p=>p.kind==='fan'&&!p.retiringUntil);
      const ultimateDue=s.time>=this.nextUltimateAt&&!s.pickups.some(p=>!p.retiringUntil&&isUltimate(p.kind));
      const kind=needsFan?'fan':ultimateDue?ULTIMATE_KINDS[this.ultimateIndex]:kinds[Math.floor(this.random()*kinds.length)];
      const position=this.pickupPosition(kind);
      if(position&&this.addPickup(kind,position)){
        this.dropsSinceFan=kind==='fan'?0:this.dropsSinceFan+1;
        if(isUltimate(kind)){
          this.ultimateIndex=(this.ultimateIndex+1)%ULTIMATE_KINDS.length;
          this.nextUltimateAt=s.time+14;
        }
      }
    }
    this.nextPickupAt=s.time+(this.openingPlaced?CONFIG.pickup.interval:.5);this.emptySince=s.time;
  }
  private collectPickups(dt:number){
    const s=this.state,p=s.player;
    s.pickups=s.pickups.filter(p=>(!p.expiresAt||p.expiresAt>s.time)&&(!p.retiringUntil||p.retiringUntil>s.time));
    const available=s.pickups.filter(q=>canCollectPickup(s,q));
    const start={x:p.px,y:p.py};
    const groups=new Set<number>();
    const contacts=available.map(item=>skillContact(item,start,p,s.time,dt)).filter(hit=>hit!==null)
      .sort((a,b)=>a.time-b.time||a.distance-b.distance||a.item.id-b.item.id);
    for(const {item:q,time,at} of contacts){
      if(q.groupId&&groups.has(q.groupId))continue;
      if(q.groupId){groups.add(q.groupId);for(const sibling of s.pickups)if(sibling.groupId===q.groupId&&sibling.id!==q.id){sibling.retiringUntil=s.time+.4;sibling.pulledUntil=0;}}
      s.pickups=s.pickups.filter(v=>v.id!==q.id);
      const origin={x:p.px+(p.x-p.px)*time,y:p.py+(p.y-p.py)*time};
      this.emit({type:'pickup',kind:q.kind,...origin});activateSkill(s,q.kind,origin,this.ctx,at);
      if(q.kind==='health')this.nextHealthAt=s.time+CONFIG.skills.health.cooldown;
    }
    if(!s.pickups.some(q=>q.kind!=='health'))this.emptySince=s.time;
  }
  private equip(kind:WeaponKind,drop:boolean){
    const s=this.state,w=s.weapon;if(w.kind===kind)return;const previous=w.kind;
    if(drop){s.weaponDrops=s.weaponDrops.filter(d=>!d.returnDrop);s.weaponDrops.push({id:this.nextId++,kind:previous,x:s.player.x,y:s.player.y,radius:CONFIG.weapons.dropRadius,bornAt:s.time,expiresAt:s.time+10,readyAt:s.time+2,returnDrop:true,leftPickupCircle:false});}
    w.kind=kind;w.readyAt=Math.max(w.readyAt,s.time+.25);w.equippedAt=s.time;w.attack=null;w.targetId=null;
    this.emit({type:'weapon',kind,previous,x:s.player.x,y:s.player.y});
  }
  private collectWeapons(){
    const s=this.state,p=s.player;s.weaponDrops=s.weaponDrops.filter(d=>d.expiresAt>s.time);
    const start={x:p.px,y:p.py},reach=CONFIG.weapons.pickupReach;
    // Starting outside matters: the outward sweep still intersects the old package.
    for(const d of s.weaponDrops)if(d.returnDrop&&s.time>=d.readyAt&&distanceSquared(d,start)>(reach+2)**2)d.leftPickupCircle=true;
    const available=s.weaponDrops.filter(d=>s.time>=d.readyAt&&(!d.returnDrop||d.leftPickupCircle));
    const hit=pickupContacts(start,p,available,()=>reach)[0];
    if(!hit)return;
    s.weaponDrops=s.weaponDrops.filter(d=>d.id!==hit.item.id);
    this.equip(hit.item.kind,true);
  }
  private scheduleWeapon(){
    const s=this.state;s.weaponDrops=s.weaponDrops.filter(d=>d.expiresAt>s.time);
    if(s.time<this.nextWeaponAt||s.weaponDrops.filter(d=>!d.returnDrop).length>=2)return;
    const b=WORLD.bounds;
    for(let i=0;i<32;i++){
      const top=Math.max(b.top+55,CONFIG.player.minY),x=b.left+65+this.random()*(b.right-b.left-130),y=top+this.random()*(b.bottom-top-55),position={x,y};
      if(distanceSquared(position,s.player)<90**2||distanceSquared(position,s.player)>270**2||s.enemies.some(e=>distanceSquared(e,position)<75**2||(e.phase==='warn'||e.phase==='dash')&&segmentDistanceSquared(e,{x:e.x+e.dashX*200,y:e.y+e.dashY*200},position)<55**2)||s.pickups.some(p=>distanceSquared(p,position)<(pickupReach(p)+CONFIG.weapons.pickupReach)**2)||s.weaponDrops.some(p=>distanceSquared(p,position)<(2*CONFIG.weapons.pickupReach)**2))continue;
      if(!this.weaponBag.length){this.weaponBag=WEAPON_KINDS.filter(k=>k!==s.weapon.kind);for(let j=this.weaponBag.length-1;j>0;j--){const k=Math.floor(this.random()*(j+1));[this.weaponBag[j],this.weaponBag[k]]=[this.weaponBag[k],this.weaponBag[j]];}}
      let kind=this.weaponBag.pop()!;if(kind===s.weapon.kind)kind=this.weaponBag.pop()??WEAPON_KINDS.find(k=>k!==s.weapon.kind)!;
      s.weaponDrops.push({id:this.nextId++,kind,x,y,radius:CONFIG.weapons.dropRadius,bornAt:s.time,expiresAt:s.time+20,readyAt:s.time,returnDrop:false,leftPickupCircle:true});this.nextWeaponAt=s.time+10+this.random()*4;return;
    }
    this.nextWeaponAt=s.time+1;
  }
}




