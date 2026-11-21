import {describe,expect,it} from 'vitest';
import {COURIER_WEAPON_WIDTH,courierWeaponPose,fitTwoHandedGrip} from '../cocos/assets/scripts/presentation/courier-weapon-pose';
import {WEAPONS} from '../cocos/assets/scripts/domain/core/weapons';
import {WEAPON_KINDS,type WeaponAttack,type WeaponKind} from '../cocos/assets/scripts/domain/shared/types';

const attack=(kind:WeaponKind,phase:WeaponAttack['phase'],angle:number):WeaponAttack=>({id:1,kind,phase,angle,startedAt:0,releaseAt:.1,endsAt:.1+WEAPONS[kind].active+.2,targetId:-1,hitIds:[],blocked:false,swingSide:1});
const pose=(kind:WeaponKind,phase:WeaponAttack['phase'],angle:number,progress=.5)=>{
  const a=attack(kind,phase,angle),time=phase==='windup'?.1*progress:phase==='active'?.1+WEAPONS[kind].active*progress:.1+WEAPONS[kind].active+.2*progress;
  return courierWeaponPose({kind,attack:a,time,heading:angle,flip:1,upperX:0,chest:{x:0,y:-25},stepSwing:0,accent:1,effort:.5,scale:1.35});
};

describe('courier weapon presentation',()=>{
  it('produces finite poses for every weapon, direction and phase',()=>{
    for(const kind of WEAPON_KINDS)for(const phase of ['windup','active','recovery'] as const)for(let direction=0;direction<8;direction++){
      const result=pose(kind,phase,direction*Math.PI/4);
      for(const n of [result.right.x,result.right.y,result.left.x,result.left.y,result.angle,result.stretch,result.umbrellaSpread,result.phase])expect(Number.isFinite(n)).toBe(true);
      expect(result.phase).toBeGreaterThanOrEqual(0);expect(result.phase).toBeLessThanOrEqual(1);
      expect(COURIER_WEAPON_WIDTH[kind]).toBeGreaterThan(0);
    }
  });
  it('keeps different weapon release poses and follows the melee sweep',()=>{
    const ranged=(['bag','chopsticks','spirit','tray','lunchbox','talisman'] as const).map(k=>pose(k,'active',0));
    expect(new Set(ranged.map(p=>`${p.right.x.toFixed(2)},${p.right.y.toFixed(2)},${p.angle.toFixed(2)}`)).size).toBe(6);
    for(const kind of ['tongs','knife','umbrella','sword'] as const){
      const early=pose(kind,'active',0,.2),late=pose(kind,'active',0,.8);
      expect(Math.abs(early.angle-late.angle)).toBeGreaterThan(.1);
    }
  });
  it('expands the umbrella and compresses the paper bag during release',()=>{
    expect(pose('umbrella','active',0).umbrellaSpread).toBe(1);
    expect(pose('umbrella','recovery',0,1).umbrellaSpread).toBe(0);
    expect(pose('bag','windup',0,.9).stretch).toBeGreaterThan(1);
    expect(pose('bag','active',0,.1).stretch).toBeLessThan(1);
  });
  it('keeps the relative grip and pulls a reachable two-hand grip into both arm ranges',()=>{
    const right={x:30,y:-10},left={x:24,y:-6},before={x:left.x-right.x,y:left.y-right.y};
    const shoulderR={x:10,y:-20},shoulderL={x:-10,y:-20};
    fitTwoHandedGrip(right,left,shoulderR,shoulderL);
    expect(left.x-right.x).toBeCloseTo(before.x,8);expect(left.y-right.y).toBeCloseTo(before.y,8);
    expect(Math.hypot(right.x-shoulderR.x,right.y-shoulderR.y)).toBeLessThanOrEqual(15.1+1e-8);
    expect(Math.hypot(left.x-shoulderL.x,left.y-shoulderL.y)).toBeLessThanOrEqual(15.1+1e-8);
  });
});
