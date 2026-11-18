import {WEAPON_KINDS,type Enemy,type EnemyKind,type GameEvent,type GameState,type Pickup,type SkillKind,type Vec,type WeaponKind,type DamageSource} from '../shared/types';
import {CONFIG,WORLD,difficultyAt} from './config';
import {clamp,distanceSquared,relativeSweep,sweepContact,segmentDistanceSquared} from './geometry';
import type {CombatContext} from './contracts';
import {updateWeapons} from './weapons';
import {activateSkill,updateSkills} from './skills';
import {updateEnemies,updateEnemyShots} from './enemies';

/** Seeded, platform-independent V2 simulation. UI and audio consume events only. */
export class Game {
  state!:GameState;
  private randomState=1;private nextId=1;private nextEnemyAt=.35;private nextPickupAt=1;private nextWeaponAt=4;
  private emptySince=0;private killPoints=0;private events:GameEvent[]=[];private weaponBag:WeaponKind[]=[];
  private dispatchWasActive=false;private contactDamage=new Map<number,number>();
  private ctx:CombatContext={damage:(e,a,source)=>this.damage(e,a,source),emit:e=>this.emit(e),id:()=>this.nextId++,random:()=>this.random(),push:(e,o,d)=>this.push(e,o,d),active:e=>this.active(e),spawnPickup:(k,p,extra)=>this.addPickup(k,p,extra)};
  constructor(seed=Date.now()){this.reset(seed);}
  reset(seed=Date.now(),practice=false):void {
    const stableSeed=Number.isFinite(seed)?seed>>>0:1;
    this.randomState=stableSeed||0x6d2b79f5;this.nextId=1;this.nextEnemyAt=.35;this.nextPickupAt=CONFIG.pickup.firstAt;this.nextWeaponAt=CONFIG.weapons.dropFirst;
    this.emptySince=0;this.killPoints=0;this.events=[];this.weaponBag=[];this.dispatchWasActive=false;
    this.state={seed:stableSeed,time:0,score:0,kills:0,stage:1,ended:false,cause:null,practice,
      player:{...WORLD.start,px:WORLD.start.x,py:WORLD.start.y,vx:0,vy:0,facing:1,radius:CONFIG.player.radius,skateUntil:0,hp:100,maxHp:100,invulnerableUntil:0,hurtAt:-100,bubbleUntil:0,heatUntil:0,stampUntil:0,moveDirection:{x:1,y:0},sprintTime:0,sprintMultiplier:1,sprintDirection:{x:1,y:0},dashUntil:0,dashReadyAt:0,dashDirection:{x:1,y:0}},
      enemies:[],pickups:[],weapon:{kind:'tongs',readyAt:0,equippedAt:0,targetId:null,attack:null},projectiles:[],enemyShots:[],weaponDrops:[],zones:[],
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
  dash():boolean {
    const s=this.state,p=s.player;if(s.ended||s.time<(p.dashReadyAt??0))return false;
    const d=p.moveDirection,n=Math.hypot(d.x,d.y)||1;p.dashDirection={x:d.x/n,y:d.y/n};
    p.dashUntil=s.time+CONFIG.player.dashDuration;p.dashReadyAt=s.time+CONFIG.player.dashCooldown;
    p.sprintTime=0;p.sprintMultiplier=1;
    this.emit({type:'dash',x:p.x,y:p.y,angle:Math.atan2(d.y,d.x)});return true;
  }
  healPlayer():void {
    if(this.state.ended)return;const p=this.state.player,amount=p.maxHp-p.hp;p.hp=p.maxHp;
    if(amount>0)this.emit({type:'heal',id:this.nextId++,amount,x:p.x,y:p.y});
  }
  clearArena():void{const s=this.state;s.enemies=[];s.pickups=[];s.weaponDrops=[];s.projectiles=[];s.enemyShots=[];s.zones=[];s.player.dashUntil=0;s.player.dashReadyAt=0;s.player.sprintTime=0;s.player.sprintMultiplier=1;s.weapon.attack=null;s.weapon.targetId=null;}
  spawnEnemy(kind:EnemyKind,position?:Vec):Enemy {
    const cfg=CONFIG.enemies[kind],p=position??{x:this.state.player.x+140,y:this.state.player.y};
    const x=clamp(p.x,WORLD.bounds.left+cfg.radius,WORLD.bounds.right-cfg.radius),y=clamp(p.y,WORLD.bounds.top+cfg.radius,WORLD.bounds.bottom-cfg.radius);
    const e:Enemy={id:this.nextId++,kind,x,y,px:x,py:y,radius:cfg.radius,spawnAt:this.state.practice?this.state.time-CONFIG.spawn.warning:this.state.time,slowUntil:0,phase:'chase',phaseUntil:this.state.time+CONFIG.spawn.warning+CONFIG.dash.approach,dashX:0,dashY:0,facing:x<this.state.player.x?1:-1,hp:cfg.hp,maxHp:cfg.hp,hurtAt:-100,stunUntil:0,stunStartedAt:-100,bellResistUntil:0,contactSuppressedUntil:0,skateHitAt:-100,wanderAngle:(this.nextId*2.399),wanderUntil:this.state.time+1,shotReadyAt:this.state.time+1.2+this.nextId%5*.3,shotWarnUntil:0,shotAngle:0};
    this.state.enemies.push(e);return e;
  }
  private emit(event:GameEvent){if(this.events.length>=1024)this.events.splice(0,256);this.events.push(event);}
  private random(){let x=this.randomState;x^=x<<13;x^=x>>>17;x^=x<<5;this.randomState=x>>>0;return this.randomState/0x100000000;}
  private active(e:Enemy){return e.hp>0&&this.state.time-e.spawnAt>=CONFIG.spawn.warning-1e-9;}
  private step(dt:number,input:Vec){
    const s=this.state,p=s.player;s.time+=dt;
    const difficulty=difficultyAt(s.time);
    if(difficulty.stage!==s.stage){s.stage=difficulty.stage;this.emit({type:'stage',stage:s.stage});}
    this.movePlayer(dt,input);
    if(!s.practice){
      const dispatch=s.effects.dispatchUntil>s.time;
      if(dispatch||this.dispatchWasActive)this.nextEnemyAt=s.time+difficulty.interval;
      this.dispatchWasActive=dispatch;
      if(!dispatch&&s.time>=this.nextEnemyAt){if(s.enemies.length<difficulty.cap)this.spawnNaturalEnemy(difficulty.weights);this.nextEnemyAt=s.time+difficulty.interval;}
      this.schedulePickups();this.scheduleWeapon();
    }
    this.contactDamage=updateEnemies(s,dt,difficulty.speedScale,this.ctx);
    updateEnemyShots(s,dt);
    updateSkills(s,dt,this.ctx);
    this.collectPickups();this.collectWeapons();
    updateWeapons(s,dt,this.ctx);
    this.contactPlayer(dt);
    s.score=s.practice?0:Math.floor(s.time+1e-9)*10+this.killPoints;
  }
  private movePlayer(dt:number,input:Vec){
    const p=this.state.player;p.px=p.x;p.py=p.y;
    const length=Math.hypot(input.x,input.y),scale=length>1?1/length:1;
    const direction=length>.001?{x:input.x/length,y:input.y/length}:p.moveDirection;
    const previous=p.sprintDirection??direction;
    if(length<=.001||direction.x*previous.x+direction.y*previous.y<.985){p.sprintTime=0;p.sprintDirection={...direction};}
    else p.sprintTime=(p.sprintTime??0)+dt;
    p.sprintMultiplier=1+(CONFIG.player.sprintMax-1)*clamp(((p.sprintTime??0)-CONFIG.player.sprintAfter)/.6,0,1);
    let multiplier=1;
    for(const z of this.state.zones)if(z.kind==='route'&&z.expiresAt>this.state.time){
      const dx=p.x-z.x,dy=p.y-z.y,along=dx*Math.cos(z.angle)+dy*Math.sin(z.angle),across=-dx*Math.sin(z.angle)+dy*Math.cos(z.angle);
      if(along>=0&&along<=z.length&&Math.abs(across)<=z.width/2)multiplier=1.2;
    }
    const maxSpeed=CONFIG.player.speed*multiplier*(p.sprintMultiplier??1),targetX=input.x*scale*maxSpeed,targetY=input.y*scale*maxSpeed;
    const dx=targetX-p.vx,dy=targetY-p.vy,delta=Math.hypot(dx,dy),maxChange=maxSpeed*dt/(length>.001?CONFIG.player.accelerationTime:CONFIG.player.decelerationTime),change=delta>maxChange?maxChange/delta:1;
    p.vx+=dx*change;p.vy+=dy*change;
    if((p.dashUntil??0)>this.state.time-dt+1e-9){const d=p.dashDirection??p.moveDirection;p.vx=d.x*CONFIG.player.speed*CONFIG.player.dashSpeed;p.vy=d.y*CONFIG.player.speed*CONFIG.player.dashSpeed;}
    if(length>.001&&Number.isFinite(length))p.moveDirection={x:input.x/length,y:input.y/length};
    if(Math.abs(p.vx)>1)p.facing=p.vx<0?-1:1;
    p.x=clamp(p.x+p.vx*dt,WORLD.bounds.left+p.radius,WORLD.bounds.right-p.radius);p.y=clamp(p.y+p.vy*dt,Math.max(WORLD.bounds.top+p.radius,CONFIG.player.minY),WORLD.bounds.bottom-p.radius);
    if(length>.001&&Math.hypot(p.x-p.px,p.y-p.py)<CONFIG.player.speed*dt*.1){p.sprintTime=0;p.sprintMultiplier=1;}
  }
  private contactPlayer(dt:number){
    const s=this.state,p=s.player;
    const contacts:Array<{id:number;kind:EnemyKind;t:number;amount:number;source:DamageSource;shot:boolean}>=[];
    for(const e of s.enemies){if(!this.active(e)||e.contactSuppressedUntil>s.time)continue;const t=relativeSweep({x:p.px,y:p.py},p,{x:e.px,y:e.py},e,p.radius+e.radius);if(t!==null){const amount=this.contactDamage.get(e.id)??CONFIG.enemies[e.kind].damage;contacts.push({id:e.id,kind:e.kind,t,amount,source:e.kind==='box'&&amount===20?'dash':e.kind,shot:false});}}
    const spent=new Set<number>();
    for(const q of s.enemyShots??[]){const t=relativeSweep({x:p.px,y:p.py},p,{x:q.px,y:q.py},q,p.radius+q.radius);if(t!==null){spent.add(q.id);contacts.push({id:q.id,kind:'bowl',t,amount:q.damage,source:'bowl',shot:true});}}
    s.enemyShots=(s.enemyShots??[]).filter(q=>!spent.has(q.id));
    if(p.invulnerableUntil>s.time||(p.dashUntil??0)>s.time-dt+1e-9)return;
    contacts.sort((a,b)=>a.t-b.t||b.amount-a.amount||a.id-b.id);const hit=contacts[0];if(!hit)return;
    if(p.bubbleUntil>s.time){p.bubbleUntil=0;p.invulnerableUntil=s.time+CONFIG.player.protection;for(const e of s.enemies)if(distanceSquared(e,p)<=48**2)this.push(e,p,24);this.emit({type:'defend',kind:'bubble',x:p.x,y:p.y,victimId:hit.id});return;}
    const amount=Math.min(p.hp,hit.amount);p.hp-=amount;p.hurtAt=s.time;p.invulnerableUntil=s.time+CONFIG.player.protection;s.lastDamage=hit.source;s.lastDamageAmount=amount;
    this.emit({type:'damage',id:this.nextId++,victimId:0,source:hit.source,amount,nominal:hit.amount,x:p.x,y:p.y,time:s.time});
    if(p.hp<=0){s.ended=true;s.cause=hit.kind;p.vx=0;p.vy=0;this.emit({type:'fail',kind:hit.kind,x:p.x,y:p.y,source:hit.source,amount});}
  }
  private damage(enemy:Enemy,amount:number,source:DamageSource):number {
    if(this.state.ended||!this.active(enemy)||!Number.isFinite(amount)||amount<=0)return 0;
    const burst=WEAPON_KINDS.includes(source as WeaponKind),count=burst?Math.min(5,Math.ceil(amount)):1,chunk=burst?Math.ceil(amount/5):amount;
    let remaining=amount,total=0;
    for(let i=1;i<=count&&remaining>0&&enemy.hp>0;i++){
      const nominal=Math.min(chunk,remaining),actual=Math.min(enemy.hp,nominal);remaining-=nominal;enemy.hp-=actual;total+=actual;enemy.hurtAt=this.state.time;
      this.emit({type:'damage',id:this.nextId++,victimId:enemy.id,source,amount:actual,nominal,x:enemy.x,y:enemy.y,time:this.state.time,...(burst?{burstIndex:i,burstCount:count}:{})});
    }
    if(enemy.hp<=0){const points=this.state.practice?0:Math.floor(CONFIG.enemies[enemy.kind].points*(this.state.player.stampUntil>this.state.time?1.5:1));this.state.kills++;this.killPoints+=points;this.state.enemies=this.state.enemies.filter(e=>e.id!==enemy.id);this.emit({type:'kill',kind:enemy.kind,victimId:enemy.id,x:enemy.x,y:enemy.y,points});}
    return total;
  }
  private push(e:Enemy,origin:Vec,distance:number){const dx=e.x-origin.x,dy=e.y-origin.y,n=Math.hypot(dx,dy);const ux=n?dx/n:(e.id%2?1:-1),uy=n?dy/n:0;e.x=clamp(e.x+ux*distance,WORLD.bounds.left+e.radius,WORLD.bounds.right-e.radius);e.y=clamp(e.y+uy*distance,WORLD.bounds.top+e.radius,WORLD.bounds.bottom-e.radius);}
  private spawnNaturalEnemy(weights:readonly[number,number,number]){
    const roll=this.random(),kind:EnemyKind=roll<weights[0]?'bun':roll<weights[0]+weights[1]?'box':'bowl',r=CONFIG.enemies[kind].radius,b=WORLD.bounds;
    for(let attempt=0;attempt<CONFIG.spawn.attempts;attempt++){
      const side=Math.floor(this.random()*4),hx=b.left+r+this.random()*(b.right-b.left-2*r),vy=b.top+r+this.random()*(b.bottom-b.top-2*r),x=side===0?b.left+r:side===1?b.right-r:hx,y=side===2?b.top+r:side===3?b.bottom-r:vy;
      if(distanceSquared({x,y},this.state.player)<CONFIG.spawn.safeDistance**2)continue;
      this.spawnEnemy(kind,{x,y});this.emit({type:'spawn',x,y});return;
    }
  }
  private addPickup(kind:SkillKind,position:Vec,extra:Partial<Pickup>={}):Pickup|null {
    if(this.state.pickups.filter(p=>!p.retiringUntil).length>=CONFIG.pickup.cap)return null;
    const radius=CONFIG.pickup.radius,p:Pickup={id:this.nextId++,kind,x:clamp(position.x,WORLD.bounds.left+radius,WORLD.bounds.right-radius),y:clamp(position.y,Math.max(WORLD.bounds.top+radius,CONFIG.player.minY),WORLD.bounds.bottom-radius),radius,bornAt:this.state.time,...extra};
    this.state.pickups.push(p);return p;
  }
  private schedulePickups(){
    const s=this.state;s.pickups=s.pickups.filter(p=>(!p.expiresAt||p.expiresAt>s.time)&&(!p.retiringUntil||p.retiringUntil>s.time));
    if(s.pickups.length)this.emptySince=s.time;
    if(s.time<this.nextPickupAt&&!(s.pickups.length===0&&s.time-this.emptySince>=CONFIG.pickup.emptyGrace))return;
    if(s.pickups.length<CONFIG.pickup.cap){
      const kinds:SkillKind[]=['fan','skate','soda','bubble','lure','bell'];if(s.time>=30)kinds.push('route','cones','hook','supply');if(s.time>=90)kinds.push('heat','dispatch','stamp');
      const kind=kinds[Math.floor(this.random()*kinds.length)];
      for(let i=0;i<32;i++){const b=WORLD.bounds,x=b.left+64+this.random()*(b.right-b.left-128),y=b.top+50+this.random()*(b.bottom-b.top-100);if(distanceSquared({x,y},s.player)<(s.player.radius+CONFIG.pickup.radius+38)**2||s.pickups.some(p=>distanceSquared(p,{x,y})<76**2)||s.weaponDrops.some(p=>distanceSquared(p,{x,y})<65**2))continue;this.addPickup(kind,{x,y});break;}
    }
    this.nextPickupAt=s.time+CONFIG.pickup.interval;this.emptySince=s.time;
  }
  private collectPickups(){
    const s=this.state,p=s.player;
    s.pickups=s.pickups.filter(p=>(!p.expiresAt||p.expiresAt>s.time)&&(!p.retiringUntil||p.retiringUntil>s.time));
    const contacts=s.pickups.filter(q=>!q.retiringUntil&&(q.readyAt??0)<=s.time&&(q.disabledUntil??0)<=s.time&&!(q.kind==='dispatch'&&s.effects.dispatchCooldownUntil>s.time)).map(q=>({q,t:sweepContact({x:p.px,y:p.py},p,q,p.radius+q.radius)})).filter(v=>v.t!==null).sort((a,b)=>a.t!-b.t!||a.q.id-b.q.id);
    const consumed=new Set<number>(),groups=new Set<number>();
    for(const {q,t} of contacts){
      if(consumed.has(q.id)||q.groupId&&groups.has(q.groupId))continue;
      if(q.groupId){groups.add(q.groupId);for(const sibling of s.pickups)if(sibling.groupId===q.groupId&&sibling.id!==q.id){sibling.retiringUntil=s.time+.4;sibling.pulledUntil=0;}}
      consumed.add(q.id);s.pickups=s.pickups.filter(v=>v.id!==q.id);
      const origin={x:p.px+(p.x-p.px)*t!,y:p.py+(p.y-p.py)*t!};this.emit({type:'pickup',kind:q.kind,...origin});activateSkill(s,q.kind,origin,this.ctx);
    }
    if(!s.pickups.length)this.emptySince=s.time;
  }
  private equip(kind:WeaponKind,drop:boolean){
    const s=this.state,w=s.weapon;if(w.kind===kind)return;const previous=w.kind;
    if(drop){s.weaponDrops=s.weaponDrops.filter(d=>!d.returnDrop);s.weaponDrops.push({id:this.nextId++,kind:previous,x:s.player.x,y:s.player.y,radius:12,bornAt:s.time,expiresAt:s.time+10,readyAt:s.time+2,returnDrop:true,leftPickupCircle:false});}
    w.kind=kind;w.readyAt=Math.max(w.readyAt,s.time+.25);w.equippedAt=s.time;w.attack=null;w.targetId=null;
    this.emit({type:'weapon',kind,previous,x:s.player.x,y:s.player.y});
  }
  private collectWeapons(){
    const s=this.state,p=s.player;s.weaponDrops=s.weaponDrops.filter(d=>d.expiresAt>s.time);
    for(const d of s.weaponDrops)if(d.returnDrop&&s.time>=d.readyAt&&distanceSquared(d,p)>(d.radius+p.radius+2)**2)d.leftPickupCircle=true;
    const contacts=s.weaponDrops.filter(d=>s.time>=d.readyAt&&(!d.returnDrop||d.leftPickupCircle)).map(d=>({d,t:sweepContact({x:p.px,y:p.py},p,d,d.radius+p.radius)})).filter(v=>v.t!==null).sort((a,b)=>a.t!-b.t!||a.d.id-b.d.id);
    const hit=contacts[0];if(!hit)return;s.weaponDrops=s.weaponDrops.filter(d=>d.id!==hit.d.id);this.equip(hit.d.kind,true);
  }
  private scheduleWeapon(){
    const s=this.state;s.weaponDrops=s.weaponDrops.filter(d=>d.expiresAt>s.time);
    if(s.time<this.nextWeaponAt||s.weaponDrops.filter(d=>!d.returnDrop).length>=2)return;
    const b=WORLD.bounds;
    for(let i=0;i<32;i++){
      const top=Math.max(b.top+55,CONFIG.player.minY),x=b.left+65+this.random()*(b.right-b.left-130),y=top+this.random()*(b.bottom-top-55),position={x,y};
      if(distanceSquared(position,s.player)<90**2||distanceSquared(position,s.player)>270**2||s.enemies.some(e=>distanceSquared(e,position)<75**2||(e.phase==='warn'||e.phase==='dash')&&segmentDistanceSquared(e,{x:e.x+e.dashX*200,y:e.y+e.dashY*200},position)<55**2)||s.pickups.some(p=>distanceSquared(p,position)<65**2)||s.weaponDrops.some(p=>distanceSquared(p,position)<65**2))continue;
      if(!this.weaponBag.length){this.weaponBag=WEAPON_KINDS.filter(k=>k!==s.weapon.kind);for(let j=this.weaponBag.length-1;j>0;j--){const k=Math.floor(this.random()*(j+1));[this.weaponBag[j],this.weaponBag[k]]=[this.weaponBag[k],this.weaponBag[j]];}}
      let kind=this.weaponBag.pop()!;if(kind===s.weapon.kind)kind=this.weaponBag.pop()??WEAPON_KINDS.find(k=>k!==s.weapon.kind)!;
      s.weaponDrops.push({id:this.nextId++,kind,x,y,radius:12,bornAt:s.time,expiresAt:s.time+20,readyAt:s.time,returnDrop:false,leftPickupCircle:true});this.nextWeaponAt=s.time+10+this.random()*4;return;
    }
    this.nextWeaponAt=s.time+1;
  }
}




