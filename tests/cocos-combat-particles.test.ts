import {describe,expect,it} from 'vitest';
import type {GameEvent} from '../cocos/assets/scripts/domain/shared/types';
import {CombatParticlesModel} from '../cocos/assets/scripts/presentation/combat-particles-model';

const standard={quality:'standard' as const,reduceMotion:false},simple={quality:'simple' as const,reduceMotion:false};
const kill=(id:number,x:number,source:'fan'|'vortex'='fan'):GameEvent=>({type:'kill',kind:'bun',victimId:id,x,y:200,points:1,source});
const damage=(victimId:number,source:'bun'|'tongs'|'poison'|'frost',burstIndex=1):GameEvent=>({
  type:'damage',id:99,victimId,source,x:100,y:200,time:1,amount:5,nominal:5,burstIndex,
});

describe('combat event particles',()=>{
  it('uses distinct original event counts, colours and timing',()=>{
    const model=new CombatParticlesModel();
    model.events([{type:'coin',x:100,y:200,amount:1},{type:'dash',x:100,y:200,angle:0},
      {type:'weapon',kind:'bag',previous:'tongs',x:100,y:200},{type:'fail',kind:'bun',x:100,y:200}],1);
    expect(model.update(.99,standard)).toHaveLength(0);
    const particles=model.update(1,standard);
    expect(particles).toHaveLength(49);
    expect(particles.filter(p=>p.color==='#ffe49a')).toHaveLength(5);
    expect(particles.filter(p=>p.color==='#bff4e3')).toHaveLength(10);
    expect(particles.filter(p=>p.color==='#ffe1a3')).toHaveLength(12);
    expect(particles.filter(p=>p.color==='#ffb079')).toHaveLength(22);
    expect(model.update(1.71,standard)).toHaveLength(0);
  });
  it('keeps weapon, frost and repeated damage from producing duplicate bursts',()=>{
    const model=new CombatParticlesModel();
    model.events([damage(1,'tongs'),damage(1,'tongs',2),damage(2,'frost'),damage(3,'poison'),damage(0,'bun')],1);
    const particles=model.update(1,standard);
    expect(particles.filter(p=>p.color==='#c9f17d')).toHaveLength(3);
    expect(particles.filter(p=>p.color==='#ff907e')).toHaveLength(4);expect(particles).toHaveLength(7);
  });
  it('uses crowd bursts, excludes vortex swallowing and respects reduced quality',()=>{
    const model=new CombatParticlesModel();model.events([kill(1,90),kill(2,100),kill(3,110),kill(4,120,'vortex')],1);
    const particles=model.update(1,simple);expect(particles).toHaveLength(6);
    expect(particles.every(p=>p.color==='#ffdb86')).toBe(true);
    model.reset();model.events([kill(1,100)],1);expect(model.update(1,{...standard,reduceMotion:true})).toEqual([]);
    expect(model.update(1.1,standard)).toEqual([]);
  });
  it('caps particle memory and expires or resets the presentation',()=>{
    const model=new CombatParticlesModel();model.events(Array.from({length:60},(_,id)=>kill(id,100+id)),1);
    expect(model.update(1,standard)).toHaveLength(160);expect(model.update(1.71,standard)).toEqual([]);
    model.events([kill(90,100)],2);model.reset();expect(model.update(2,standard)).toEqual([]);
  });
});
