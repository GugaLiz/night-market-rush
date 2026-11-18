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
    distance(gait.right,{x:player.x+5.5*scale,y:player.y+1.2*scale}),
    distance(gait.left,{x:player.x-5.5*scale,y:player.y-1.2*scale}),
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
