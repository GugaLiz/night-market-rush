import {HapticsSession} from '../../cocos/assets/scripts/runtime/haptics-session';
import {createBrowserHapticsHost} from '../../cocos/assets/scripts/runtime/browser-haptics';

/** Keep the established browser API backed by the shared haptics session. */
export class SkillHaptics extends HapticsSession {
  constructor(){super(createBrowserHapticsHost());}
}
