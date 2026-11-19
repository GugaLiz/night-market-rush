import {describe,expect,it} from 'vitest';
import {CONFIG,WORLD} from '../src/core/config';
import {Game} from '../src/core/game';

const still={x:0,y:0};
function arena(seed=135) {
  const game=new Game(seed);
  game.reset(seed,true);
  game.state.weapon.readyAt=Infinity;
  return game;
}
function advance(game:Game,seconds:number){
  for(let n=0;n<Math.ceil(seconds*60);n++)game.update(1/60,still);
}

describe('enemy attention and soup-shot range',()=>{
  it('wanders on the same seeded path for distant players on opposite sides of the street',()=>{
    const trace=(playerX:number)=>{
      const g=arena(),p=g.state.player;
      p.x=playerX;
      const e=g.spawnEnemy('bun',{x:620,y:360});
      const points=[];
      for(let i=0;i<12;i++){
        advance(g,.5);
        expect(e.alerted).toBe(false);
        points.push([e.x,e.y]);
      }
      expect(Math.hypot(e.x-620,e.y-360)).toBeGreaterThan(10);
      return points;
    };
    expect(trace(140)).toEqual(trace(1120));
  });

  it.each(['bun','box','bowl'] as const)('%s notices the player locally and disengages past a separate outer radius',kind=>{
    const g=arena(),e=g.spawnEnemy(kind,{x:160,y:370});
    e.shotReadyAt=Infinity;e.phaseUntil=Infinity;
    const {notice,release}=CONFIG.awareness[kind];
    const sample=(distance:number)=>{
      g.state.player.x=e.x+distance;
      g.state.player.y=e.y;
      g.update(1/60,still);
      return e.alerted;
    };
    expect(sample(notice+8)).toBe(false);
    expect(sample(notice)).toBe(true);
    const x=e.x;
    expect(sample((notice+release)/2)).toBe(true);
    expect(e.x).toBeGreaterThan(x);
    expect(sample(release+8)).toBe(false);
    expect(sample(release-4)).toBe(false);
  });

  it('turns away from arena edges and separates overlapping unalerted walkers',()=>{
    const g=arena(),p=g.state.player;p.x=1100;p.y=570;
    const at={x:WORLD.bounds.left,y:WORLD.bounds.top};
    const first=g.spawnEnemy('bun',at),second=g.spawnEnemy('bun',at);
    for(const e of [first,second]){e.wanderAngle=-.75*Math.PI;e.wanderUntil=10;}
    const x=first.x,y=first.y;
    advance(g,1);
    expect(Math.min(first.x,second.x)).toBeGreaterThan(x);
    expect(Math.min(first.y,second.y)).toBeGreaterThan(y);
    expect(Math.hypot(first.x-second.x,first.y-second.y)).toBeGreaterThan(8);
    expect(first.alerted||second.alerted).toBe(false);
  });

  it('skirts the same side of a cone regardless of the distant player’s position',()=>{
    function pass(playerY:number) {
      const g=arena(),s=g.state;s.player.x=1050;s.player.y=playerY;
      const bun=g.spawnEnemy('bun',{x:340,y:370});
      bun.wanderAngle=0;bun.wanderUntil=20;
      s.zones.push({id:99,kind:'cone',x:382,y:370,radius:21,bornAt:0,expiresAt:9,angle:0,length:0,width:0,hp:1});
      advance(g,1.6);
      expect(bun.alerted).toBe(false);
      expect(Math.abs(bun.y-370)).toBeGreaterThan(1);
      return [bun.x,bun.y];
    }
    expect(pass(200)).toEqual(pass(550));
  });

  it('hits a stationary player from the outer firing threshold after warning and flight time',()=>{
    const g=arena(),s=g.state,bowl=g.spawnEnemy('bowl',{x:150,y:370});
    s.player.x=bowl.x+CONFIG.ranged.range;
    bowl.shotReadyAt=0;
    g.update(1/60,still);
    expect(bowl.shotWarnUntil!-s.time).toBeCloseTo(CONFIG.ranged.warning);
    expect(s.enemyShots).toHaveLength(0);
    advance(g,CONFIG.ranged.warning+.04);
    expect(s.enemyShots).toHaveLength(1);
    bowl.shotReadyAt=Infinity;
    const flight=(CONFIG.ranged.range-s.player.radius-CONFIG.ranged.radius)/CONFIG.ranged.speed;
    expect(CONFIG.ranged.lifetime).toBeGreaterThan(flight);
    advance(g,flight-.12);
    expect(s.player.hp).toBe(100);
    advance(g,.16);
    expect(s.player.hp).toBe(100-CONFIG.ranged.damage);
  });

  it('uses the same range in ordinary play once an existing bowl finishes its spawn warning',()=>{
    const g=arena();g.setPractice(false);g.state.player.x=930;
    const bowl=g.spawnEnemy('bowl',{x:160,y:370});bowl.shotReadyAt=0;
    advance(g,CONFIG.spawn.warning-.05);
    expect(bowl.shotWarnUntil).toBe(0);expect(bowl.x).toBe(160);
    advance(g,.07);
    expect(bowl.alerted).toBe(true);expect(bowl.shotWarnUntil).toBeGreaterThan(g.state.time);
  });

  it('applies soda and stun to roaming speed without making the distant rider its target',()=>{
    const g=arena(),s=g.state;s.player.x=1100;
    const bun=g.spawnEnemy('bun',{x:200,y:370});
    bun.wanderAngle=0;bun.wanderUntil=10;
    advance(g,.5);
    const normal=bun.x-200;
    bun.slowUntil=3;
    const x=bun.x;advance(g,.5);
    expect(bun.x-x).toBeCloseTo(normal*CONFIG.skills.soda.factor);
    const stopped=bun.x;bun.stunUntil=3;advance(g,.25);
    expect(bun.x).toBe(stopped);expect(bun.alerted).toBe(false);
  });

  it('drops an unfired telegraph and the rest of a volley when contact is lost, leaving fired shots on their line',()=>{
    const g=arena(),s=g.state,bowl=g.spawnEnemy('bowl',{x:150,y:370});s.wave=2;
    s.player.x=900;bowl.shotReadyAt=0;advance(g,.3);
    expect(bowl.shotWarnUntil).toBeGreaterThan(s.time);
    s.player.x=1140;advance(g,.8);
    expect(bowl.shotWarnUntil).toBe(0);expect(s.enemyShots).toHaveLength(0);
    s.player.x=bowl.x+790;advance(g,CONFIG.ranged.warning+.06);
    expect(s.enemyShots).toHaveLength(1);expect(bowl.volleyRemaining).toBe(2);
    const shot=s.enemyShots![0],x=shot.x,y=shot.y,vx=shot.vx,vy=shot.vy;
    s.player.x=1140;s.player.y+=100;advance(g,.8);
    expect(bowl.alerted).toBe(false);expect(bowl.volleyRemaining).toBe(0);
    expect(s.enemyShots).toEqual([shot]);expect(shot.vx).toBe(vx);expect(shot.vy).toBe(vy);
    expect(shot.x).toBeCloseTo(x+vx*.8);expect(shot.y).toBeCloseTo(y+vy*.8);
  });

  it('lets the tasting box redirect wanderers and interrupt a bowl that was aiming at the rider',()=>{
    const g=arena(),s=g.state;
    const bun=g.spawnEnemy('bun',{x:s.player.x-230,y:s.player.y});
    bun.wanderAngle=Math.PI;bun.wanderUntil=3;
    const bowl=g.spawnEnemy('bowl',{x:s.player.x,y:s.player.y-190});
    bowl.shotReadyAt=0;
    g.update(1/60,still);expect(bowl.shotWarnUntil).toBeGreaterThan(s.time);
    expect(bun.alerted).toBe(false);
    g.triggerSkill('lure');
    const x=bun.x;advance(g,.5);
    expect(bun.x).toBeGreaterThan(x);expect(bun.alerted).toBe(false);
    expect(bowl.shotWarnUntil).toBe(0);expect(s.enemyShots).toHaveLength(0);
  });

  it('cancels a box telegraph on disengage but lets a committed charge finish in its locked direction',()=>{
    const g=arena(),s=g.state,box=g.spawnEnemy('box',{x:320,y:370});
    box.phaseUntil=0;s.player.x=510;
    g.update(1/60,still);expect(box.phase).toBe('warn');
    s.player.x=950;g.update(1/60,still);
    expect(box.phase).toBe('chase');expect(box.alerted).toBe(false);
    box.phaseUntil=0;s.player.x=box.x+180;
    advance(g,CONFIG.dash.warning+.04);expect(box.phase).toBe('dash');
    const x=box.x;s.player.x=950;s.player.y=560;
    advance(g,.14);expect(box.x).toBeGreaterThan(x);expect(box.phase).toBe('dash');
    advance(g,CONFIG.dash.duration);expect(box.phase).toBe('recover');
  });
});
