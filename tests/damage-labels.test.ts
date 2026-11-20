import {describe, expect, it} from 'vitest';
import {Game} from '../src/core/game';
import type {Assets} from '../src/render/assets';
import {DamageLabels} from '../src/render/damage-labels';
import {enemyHeight,layoutEnemyVitals} from '../src/render/enemy-vitals';
import type {GameEvent} from '../src/shared/types';

type PaintedText = {value:string; font:string; x:number; y:number; alpha:number};
function capture(draw:(ctx:CanvasRenderingContext2D)=>void) {
  const text:PaintedText[]=[];
  const noop=()=>{};
  const canvas={
    font:'', globalAlpha:1,
    save:noop, restore:noop, beginPath:noop, roundRect:noop, clip:noop, fill:noop, strokeText:noop,
    fillText(value:string,x:number,y:number) {
      text.push({value,x,y,font:this.font,alpha:this.globalAlpha});
    },
  };
  draw(canvas as unknown as CanvasRenderingContext2D);
  return text;
}

function fixture() {
  const game=new Game(42);
  game.reset(42,true);
  const labels=new DamageLabels();
  const update=(dt=0,reduced=false)=>{
    for(const event of game.drainEvents())labels.add(event);
    labels.update(dt,game.state,reduced);
  };
  const paint=(reduced=false)=>capture(ctx=>labels.draw(ctx,{sprites:{}} as Assets,reduced));
  const hp=()=>capture(ctx=>labels.drawVitals(ctx)).map(row=>row.value);
  return {game,labels,update,paint,hp};
}
const playerHit=(id:number,amount:number):GameEvent=>({
  type:'damage',id,victimId:0,source:'bun',time:0,x:640,y:370,amount,nominal:amount,
});

describe('enemy health on the battle canvas',()=>{
  it('keeps giant-sized elite health plaques outside the body at the top and in the open street',()=>{
    const {game}=fixture();
    const crab=game.spawnEnemy('eliteCrab',{x:300,y:160});
    const kettle=game.spawnEnemy('eliteKettle',{x:800,y:380});
    for(const kind of ['eliteCrab','eliteKettle','eliteSesame'] as const){
      expect(enemyHeight(kind)).toBe(enemyHeight('giantBun'));
    }
    const panels=layoutEnemyVitals(game.state,false,[],[]);
    expect(panels.find(p=>p.id===crab.id)!.y).toBeGreaterThan(crab.y);
    const top=panels.find(p=>p.id===kettle.id)!;
    expect(top.y+top.h).toBeLessThan(kettle.y-enemyHeight(kettle.kind));
  });
  it('paints only the remaining health after hitting a bun',()=>{
    const {game,update,paint,hp}=fixture();
    game.spawnEnemy('bun',{x:750,y:370});
    update();
    expect(hp()).toEqual(['30/30']);
    game.triggerSkill('skate');
    update();
    expect(hp()).toEqual(['10/30']);
    expect(paint()).toEqual([]);
    update(3.5);
    expect(hp()).toEqual(['10/30']);
    expect(paint()).toEqual([]);
  });

  it('omits totals, segment counts and breakdowns when the same weapon repeatedly hits a crowd',()=>{
    const {game,labels,update,paint,hp}=fixture();
    for(let i=0;i<10;i++){
      const e=game.spawnEnemy('bowl',{x:260+i*74,y:440});
      for(let j=0;j<10;j++){
        e.hp-=3;
        labels.add({type:'damage',id:100+i*10+j,victimId:e.id,source:'tongs',amount:3,nominal:3,
          x:e.x,y:e.y,time:j/20,burstIndex:j%5+1,burstCount:5});
      }
    }
    update();
    expect(paint()).toEqual([]);
    expect(hp().length).toBeGreaterThan(0);
    expect(new Set(hp())).toEqual(new Set(['90/120']));
  });

  it('briefly paints one empty health bar for a group defeat',()=>{
    const {game,update,paint,hp}=fixture();
    for(let i=0;i<6;i++)game.spawnEnemy('bun',{x:735,y:350+i*7});
    game.triggerSkill('fan');
    expect(game.state.kills).toBe(6);
    update();
    expect(hp()).toEqual(['0/30']);
    expect(paint()).toEqual([]);
    update(.8);
    expect(hp()).toEqual([]);
    expect(paint()).toEqual([]);
  });
});

describe('rider health feedback',()=>{
  it('keeps signed hurt and heal prompts separate and frozen while paused',()=>{
    const {labels,update,paint}=fixture();
    labels.add(playerHit(100,8));
    labels.add({type:'heal',id:101,x:640,y:370,amount:5});
    update(.3);
    const shown=paint();
    expect(shown.map(row=>row.value).sort()).toEqual(['+5','−8']);
    expect(shown[0].x===shown[1].x&&shown[0].y===shown[1].y).toBe(false);
    update(0);
    expect(paint()).toEqual(shown);
    update(.8);
    expect(paint()).toEqual([]);
  });

  it('does not refresh an old player hit on replay and accepts its id again after reset',()=>{
    const {labels,update,paint}=fixture();
    const hit=playerHit(9,8);
    labels.add(hit);
    update(.9);
    labels.add(hit);
    update(.2);
    expect(paint()).toEqual([]);
    labels.reset();
    labels.add(playerHit(9,4));
    update();
    expect(paint().map(row=>row.value)).toEqual(['−4']);
  });

  it('holds the player label size steady with reduced motion',()=>{
    const {labels,update,paint}=fixture();
    labels.add(playerHit(100,8));
    update(0,true);
    const initial=paint(true)[0];
    const animatedStart=paint()[0];
    update(.13,true);
    expect(paint(true)[0].font).toBe(initial.font);
    expect(paint()[0].font).not.toBe(animatedStart.font);
  });
});
