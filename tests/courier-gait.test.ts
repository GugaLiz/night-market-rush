import {describe,expect,it} from 'vitest';
import {CONFIG} from '../src/core/config';
import {Game} from '../src/core/game';
import {CourierGait} from '../src/render/courier-gait';
import type {Vec} from '../src/shared/types';

const scale=1.35;
const distance=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y);

function scene() {
  const game=new Game(12);
  game.setPractice(true);
  const gait=new CourierGait(),player=game.state.player;
  gait.update(player,0,scale,false);
  const tick=(input:Vec,dt=1/60)=>{
    game.update(dt,input);
    gait.update(player,dt,scale,(player.dashUntil??0)>game.state.time);
  };
  const homeError=()=>Math.max(
    distance(gait.right,{x:player.x+8*scale,y:player.y+2*scale}),
    distance(gait.left,{x:player.x-8*scale,y:player.y-2*scale}),
  );
  return {game,player,gait,tick,homeError};
}

describe('courier foot placement',()=>{
  it.each([30,60,120])('grounds a support foot and lifts each knee when rendered at %i Hz',hz=>{
    for(const input of [{x:1,y:0},{x:.6,y:-.8},{x:0,y:1}]){
      const {gait,tick}=scene();
      let rightLift=0,leftLift=0;
      for(let i=0;i<hz;i++){
        const right={...gait.right},left={...gait.left};
        tick(input,1/hz);
        expect(Math.min(distance(gait.right,right),distance(gait.left,left))).toBeLessThan(1e-6);
        rightLift=Math.max(rightLift,gait.right.lift);leftLift=Math.max(leftLift,gait.left.lift);
      }
      expect(Math.min(rightLift,leftLift)).toBeGreaterThan(8);
    }
  });

  it('changes footholds through reversals and settles both soles after a release',()=>{
    const {gait,tick,homeError}=scene();
    for(const input of [{x:1,y:0},{x:-1,y:0},{x:0,y:-1},{x:0,y:0}]){
      for(let i=0;i<36;i++){
        const right={...gait.right},left={...gait.left};
        tick(input);
        const displacements=[distance(gait.right,right),distance(gait.left,left)];
        expect(Math.min(...displacements)).toBeLessThan(1e-6);
        expect(Math.max(...displacements)).toBeLessThan(CONFIG.player.speed/60*6);
      }
    }
    expect(homeError()).toBeLessThan(1.1);
    expect(Math.max(gait.right.lift,gait.left.lift)).toBeLessThan(.01);
  });

  it.each([30,60,120])('replants the airborne shoe through a full-speed turn at %i Hz',hz=>{
    for(const approach of [.32,.40,.48]){
      const {gait,player,tick}=scene();
      for(let i=0;i<Math.round(hz*approach);i++)tick({x:1,y:0},1/hz);
      for(let i=0;i<Math.round(hz*.28);i++){
        tick({x:-1,y:0},1/hz);
        for(const [side,foot] of [[1,gait.right],[-1,gait.left]] as const){
          // A missed pivot leaves the old landing more than fifty rig units behind the body.
          expect(Math.abs((foot.x-player.x)/scale-side*8)).toBeLessThan(34);
        }
      }
    }
  });

  it('walks with smaller lifts on a lightly held stick and settles into a staggered stance',()=>{
    function measure(input:number){
      const {player,gait,tick,homeError}=scene();
      let peak=0,landings=0;
      for(let i=0;i<66;i++){
        const wasLifted=gait.right.lift>.01 || gait.left.lift>.01;
        tick({x:0,y:-input},1/120);
        const lift=Math.max(gait.right.lift,gait.left.lift);
        if(wasLifted && lift<.01)landings++;
        peak=Math.max(peak,lift);
      }
      for(let i=0;i<80;i++)tick({x:0,y:0},1/120);
      expect(homeError()).toBeLessThan(.62);
      expect((gait.right.x-gait.left.x)/scale).toBeCloseTo(16,0);
      expect((gait.right.y-gait.left.y)/scale).toBeCloseTo(4,0);
      expect(gait.weight).toBeLessThan(-.12);
      const rest=[{...gait.right},{...gait.left}];
      for(let i=0;i<12;i++)tick({x:0,y:0},1/120);
      expect(distance(gait.right,rest[0])+distance(gait.left,rest[1])).toBe(0);
      expect(player.vx).toBe(0);
      return {peak,landings};
    }
    const walk=measure(.13),run=measure(1);
    expect(walk.peak).toBeGreaterThan(3);
    expect(run.peak).toBeGreaterThan(walk.peak+3);
    expect(run.landings).toBeGreaterThan(walk.landings+1);
  });

  it('freezes a paused swing, recovers from a dash, and resets shoes at a new spawn',()=>{
    const {game,player,gait,tick,homeError}=scene();
    for(let frame=0;frame<14;frame++)tick({x:1,y:0});
    const pose=JSON.stringify([gait.left,gait.right,gait.drive,gait.weight,gait.rise]);
    gait.update(player,0,scale,false);
    expect(JSON.stringify([gait.left,gait.right,gait.drive,gait.weight,gait.rise])).toBe(pose);
    expect(game.dash({x:1,y:0})).toBe(true);
    for(let frame=0;frame<7;frame++)tick({x:1,y:0});
    expect(Math.min(gait.left.lift,gait.right.lift)).toBeGreaterThan(3);
    for(let frame=0;frame<45;frame++)tick({x:0,y:0});
    expect(homeError()).toBeLessThan(1.1);
    expect(Math.max(gait.right.lift,gait.left.lift)).toBeLessThan(.01);
    player.x+=300;
    gait.update(player,0,scale,false);
    expect(homeError()).toBe(0);
    player.y+=20;
    gait.reset();gait.update(player,0,scale,false);
    expect(homeError()).toBe(0);
  });
});
