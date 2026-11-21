import {describe,expect,it} from 'vitest';
import {Game} from '../cocos/assets/scripts/domain/core/game';
import type {GameEvent} from '../cocos/assets/scripts/domain/shared/types';
import {EnemyFeedbackModel,enemyFallPose,enemyRecoil,fallenSprite} from '../cocos/assets/scripts/presentation/enemy-feedback-model';

describe('enemy damage presentation',()=>{
  it('uses real kill events without drawing a duplicate removal fade',()=>{
    const game=new Game(2),model=new EnemyFeedbackModel(),p=game.state.player;
    const enemy=game.spawnEnemy('bun',{x:p.x+40,y:p.y});enemy.spawnAt=-5;
    model.sync(game.state.enemies,game.state.time);
    game.triggerSkill('fan');const events=game.drainEvents();
    const killed=events.find(e=>e.type==='kill');expect(killed).toMatchObject({victimId:enemy.id,source:'fan'});
    model.events(events,game.state.time);
    const falls=model.sync(game.state.enemies,game.state.time);
    expect(falls).toHaveLength(1);expect(falls[0]).toMatchObject({id:enemy.id,source:'fan',clear:false});
    expect(model.sync(game.state.enemies,game.state.time+.26)).toHaveLength(0);
  });
  it('shows a brief clear fade for removal without kill events and resets between runs',()=>{
    const game=new Game(4),model=new EnemyFeedbackModel();
    const enemy=game.spawnEnemy('eliteKettle',{x:500,y:350});enemy.spawnAt=-5;
    model.sync(game.state.enemies,0);game.clearArena();
    const fall=model.sync(game.state.enemies,0)[0];expect(fall).toMatchObject({id:enemy.id,clear:true});
    expect(enemyFallPose(fall,.1,false).alpha).toBeCloseTo(.6);
    model.reset();expect(model.sync(game.state.enemies,.2)).toEqual([]);
  });
  it('recoils along the actual hit angle and disables motion when requested',()=>{
    const model=new EnemyFeedbackModel();
    const event:GameEvent={type:'damage',id:1,victimId:2,source:'tongs',amount:5,nominal:5,x:20,y:30,time:1,impactAngle:Math.PI/2,burstIndex:1};
    model.events([event],1);const hit=model.contact(2,1.1)!;
    const animated=enemyRecoil(hit,1.1,false);expect(animated.y).toBeGreaterThan(0);expect(animated.x).toBeCloseTo(0);
    expect(enemyRecoil(hit,1.1,true)).toEqual({x:0,y:0,squash:0,tilt:0});
    expect(model.contact(2,1.3)).toBeUndefined();
    expect(fallenSprite('eliteKettle')).toBe('eliteKettle');expect(fallenSprite('box')).toBe('boxLow');expect(fallenSprite('bun')).toBe('bunHurt');
  });
  it('launches nearby group defeats with the original extended reaction',()=>{
    const model=new EnemyFeedbackModel();
    const kill=(id:number,x:number):GameEvent=>({type:'kill',victimId:id,kind:'bun',x,y:100,points:1,source:'soda'});
    model.events([kill(1,100),kill(2,120)],1);
    model.events([kill(3,140)],1.1);
    const falls=model.sync([],1.1);
    expect(falls.find(f=>f.id===1)).toMatchObject({duration:.25,distance:12});
    const third=falls.find(f=>f.id===3)!;expect(third).toMatchObject({duration:.41,distance:45});
    const pose=enemyFallPose(third,1.2,false);expect(pose.ghost).toBe(true);expect(pose.ghostY).toBeGreaterThan(pose.y);
    expect(pose.ghostAlpha).toBeCloseTo((1-.1/.41)*.25);
    model.reset();model.events([kill(4,140)],1.11);expect(model.sync([],1.11)[0]).toMatchObject({duration:.25,distance:12});
  });
  it('aims a group launch away from the centre when non-weapon damage has no direction',()=>{
    const model=new EnemyFeedbackModel();
    const kill=(id:number,x:number):GameEvent=>({type:'kill',victimId:id,kind:'bun',x,y:100,points:1,source:'soda'});
    const damage:GameEvent={type:'damage',id:20,victimId:1,source:'soda',amount:5,nominal:5,x:80,y:100,time:1};
    model.events([damage,kill(1,80),kill(2,100),kill(3,120)],1);
    const first=model.sync([],1).find(f=>f.id===1)!;
    expect(Math.cos(first.angle)).toBeLessThan(-.9);expect(first.duration).toBe(.41);
  });
  it('keeps vortex victims at the impact point with the original sprite and fades them',()=>{
    const model=new EnemyFeedbackModel();
    model.events([{type:'kill',victimId:8,kind:'bun',x:100,y:120,points:1,source:'vortex'}],2);
    const fall=model.sync([],2)[0],pose=enemyFallPose(fall,2.135,false);
    expect(fallenSprite('bun','vortex')).toBe('bun');
    expect(pose.x).toBe(100);expect(pose.y).toBe(120);expect(pose.scale).toBeCloseTo(.225);
    expect(pose.alpha).toBeCloseTo(.5);expect(pose.ghost).toBe(false);
    const quiet=enemyFallPose(fall,2.135,true);expect(quiet.scale).toBe(1);expect(quiet.angle).toBe(0);
  });
});
