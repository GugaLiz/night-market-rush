import type {HapticsHost} from './haptics-session';

/** Browser-only adapter; absent globals and denied device APIs are harmless. */
export function createBrowserHapticsHost():HapticsHost {
  return {
    isAvailable:()=>typeof navigator!=='undefined'&&typeof document!=='undefined'&&
      typeof navigator.vibrate==='function'&&!document.hidden&&navigator.userActivation?.hasBeenActive!==false,
    now:()=>typeof performance!=='undefined'?performance.now():NaN,
    vibrate:pattern=>typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'&&navigator.vibrate(pattern),
    onInterrupt:callback=>{
      const visibility=()=>{if(typeof document!=='undefined'&&document.hidden)callback();};
      const doc=typeof document!=='undefined'?document:null,win=typeof window!=='undefined'?window:null;
      doc?.addEventListener?.('visibilitychange',visibility);
      win?.addEventListener?.('blur',callback);win?.addEventListener?.('pagehide',callback);
      return ()=>{
        doc?.removeEventListener?.('visibilitychange',visibility);
        win?.removeEventListener?.('blur',callback);win?.removeEventListener?.('pagehide',callback);
      };
    },
  };
}
