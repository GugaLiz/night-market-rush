import {describe, expect, it} from 'vitest';
import {Game} from '../cocos/assets/scripts/domain/core/game';
import {CONFIG} from '../cocos/assets/scripts/domain/core/config';
import {SimulationSession} from '../cocos/assets/scripts/runtime/simulation-session';

describe('Cocos simulation session',()=>{
  it('uses the existing fixed-step game with the same seeded inputs and events',()=>{
    const actualEvents:unknown[]=[];
    const session=new SimulationSession(42,events=>actualEvents.push(...events));
    const baseline=new Game(42);
    session.start(42);
    const expectedEvents:unknown[]=[];
    for(let i=0;i<120;i++){
      const input={x:.25,y:-.5};
      session.update(CONFIG.step,input);
      baseline.update(CONFIG.step,input);
      expectedEvents.push(...baseline.drainEvents());
    }
    expect(session.state).toEqual(baseline.state);
    expect(actualEvents).toEqual(expectedEvents);
  });

  it('does not advance while paused or catch up after a stalled frame',()=>{
    const session=new SimulationSession(42);session.start(42);
    session.update(CONFIG.step,{x:1,y:0});
    const time=session.state.time;
    session.update(1,{x:1,y:0});
    expect(session.state.time).toBe(time);
    session.pause();session.update(.1,{x:1,y:0});
    expect(session.state.time).toBe(time);
    expect(session.resume()).toBe(true);
    session.update(CONFIG.step,{x:0,y:0});
    expect(session.state.time).toBeCloseTo(time+CONFIG.step);
  });

  it('consumes a presentation hold before advancing simulation time',()=>{
    const session=new SimulationSession(42);session.start(42);session.hold(.03);
    session.update(.02,{x:1,y:0});
    expect(session.state.time).toBe(0);
    session.update(.03,{x:1,y:0});
    expect(session.state.time).toBeCloseTo(CONFIG.step);
  });
});
