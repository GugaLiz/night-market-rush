import type {Settings,SaveData,Vec,GameEvent} from '../shared/types';

/** Small host boundary. Simulation and data schemas never import a host SDK. */
export interface PlatformCapabilities {touch:boolean;keyboard:boolean;motion:boolean;fullscreen:boolean;native:boolean}
export interface PlatformServices {
  readonly id:'web'|'wechat'|'android'|'ios';
  readonly capabilities:PlatformCapabilities;
  readSave():SaveData;
  writeSettings(settings:Settings):boolean;
  movement():Vec;
  sound(event:GameEvent|'ui'|'start'|'record'):void;
  onInterruption(callback:()=>void):()=>void;
}
export function webCapabilities():PlatformCapabilities {
  return {touch:typeof navigator!=='undefined'&&navigator.maxTouchPoints>0,keyboard:true,
    motion:typeof DeviceOrientationEvent!=='undefined',fullscreen:typeof document!=='undefined'&&document.fullscreenEnabled,native:false};
}
