import {describe,expect,it} from 'vitest';
import {Game} from '../src/core/game';
import {meleePose,WEAPONS,updateWeapons} from '../src/core/weapons';
import {MELEE_WEAPONS,meleeWaveBand} from '../src/core/melee';
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
  return {game,s,ctx,events,hits,tick,enemy,release};
}
// Gameplay limits for continuous fire, checked against actual releases at 60 Hz.
const rangedVolleys:Partial<Record<WeaponKind,{lanes:number;maxInterval:number}>>={
  bag:{lanes:9,maxInterval:.4},chopsticks:{lanes:5,maxInterval:.35},
  spirit:{lanes:3,maxInterval:.57},tray:{lanes:3,maxInterval:.57},
  lunchbox:{lanes:3,maxInterval:.74},talisman:{lanes:3,maxInterval:.52},
};
describe('V3 continuous directional weapons',()=>{
  for(const kind of WEAPON_KINDS)it(`${kind} maintains its release cadence in an empty arena, including under heat`,()=>{
    for(const heated of [false,true]){
      const {s,events,tick}=fixture(kind);
      const volley=rangedVolleys[kind];
      if(heated)s.player.heatUntil=10;
      const releases:number[]=[];
      for(let frame=0;frame<6*60;frame++){
        tick(CONFIG.step);
        const attack=events.splice(0).find(e=>e.type==='attack');
        if(attack?.type==='attack'){
          expect(attack.angle).toBe(0);releases.push(s.time);
          if(volley){
            expect(s.projectiles.filter(shot=>shot.attackId===attack.id)).toHaveLength(volley.lanes);
            expect(s.projectiles.length).toBeLessThanOrEqual(CONFIG.weapons.projectileCap);
          }
        }
      }
      expect(s.weapon.targetId).toBeNull();
      expect(releases.length).toBeGreaterThanOrEqual(4);
      const {windup,cooldown}=WEAPONS[kind];
      const interval=windup+cooldown*(heated?.8:1);
      for(let i=1;i<releases.length;i++){
        // Windup and cooldown each start on a simulation tick.
        const elapsed=releases[i]-releases[i-1];
        expect(elapsed).toBeGreaterThanOrEqual(interval-1e-9);
        expect(elapsed).toBeLessThan(interval+2*CONFIG.step);
        if(volley)expect(elapsed).toBeLessThanOrEqual(volley.maxInterval+1e-9);
      }
    }
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
      const {hits,enemy,release,tick}=fixture(kind);const front=[enemy(735,350),enemy(755,370),enemy(740,390)],rear=enemy(555);
      release();tick(.35);expect(front.every(e=>hits.some(h=>h.id===e.id))).toBe(true);expect(hits.some(h=>h.id===rear.id)).toBe(false);
      expect(hits.filter(h=>h.id===front[0].id)).toHaveLength(1);
    }
  });
  for(const kind of ['tongs','knife','sword','umbrella'] as const)it(`${kind} swings past BOTH shoulders, contacting each flank only as it passes`,()=>{
    for(const hz of [15,30,60,120]){
      const {s,ctx,hits,enemy,release}=fixture(kind),reverse=hz===30||hz===120,heading=reverse?2.75:.48,distance=155;
      s.weapon.swingSide=reverse?1:-1;
      s.player.moveDirection={x:Math.cos(heading),y:Math.sin(heading)};
      const place=(angle:number)=>enemy(640+distance*Math.cos(heading+angle),370+distance*Math.sin(heading+angle));
      const left=place(-102*Math.PI/180),front=place(0),right=place(102*Math.PI/180),rear=place(Math.PI);
      release();
      const swing=s.weapon.attack!,cfg=MELEE_WEAPONS[kind];
      const first=meleePose(swing,swing.releaseAt)!,last=meleePose(swing,swing.releaseAt+cfg.active)!;
      const arc=Math.abs(last.angle-first.angle)*180/Math.PI;
      expect(arc).toBeGreaterThan(180);expect(arc).toBeCloseTo(cfg.sweep);
      const [early,late]=swing.swingSide===-1?[right,left]:[left,right];
      expect(hits.some(h=>h.id===late.id||h.id===front.id)).toBe(false);
      const frames=Math.ceil((cfg.active+distance/cfg.waveSpeed)*hz);
      for(let i=1;i<=frames;i++){
        s.time+=1/hz;updateWeapons(s,1/hz,ctx);
        if(i/hz<cfg.active*.5)expect(hits.some(h=>h.id===late.id)).toBe(false);
      }
      expect(hits.map(h=>h.id)).toEqual([early.id,front.id,late.id]);
      expect([left.hp,front.hp,right.hp]).toEqual(Array(3).fill(1000-cfg.damage));
      expect(rear.hp).toBe(1000);
    }
  });
  it('sweeps both tongs flanks in contact order and reverses the next swing',()=>{
    const {s,enemy,hits,tick}=fixture('tongs');
    const left=enemy(780,225),right=enemy(780,515),rear=enemy(582,370),distant=enemy(948,370);
    const sides:number[]=[];
    let attackId=-1;
    for(let frame=0;frame<60;frame++){
      tick(1/60);
      const attack=s.weapon.attack;
      if(attack?.phase==='active'&&attack.id!==attackId){
        attackId=attack.id;sides.push(Math.sign(meleePose(attack,s.time)!.angle));
        if(sides.length===2)s.weapon.readyAt=Infinity;
      }
    }
    expect(sides).toEqual([-1,1]);
    expect(hits.map(h=>h.id)).toEqual([left.id,right.id,right.id,left.id]);
    expect([rear.hp,distant.hp]).toEqual([1000,1000]);
  });
  it('readies a turned tongs swing on cooldown while rapid reversals never overlap strikes',()=>{
    const {s,enemy,tick}=fixture('tongs');
    enemy(755);enemy(525);
    let firstRelease=0,previousId=-1;
    const releases:number[]=[];
    for(let frame=0;frame<130;frame++){
      if(firstRelease)s.player.moveDirection={x:frame<48?-1:frame%3===0?1:-1,y:0};
      tick(1/60);
      const attack=s.weapon.attack;
      if(attack?.phase!=='active'||attack.id===previousId)continue;
      previousId=attack.id;firstRelease ||= s.time;releases.push(s.time);
      if(releases.length===2)expect(attack.angle).toBeCloseTo(Math.PI);
    }
    expect(releases.length).toBeGreaterThanOrEqual(4);
    const intervals=releases.slice(1).map((time,i)=>time-releases[i]);
    expect(Math.min(...intervals)).toBeGreaterThanOrEqual(WEAPONS.tongs.cooldown-1e-9);
    expect(intervals[0]).toBeLessThan(WEAPONS.tongs.cooldown+2/60);
  });
  it('reaches the extended outer band with each melee weapon and stops at its target cap',()=>{
    for(const kind of ['tongs','knife','umbrella','sword'] as const){
      const {enemy,hits,release,tick}=fixture(kind),cfg=MELEE_WEAPONS[kind];
      const near=enemy(640+cfg.bodyReach*.6);
      const packed=Array.from({length:cfg.limit+2},()=>enemy(640+cfg.range-12));
      const outside=enemy(640+cfg.range+65);
      release();
      for(let frame=0;frame<Math.ceil(cfg.active*60) && near.hp===1000;frame++) tick(1/60);
      expect(hits.map(hit=>hit.id)).toEqual([near.id]);
      tick(cfg.active+cfg.range/cfg.waveSpeed);
      expect(hits.map(hit=>hit.id)).toEqual([near,...packed.slice(0,cfg.limit-1)].map(e=>e.id));
      expect(outside.hp).toBe(1000);
    }
  });
  for(const kind of ['tongs','knife','umbrella','sword'] as const)it(`${kind} carries a hand-sized tool and emits a travelling band along its actual swing`,()=>{
    const {s,enemy,hits,release,tick}=fixture(kind),cfg=MELEE_WEAPONS[kind];
    const angle=-cfg.sweep*Math.PI/360;
    const place=(r:number)=>enemy(640+r*Math.cos(angle),370+r*Math.sin(angle));
    const near=place(35),far=place(190);
    release();
    const attack=s.weapon.attack!,wave=s.meleeWaves[0],slice=wave.slices[0];
    expect(wave.slices).toHaveLength(1);
    expect(meleePose(attack,s.time)!.reach).toBeLessThanOrEqual(98);
    expect(slice.startRadius).toBeCloseTo(meleePose(attack,s.time)!.reach);
    expect(meleeWaveBand(wave,slice,s.time)!.outer).toBeCloseTo(slice.startRadius);
    expect(hits.map(h=>h.id)).toEqual([near.id]);
    tick(2/60);
    expect(wave.slices.length).toBeGreaterThan(1);
    expect(wave.slices.every(part=>part.bornAt<=s.time+1e-9)).toBe(true);
    expect(meleeWaveBand(wave,slice,s.time)!.outer).toBeCloseTo(slice.startRadius+cfg.waveSpeed*2/60);
    expect(far.hp).toBe(1000);
    tick(.4);
    expect(hits.map(h=>h.id)).toEqual([near.id,far.id]);
    expect(meleeWaveBand(wave,slice,s.time)).toBeNull();
  });
  it('keeps released slices in the world across a turn, motion and equip, and leaves the wave interior empty',()=>{
    const {game,s,enemy,hits,release,tick}=fixture('sword'),cfg=MELEE_WEAPONS.sword;
    const angle=-cfg.sweep*Math.PI/360;
    const place=(r:number)=>enemy(640+r*Math.cos(angle),370+r*Math.sin(angle));
    const far=place(228),unreleased=enemy(880);
    release();
    const wave=s.meleeWaves[0],slice=wave.slices[0];
    const launch={x:slice.x,y:slice.y,angle:slice.angle,bornAt:slice.bornAt};
    tick(1/60);
    s.player.px=s.player.x;s.player.x+=120;s.player.moveDirection={x:0,y:1};
    tick(1/60);s.player.px=s.player.x;
    expect(wave.slices[1].x).toBeGreaterThan(slice.x);
    expect(wave.slices[1].x).toBeLessThan(s.player.x);
    game.setWeapon('bag');s.weapon.readyAt=Infinity;
    const released=wave.nextSlice;
    tick(.10);
    const hollow=place(115);
    expect(far.hp).toBe(1000);
    expect(slice).toMatchObject(launch);
    tick(.25);
    expect(wave.nextSlice).toBe(released);
    expect(hits.map(h=>h.id)).toEqual([far.id]);
    expect([hollow.hp,unreleased.hp]).toEqual([1000,1000]);
    expect(s.meleeWaves).toHaveLength(0);
  });
  it('clears in-flight fronts when clearing the arena or starting a new run',()=>{
    const {game,s,release}=fixture('knife');
    release();expect(s.meleeWaves.length).toBe(1);
    game.clearArena();expect(s.meleeWaves).toHaveLength(0);
    s.weapon.readyAt=0;game.update(.14,{x:1,y:0});expect(s.meleeWaves.length).toBe(1);
    game.reset();expect(game.state.meleeWaves).toHaveLength(0);
  });
  it.each([15,30,60,120])('catches a monster crossing a detached wave between sampled positions at %i Hz',hz=>{
    const {game,s,ctx,enemy,hits,release,tick}=fixture('knife');
    release();
    const wave=s.meleeWaves[0],slice=wave.slices[0];
    game.setWeapon('bag');s.weapon.readyAt=Infinity;
    tick(3/60);
    const band=meleeWaveBand(wave,slice,s.time+.5/hz)!;
    const distance=(band.inner+band.outer)/2,dx=Math.cos(slice.angle),dy=Math.sin(slice.angle);
    const x=slice.x+dx*distance,y=slice.y+dy*distance;
    const crossing=enemy(x-dy*65,y+dx*65);crossing.radius=2;
    crossing.px=x+dy*65;crossing.py=y-dx*65;
    s.time+=1/hz;updateWeapons(s,1/hz,ctx);
    expect(hits).toEqual([{id:crossing.id,amount:MELEE_WEAPONS.knife.damage}]);
  });
  it('catches a moving body between active ticks and excludes travel completed during windup',()=>{
    const {enemy,hits,release,tick}=fixture('sword');
    const crossing=enemy(706,319);
    crossing.px=490;
    release();expect(hits).toHaveLength(0);
    crossing.px=crossing.x;crossing.x=490;
    tick(1/60);
    expect(hits.map(h=>h.id)).toEqual([crossing.id]);
  });
  it('counts the body grazing the leading umbrella panel and leaves a wider gap unharmed',()=>{
    const {s,enemy,hits,release,tick}=fixture('umbrella'),cfg=MELEE_WEAPONS.umbrella;
    const panelEdge=-(cfg.sweep+cfg.width)/2;
    const at=(degrees:number)=>enemy(640+195*Math.cos(degrees*Math.PI/180),370+195*Math.sin(degrees*Math.PI/180));
    const near=at(panelEdge-5),missed=at(panelEdge-12);
    release();expect(hits).toHaveLength(0);
    tick(.19);expect(hits.map(h=>h.id)).toEqual([near.id]);expect(missed.hp).toBe(1000);
    expect(meleePose(s.weapon.attack!,s.time)!.halfAngle).toBeCloseTo(cfg.width*Math.PI/360);
  });
  it('bag fans nine rays but one enemy receives the configured total only once',()=>{
    const {s,hits,enemy,release,tick}=fixture('bag');const e=enemy(710);release();expect(s.projectiles).toHaveLength(9);tick(.5);
    expect(hits.filter(h=>h.id===e.id)).toEqual([{id:e.id,amount:45}]);
  });
  it('chopsticks pierce seven targets with decreasing totals',()=>{
    const {hits,enemy,release,tick}=fixture('chopsticks');[710,765,820,875,930,1000,1100,1150].forEach(x=>enemy(x));release();tick(.85);
    expect(hits.map(h=>h.amount)).toEqual([74,64,56,50,44,38,32]);
  });
  it('spirit never acquires a rear-only target and still flies forward',()=>{
    const {s,hits,enemy,release,tick}=fixture('spirit');enemy(520);release();expect(s.projectiles[0].targetId).toBe(-1);tick(.3);
    expect(s.projectiles[0].x).toBeGreaterThan(640);expect(hits).toHaveLength(0);
  });
  it('spirit selects a front initial enemy and only a nearby second one',()=>{
    const {hits,enemy,release,tick}=fixture('spirit');const first=enemy(1095),second=enemy(1095,518),far=enemy(1100,210);
    release();tick(1.6);expect(hits.map(h=>h.id)).toEqual([first.id,second.id]);expect(far.hp).toBe(1000);expect(hits.map(h=>h.amount)).toEqual([70,50]);
  });
  it('tray has independent outbound and return hits',()=>{
    const {hits,enemy,release,tick}=fixture('tray');const e=enemy(800);release();tick(1.4);expect(hits.filter(h=>h.id===e.id).map(h=>h.amount)).toEqual([58,44]);
  });
  it('lunchbox flies to a fixed forward point without a target and explodes in a wide area',()=>{
    const {s,events,hits,enemy,release,tick}=fixture('lunchbox');release();expect(s.projectiles[0]).toMatchObject({targetX:1060,targetY:370});
    const landings=s.projectiles.map(q=>({type:'detonation',x:q.targetX,y:q.targetY}));
    const e=enemy(1060,530);enemy(1178,505);tick(.6);expect(hits).toHaveLength(0);tick(.08);expect(hits).toEqual([{id:e.id,amount:116}]);
    expect(events.filter(event=>event.type==='detonation')).toEqual(landings);
  });
  it('lands a diagonal lunchbox at the market edge along its launch line',()=>{
    const {s,hits,enemy,release,tick}=fixture('lunchbox');
    s.player.x=s.player.px=1120;s.player.y=s.player.py=380;
    s.player.moveDirection={x:Math.SQRT1_2,y:Math.SQRT1_2};
    const target=enemy(1180,460);release();
    expect(s.projectiles[0].targetX).toBeCloseTo(1200);
    expect(s.projectiles[0].targetY).toBeCloseTo(460);
    tick(.7);expect(hits.map(h=>h.id)).toEqual([target.id]);
  });
  it('talisman flies first and chains only after physical impact',()=>{
    const {s,events,hits,enemy,release,tick}=fixture('talisman');const targets=[enemy(800),enemy(870,400),enemy(950,430),enemy(1020,400),enemy(1150,420),enemy(1150,560)];release();
    expect(s.projectiles[0].phase).toBe('out');expect(hits).toHaveLength(0);tick(.2);expect(hits).toHaveLength(0);tick(.85);
    expect(hits.map(h=>h.id)).toEqual(targets.map(e=>e.id));expect(hits.map(h=>h.amount)).toEqual([70,60,52,46,40,36]);
    expect(events.filter(event=>event.type==='chainLink')).toEqual(targets.slice(1).map((e,i)=>({type:'chainLink',fromX:targets[i].x,fromY:targets[i].y,x:e.x,y:e.y})));
  });
  it.each([
    ['bag',9,72],['chopsticks',5,42],['spirit',3,48],['tray',3,44],['lunchbox',3,40],['talisman',3,54],
  ] as const)('%s launches distinct lanes and physically damages targets on both flanks', (kind,lanes,halfAngle)=>{
    const {s,hits,enemy,release,tick}=fixture(kind);
    const angle=halfAngle*Math.PI/180,reach=kind==='lunchbox'?WEAPONS.lunchbox.range*.82:220;
    const targets=[-1,0,1].map(side=>{
      const d=side===0&&kind==='lunchbox'?WEAPONS.lunchbox.range:reach;
      return enemy(s.player.x+Math.cos(side*angle)*d,s.player.y+Math.sin(side*angle)*d);
    });
    const behind=enemy(s.player.x-220,s.player.y);
    release();
    const headings=s.projectiles.map(q=>Math.atan2(q.vy,q.vx)*180/Math.PI);
    expect(headings).toHaveLength(lanes);
    expect(Math.min(...headings)).toBeCloseTo(-halfAngle);expect(Math.max(...headings)).toBeCloseTo(halfAngle);
    tick(.9);
    expect(targets.every(e=>hits.some(h=>h.id===e.id))).toBe(true);
    expect(behind.hp).toBe(1000);
  });
  it('shares the piercing cap across five lanes without losing the full central pierce',()=>{
    const {enemy,release,tick,hits}=fixture('chopsticks');
    for(let n=0;n<7;n++)for(const degrees of [-42,-21,0,21,42]){
      const angle=degrees*Math.PI/180,d=115+n*35;
      enemy(640+Math.cos(angle)*d,370+Math.sin(angle)*d);
    }
    release();tick(.9);
    expect(hits).toHaveLength(WEAPONS.chopsticks.limit);
    expect(new Set(hits.map(h=>h.id)).size).toBe(hits.length);
  });
  it('independent dispatch chains visit unique recipients up to the shared limit',()=>{
    const {enemy,events,release,tick,hits}=fixture('talisman');
    for(const degrees of [-54,0,54])for(let n=0;n<6;n++){
      const angle=degrees*Math.PI/180,d=145+n*35;
      enemy(640+Math.cos(angle)*d,370+Math.sin(angle)*d);
    }
    release();tick(1.4);
    expect(hits).toHaveLength(WEAPONS.talisman.limit);
    expect(new Set(hits.map(h=>h.id)).size).toBe(hits.length);
    expect(events.filter(e=>e.type==='chainLink')).toHaveLength(hits.length-3);
  });
  it('shares both tray contact lists when all three returning paths meet at the runner',()=>{
    const {s,enemy,release,tick,hits}=fixture('tray');
    const near=enemy(s.player.x+8,s.player.y);
    release();tick(2.1);
    expect(hits.filter(h=>h.id===near.id).map(h=>h.amount)).toEqual([58,44]);
    expect(s.projectiles).toHaveLength(0);
  });
  it('deduplicates overlapping parcel drops at the wall and respects the volley target cap',()=>{
    const {s,enemy,release,tick,hits,events}=fixture('lunchbox');s.player.x=s.player.px=1190;
    for(let i=0;i<19;i++)enemy(1160,360+i*2);
    release();expect(s.projectiles).toHaveLength(1);tick(.7);
    expect(events.filter(e=>e.type==='detonation')).toHaveLength(1);
    expect(hits).toHaveLength(WEAPONS.lunchbox.limit);expect(new Set(hits.map(h=>h.id)).size).toBe(hits.length);
  });
  it('turns trays at the boundary and catches them at the moving courier',()=>{
    const {s,release,tick}=fixture('tray');s.player.x=s.player.px=1175;
    release();tick(4/60);expect(s.projectiles).toHaveLength(3);
    expect(s.projectiles.every(q=>q.phase==='return'&&q.x<=1200+1e-8)).toBe(true);
    s.player.x=s.player.px=1110;s.player.y=s.player.py=420;tick(.35);expect(s.projectiles).toHaveLength(0);
  });
  it('umbrella repeats forward strikes and retains a one-use block window',()=>{
    const {s,events,hits,enemy,release,tick}=fixture('umbrella');release();const e:Enemy=enemy(680);e.px=710;e.x=680;tick(1/60);
    expect(events.filter(e=>e.type==='defend')).toHaveLength(1);expect(s.weapon.attack?.blocked).toBe(true);
    e.x=e.px=755;tick(.45);
    expect(events.filter(e=>e.type==='defend')).toHaveLength(1);
    expect(hits).toEqual([{id:e.id,amount:MELEE_WEAPONS.umbrella.damage}]);
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
    expect(Object.values(WEAPONS).every(w=>w.damage>=45&&w.damage<=116)).toBe(true);
  });
});
