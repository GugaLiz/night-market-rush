import {clamp} from '../core/geometry';
import type {Assets} from './assets';
import {drawSprite} from './sprite';
import {drawEnemyVitals} from './enemy-vitals';
import {DamageLabelModel, PLAYER_LABEL_HEIGHT, PLAYER_LABEL_LIFETIME} from '../../cocos/assets/scripts/presentation/damage-model';

const height=PLAYER_LABEL_HEIGHT, playerLifetime=PLAYER_LABEL_LIFETIME;

export class DamageLabels extends DamageLabelModel {
  drawVitals(c:CanvasRenderingContext2D):void {
    drawEnemyVitals(c,this.vitals);
  }

  draw(c:CanvasRenderingContext2D,assets:Assets,reduceMotion=false):void {
    if(!this.visible.length)return;
    c.save();
    c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
    for(const label of this.visible){
      const age=this.clock-label.at, y=label.y+height/2;
      c.globalAlpha=clamp((playerLifetime-age)/.25,0,1);
      if(label.source && label.source in assets.sprites){
        const sprite=assets.sprites[label.source], h=Math.min(17,17*sprite.height/sprite.width);
        drawSprite(c,assets,label.source,label.x-37,y+h/2,h);
      }
      const size=26+(reduceMotion?0:5*Math.max(0,1-age/.22));
      c.font=`900 ${size}px "Microsoft YaHei",sans-serif`;
      c.lineWidth=4.5;
      c.strokeStyle='#422538';
      c.fillStyle=label.heal?'#a3ffcb':'#ff9980';
      const value=(label.heal?'+':'−')+(Number.isInteger(label.amount)?String(label.amount):label.amount.toFixed(1));
      c.strokeText(value,label.x,y,76);c.fillText(value,label.x,y,76);
    }
    c.restore();
  }
}
