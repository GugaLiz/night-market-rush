import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {CONFIG,WORLD} from '../src/core/config';
import {EXPRESS,expressCast,WAVES} from '../src/core/ultimates';
import {isUltimate,ULTIMATE_KINDS,type Vec} from '../src/shared/types';

const still={x:0,y:0};
function lab(){
  const g=new Game(24);g.reset(24,true);g.state.weapon.readyAt=Infinity;return g;
}
function ticks(g:Game,n:number,input:Vec=still){
  for(let i=0;i<n;i++)g.update(CONFIG.step,input);
}
function target(g:Game,x:number,y:number){
  const e=g.spawnEnemy('bowl',{x,y});e.stunUntil=999;e.hp=e.maxHp=400;
  return e;
}

describe('clay delivery ultimates',()=>{
  it('allows aiming the icebox before opening; hits the facing half only and freezes surviving targets',()=>{
    const g=lab(),s=g.state,west=target(g,320,370),south=target(g,640,565),north=target(g,640,205);
    s.player.moveDirection={x:-1,y:0};
    g.triggerSkill('icebox');ticks(g,7,{x:0,y:1});
    expect([west.hp,south.hp,north.hp]).toEqual([400,400,400]);
    ticks(g,5,{x:0,y:1});ticks(g,26,{x:1,y:0});
    expect(north.hp).toBe(400);
    expect(south.hp).toBe(400-WAVES.icebox.damage);
    expect(south.chilledUntil).toBeGreaterThan(s.time);
    expect(west.hp).toBe(400);
    expect(s.player.x).toBeGreaterThan(735);
  });

  it('interrupts a charge at the instant the ice reaches it and preserves the full freeze under a second bell',()=>{
    const g=lab(),s=g.state,p=s.player;s.time=10;
    const box=g.spawnEnemy('box',{x:p.x+82,y:p.y});
    box.hp=box.maxHp=200;box.phase='warn';box.dashX=-1;box.phaseUntil=s.time+.5;
    g.triggerSkill('icebox');
    for(let i=0;i<36&&!box.chilledUntil;i++)ticks(g,1);
    const thaw=box.chilledUntil!;
    expect(thaw).toBeGreaterThan(s.time);expect(box.phase).toBe('recover');
    expect(box.contactSuppressedUntil).toBe(thaw);
    g.triggerSkill('bell');ticks(g,5);
    expect(box.bellStunUntil).toBeGreaterThan(s.time);expect(box.stunUntil).toBe(thaw);
    const x=box.x;
    while(s.time<thaw) {ticks(g,1);expect(box.phase).toBe('recover');expect(box.x).toBe(x);}
    expect(box.bellResistUntil).toBeGreaterThan(s.time);
    for(let i=0;i<300&&box.phase!=='warn';i++)ticks(g,1);
    expect(box.phase).toBe('warn');expect(box.phaseUntil-s.time).toBeCloseTo(CONFIG.dash.warning);
  });

  it('cancels the unlaunched shots of a tossed bowl while the soup already in flight keeps travelling',()=>{
    const g=lab(),s=g.state,p=s.player;
    const bowl=g.spawnEnemy('bowl',{x:p.x+100,y:p.y});
    bowl.volleyRemaining=2;bowl.nextVolleyAt=s.time+.5;
    s.enemyShots=[{id:9000,ownerId:bowl.id,x:360,y:210,px:360,py:210,vx:110,vy:0,
      radius:6,damage:8,bornAt:0,expiresAt:5}];
    g.triggerSkill('steamer');
    for(let i=0;i<45&&bowl.tossAt===undefined;i++)ticks(g,1);
    expect(bowl.tossAt).toBe(s.time);
    expect(bowl.stunUntil).toBeGreaterThan(s.time);
    expect(bowl.shotWarnUntil).toBe(0);expect(bowl.volleyRemaining).toBe(0);
    ticks(g,43);
    expect(s.enemyShots?.map(v=>v.id)).toEqual([9000]);expect(s.enemyShots![0].x).toBeGreaterThan(430);
  });

  it.each(['steamer','berry'] as const)('%s travels from near to far with one damage event per target and no lingering center hit',kind=>{
    const g=lab(),s=g.state,near=target(g,752,370),far=target(g,1170,610);
    g.triggerSkill(kind);
    let nearAt=0,farAt=0,lateAtCenter:ReturnType<typeof target>|undefined;
    const releases=[];
    for(let i=0;i<100;i++){
      ticks(g,1);
      for(const event of g.drainEvents()){
        if(event.type==='ultimateBeat')releases.push(event.beat);
        if(event.type==='damage'&&event.source===kind){
          if(event.victimId===near.id){expect(nearAt).toBe(0);nearAt=s.time;}
          if(event.victimId===far.id){expect(farAt).toBe(0);farAt=s.time;}
        }
      }
      if(nearAt&&!lateAtCenter)lateAtCenter=target(g,640,370);
    }
    expect(releases).toEqual([1]);
    expect(nearAt).toBeGreaterThan(WAVES[kind].windup);
    expect(farAt-nearAt).toBeGreaterThan(.15);
    expect(far.hp).toBe(400-WAVES[kind].damage);
    expect(lateAtCenter?.hp).toBe(400);
    expect(s.ultimates).toEqual([]);
  });

  it('lets a fast shove outrun a second simultaneous wave until its front actually catches the target',()=>{
    const g=lab(),s=g.state;s.time=2;
    const e=target(g,s.player.x+148,s.player.y);
    g.triggerSkill('berry');g.triggerSkill('steamer');
    for(const cast of s.ultimates!){
      if(cast.kind==='express')throw Error('unexpected route');
      const tune=WAVES[cast.kind],oldRadius=cast.kind==='berry'?115:120;
      cast.bornAt=s.time-tune.windup-oldRadius/cast.reach*tune.travel;
    }
    ticks(g,1);expect(e.hp).toBe(400-WAVES.berry.damage);
    expect(e.x-s.player.x).toBeCloseTo(204);
    ticks(g,15);expect(e.hp).toBe(400-WAVES.berry.damage-WAVES.steamer.damage);
  });

  it('sends the parcel along three steered lanes while the rider can turn, stop and leave distant pickups alone',()=>{
    const g=lab(),s=g.state,p=s.player;
    const onRoute=target(g,895,370),outside=target(g,640,190);
    onRoute.y=onRoute.py=444;
    s.pickups.push({id:700,kind:'stamp',x:984,y:472,radius:CONFIG.pickup.radius,bornAt:0});
    g.triggerSkill('express');
    const route=expressCast(s)!;
    const beats:number[]=[];
    for(let i=0;i<68;i++){
      let input:Vec=still;
      if(route.landings.length===1 && i<12)input={x:1,y:0};
      else if(route.landings.length===2)input={x:0,y:1};
      else if(route.landings.length===3)input={x:0,y:-1};
      const last={x:p.x,y:p.y};
      ticks(g,1,input);
      expect(Math.hypot(last.x-p.x,last.y-p.y)).toBeLessThanOrEqual(CONFIG.player.speed*CONFIG.step+1e-9);
      if(i===15)expect([p.vx,p.vy]).toEqual([0,0]);
      for(const event of g.drainEvents())if(event.type==='ultimateBeat')beats.push(event.beat);
      if(beats.length===3)break;
    }
    expect(beats).toEqual([1,2,3]);
    expect(route.landings.length).toBe(4);
    expect(route.landings[1].x).toBeGreaterThan(1100);
    expect(route.landings[2].x).toBeLessThan(180);
    expect(route.landings[3].x).toBeGreaterThan(1100);
    expect(route.landings[2].y).toBeGreaterThan(route.landings[1].y);
    expect(route.landings[3].y).toBeLessThan(route.landings[2].y);
    expect(onRoute.hp).toBeLessThan(400);
    expect(p.stampUntil).toBe(0);expect(s.pickups.map(q=>q.id)).toContain(700);
    expect(outside.hp).toBe(400);
    expect(p.hp).toBe(100);
    const lastX=p.x;
    ticks(g,2,{x:-1,y:0});expect(p.x).toBeLessThan(lastX);
    expect(g.dash({x:-1,y:0})).toBe(true);
  });

  it('sweeps enemies at the parcel and accepts a manual dash in the middle of its flight',()=>{
    const g=lab(),s=g.state,p=s.player;
    p.x=200;p.y=280;p.moveDirection={x:1,y:0};
    g.triggerSkill('express');
    ticks(g,10);
    expect({x:p.x,y:p.y}).toEqual({x:200,y:280});
    expect(g.dash({x:0,y:-1})).toBe(true);
    const route=expressCast(s)!,start=route.landings[0];
    const at={x:start.x+(route.target.x-start.x)*.57,y:start.y+(route.target.y-start.y)*.57};
    const e=target(g,at.x,at.y);
    for(let i=0;i<8;i++)ticks(g,1,{x:0,y:-1});
    expect(e.hp).toBe(400-EXPRESS.damage);
    expect(p.x).toBe(200);expect(p.y).toBeLessThan(230);
    while(route.landings.length<4)ticks(g,1);
    target(g,p.x,p.y);ticks(g,1);expect(p.hp).toBeLessThan(100);
  });

  it('keeps normal contact at the rider while a fresh ticket replaces a flying parcel',()=>{
    const g=lab(),s=g.state,p=s.player;
    const shot=()=>({id:9001,ownerId:42,x:p.x,y:p.y,px:p.x,py:p.y,vx:0,vy:0,
      radius:6,damage:8,bornAt:s.time,expiresAt:s.time+2});
    g.triggerSkill('express');ticks(g,10);
    const previous=expressCast(s)!;expect(previous.onLeg).toBe(true);
    s.pickups.push({id:9000,kind:'express',x:p.x,y:p.y,radius:CONFIG.pickup.radius,bornAt:s.time});
    s.enemyShots=[shot()];ticks(g,1);
    expect(p.hp).toBe(92);expect(s.enemyShots).toHaveLength(0);
    expect(expressCast(s)!.bornAt).toBe(s.time);expect(expressCast(s)!.onLeg).toBe(false);
    expect(p.x).toBe(WORLD.start.x);expect(p.y).toBe(WORLD.start.y);
  });

  it.each(ULTIMATE_KINDS)('%s strikes a grounded elite while the same hit passes below an airborne giant',kind=>{
    const g=lab(),s=g.state,p=s.player;
    g.triggerSkill(kind);
    let at={x:p.x+80,y:p.y};
    if(kind==='express'){
      ticks(g,6);const route=expressCast(s)!,start=route.landings[0];
      at={x:(start.x+route.target.x)/2,y:(start.y+route.target.y)/2};
    }
    const grounded=g.spawnEnemy('giantBun',at),airborne=g.spawnEnemy('giantBun',at);
    grounded.jump={phase:'rest',hop:3,startedAt:s.time,until:s.time+3,from:at,target:at,gapAngle:0};
    airborne.jump={phase:'flight',hop:1,startedAt:s.time,until:s.time+CONFIG.giant.flight,
      from:at,target:{x:at.x+60,y:at.y},gapAngle:0};
    for(let i=0;i<26&&grounded.hp===grounded.maxHp;i++)ticks(g,1);
    const damage=kind==='express'?EXPRESS.damage:WAVES[kind].damage;
    expect(grounded.hp).toBe(grounded.maxHp-damage);
    expect(airborne.jump!.phase).toBe('flight');expect(airborne.hp).toBe(airborne.maxHp);
    if(kind!=='express'){
      ticks(g,40);
      expect(airborne.hp).toBe(airborne.maxHp);
    }
  });

  it('saves each target in the third stamp circle for one heavy landing hit',()=>{
    const g=lab();g.triggerSkill('express');
    const route=expressCast(g.state)!;
    while(!(route.landings.length===3&&route.onLeg))ticks(g,1);
    const e=target(g,route.target.x,route.target.y);
    while(route.landings.length===3){
      expect(e.hp).toBe(400);
      ticks(g,1);
    }
    expect(e.hp).toBe(400-EXPRESS.landingDamage);
  });

  it('lets the rider steer the next parcel landing while their own midair inputs still change walking direction',()=>{
    const secondStop=(stickX:number)=>{
      const game=lab();game.triggerSkill('express');const route=expressCast(game.state)!;
      while(route.landings.length<2)ticks(game,1);
      ticks(game,1,{x:stickX,y:0});const chosen={...route.target};
      ticks(game,4,{x:-stickX,y:1});expect(route.target).toEqual(chosen);
      return chosen.x;
    };
    expect(secondStop(1)-secondStop(-1)).toBe(130);
  });

  it('bounds repeated/crossed casts and resets all active geometry on practice clear',()=>{
    const g=lab();for(let i=0;i<12;i++)for(const k of ULTIMATE_KINDS)g.triggerSkill(k);
    expect(g.state.ultimates).toHaveLength(4);
    g.update(.28,still);g.clearArena();const {x,y}=g.state.player;
    ticks(g,5);expect(g.state.player.x).toBeCloseTo(x,1);expect(g.state.player.y).toBeCloseTo(y,1);
    expect(g.state.ultimates).toEqual([]);
    g.triggerSkill('berry');g.reset();expect(g.state.ultimates??[]).toEqual([]);
  });

  it('cycles all four live drops in a normal run, within reachable bounds and the pickup cap',()=>{
    const g=new Game(233),s=g.state,found:string[]=[];
    s.player.invulnerableUntil=999;
    for(let step=0;step<60*92&&found.length<4;step++){
      ticks(g,1);
      expect(s.pickups.length).toBeLessThanOrEqual(CONFIG.pickup.cap);
      for(const p of s.pickups)if(isUltimate(p.kind)){
        expect(p.y).toBeGreaterThanOrEqual(CONFIG.player.minY);
        expect(p.x).toBeLessThan(WORLD.bounds.right);
        expect(Math.hypot(s.player.x-p.x,s.player.y-p.y)).toBeLessThanOrEqual(325.01);
        found.push(p.kind);
      }
      s.pickups=[];
    }
    expect(found).toEqual([...ULTIMATE_KINDS]);
  });

  it('lets a moving rider naturally collect four live ultimates and encounter the second wave giant',()=>{
    const g=new Game(7),s=g.state,p=s.player,found:string[]=[];
    let sawElite=false;
    for(let frame=0;frame<60*84&&found.length<4&&!s.ended;frame++){
      const range=(point:Vec)=>Math.hypot(point.x-p.x,point.y-p.y);
      const items=s.pickups.filter(q=>!q.retiringUntil&&(q.readyAt??0)<=s.time);
      items.sort((a,b)=>Number(isUltimate(b.kind))-Number(isUltimate(a.kind))||range(a)-range(b));
      const goal=items[0]??{x:640+380*Math.cos(s.time*.43),y:390+150*Math.sin(s.time*.64)};
      const distance=range(goal)||1;
      const direction={x:(goal.x-p.x)/distance,y:(goal.y-p.y)/distance};
      const threatened=s.enemies.some(e=>range(e)<e.radius+35)||s.enemyShots?.some(q=>range(q)<q.radius+35);
      if(threatened&&p.invulnerableUntil<=s.time)g.dash(direction);
      ticks(g,1,direction);
      for(const ev of g.drainEvents())if(ev.type==='pickup'&&isUltimate(ev.kind))found.push(ev.kind);
      if(s.wave===2&&s.enemies.some(e=>e.kind==='giantBun'))sawElite=true;
      if(s.ended)g.revive();
    }
    expect(found).toEqual([...ULTIMATE_KINDS]);expect(sawElite).toBe(true);
  });
});
