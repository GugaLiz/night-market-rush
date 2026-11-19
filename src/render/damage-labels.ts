import {CONFIG, WORLD} from '../core/config';
import {clamp} from '../core/geometry';
import type {DamageSource, GameEvent, GameState} from '../shared/types';
import type {Assets} from './assets';
import {drawSprite} from './sprite';
import {drawEnemyVitals, layoutEnemyVitals, type EnemyVitals, type FallenEnemy, type VitalsRect} from './enemy-vitals';

const width=104, height=30, playerLifetime=1.05;
type PlayerHit={amount:number; source:DamageSource|null; at:number};
type PlayerLabel=PlayerHit & {x:number; y:number; heal:boolean};

export class DamageLabels {
  private clock=0;
  private damage:PlayerHit|null=null;
  private heal:PlayerHit|null=null;
  private visible:PlayerLabel[]=[];
  private fallen:(Omit<FallenEnemy,'age'> & {at:number})[]=[];
  private vitals:EnemyVitals[]=[];
  private seen=new Float64Array(4096).fill(-1);
  private highestId=-1;

  reset():void {
    this.clock=0;
    this.damage=this.heal=null;
    this.visible=[];
    this.fallen=[];
    this.vitals=[];
    this.seen.fill(-1);
    this.highestId=-1;
  }

  add(event:GameEvent):void {
    if(event.type==='kill'){
      if(event.victimId!==undefined && !this.fallen.some(e=>e.id===event.victimId)){
        this.fallen.push({id:event.victimId,x:event.x,y:event.y,kind:event.kind,
          maxHp:event.maxHp??CONFIG.enemies[event.kind].hp,at:this.clock});
      }
      return;
    }
    if(event.type!=='heal' && !(event.type==='damage' && event.victimId===0))return;
    if(!Number.isFinite(event.amount)||event.amount<=0||!Number.isSafeInteger(event.id)||event.id<0)return;
    const slot=event.id%this.seen.length;
    if(event.id<=this.highestId-this.seen.length || this.seen[slot]===event.id)return;
    this.seen[slot]=event.id;
    this.highestId=Math.max(this.highestId,event.id);
    const hit={amount:event.amount,source:event.type==='damage'?event.source:null,at:this.clock};
    if(event.type==='heal')this.heal=hit;
    else this.damage=hit;
  }

  update(dt:number,state:GameState,reduceMotion=false):void {
    this.clock+=Number.isFinite(dt)?Math.max(0,dt):0;
    if(this.damage && this.clock-this.damage.at>=playerLifetime)this.damage=null;
    if(this.heal && this.clock-this.heal.at>=playerLifetime)this.heal=null;
    this.visible=[];
    const p=state.player, top=84, bottom=Math.min(WORLD.bounds.bottom,WORLD.height-110);
    const occupied:VitalsRect[]=[];
    for(const [hit,heal] of [[this.damage,false],[this.heal,true]] as const){
      if(!hit)continue;
      const x=clamp(p.x+(heal?-95:95),16+width/2,WORLD.width-16-width/2);
      let y=clamp(p.y-112+(heal?height+8:0),top,bottom-height);
      const other=this.visible[0];
      if(other && Math.abs(x-other.x)<width+6 && Math.abs(y-other.y)<height+6){
        y=other.y+2*height+8<=bottom ? other.y+height+8 : other.y-height-8;
      }
      this.visible.push({...hit,x,y,heal});
      occupied.push({x:x-width/2,y,w:width,h:height});
    }
    occupied.push({x:p.x-39,y:p.y-122,w:78,h:130});
    this.fallen=this.fallen.filter(e=>this.clock-e.at<.72);
    this.vitals=layoutEnemyVitals(state,reduceMotion,this.fallen.map(e=>({...e,age:this.clock-e.at})),occupied);
  }

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
