import type {GameView} from '../ui/game-ui';
import type {AudioScene} from './cue-policy';

/** Preserve menu music only when the overlay was opened from a home scene.
 * Battle, interrupted runs and portrait guidance remain paused. */
export function audioSceneForView(view:GameView,settingsOrigin:GameView,catalogOrigin:GameView):AudioScene {
  if(view==='play')return 'play';
  if(view==='home'||view==='tutorial')return 'home';
  if(view==='settings'&&(settingsOrigin==='home'||settingsOrigin==='tutorial'))return 'home';
  if(view==='catalog'&&(catalogOrigin==='home'||catalogOrigin==='tutorial'))return 'home';
  return 'paused';
}
