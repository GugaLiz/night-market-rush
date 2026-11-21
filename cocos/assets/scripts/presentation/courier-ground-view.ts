import {Color,Graphics,instantiate,Node,Sprite,UIOpacity,UITransform} from 'cc';
import {WORLD} from '../domain/core/config';
import type {GameState,Settings} from '../domain/shared/types';
import {DashGhostTimeline} from './dash-ghost-model';

/** A world-space ground mark and fixed-pool snapshots behind the live rig.
 * The rig is only read after it is posed; snapshots never update the gait. */
export class CourierGroundView {
  readonly node:Node;
  private readonly ground:Graphics;
  private readonly timeline=new DashGhostTimeline();
  private readonly ghosts:Array<Node|null>=[null,null,null];

  constructor(parent:Node,private readonly courier:Node){
    this.node=new Node('Courier ground and dash ghosts');this.node.layer=parent.layer;
    this.node.addComponent(UITransform);parent.addChild(this.node);
    const ground=new Node('Courier ground marker');ground.layer=this.node.layer;ground.addComponent(UITransform);
    this.ground=ground.addComponent(Graphics);this.node.addChild(ground);
  }

  update(state:GameState,settings:Pick<Settings,'quality'|'reduceMotion'>,advancing:boolean):void {
    const p=state.player,x=p.x-WORLD.width/2,y=WORLD.height/2-p.y,g=this.ground;
    g.clear();g.fillColor=new Color(35,24,29,Math.round(.28*255));g.ellipse(x,y-2,24,24*.32);g.fill();
    g.strokeColor=new Color(255,241,188,Math.round(.55*255));g.lineWidth=1.45;g.ellipse(x,y,p.radius+2,4);g.stroke();
    const allowed=!settings.reduceMotion&&settings.quality==='standard';
    const timeline=this.timeline.update(state.time,!state.ended&&(p.dashUntil??0)>state.time,allowed,advancing);
    if(timeline.capture!==null){
      let clone=this.ghosts[timeline.capture];
      if(!clone){clone=instantiate(this.courier);clone.name=`Dash ghost ${timeline.capture}`;clone.active=false;this.node.addChild(clone);this.ghosts[timeline.capture]=clone;}
      this.copyPose(this.courier,clone);clone.active=true;
    }
    const bySlot=new Map(timeline.ghosts.map(ghost=>[ghost.slot,ghost]));
    const sourceOpacity=this.courier.getComponent(UIOpacity)?.opacity??255;
    for(let slot=0;slot<this.ghosts.length;slot++){
      const ghost=this.ghosts[slot],entry=bySlot.get(slot);if(!ghost)continue;
      ghost.active=!!entry&&entry.alpha>0;
      if(entry){
        // Capture original rig alpha per snapshot, not the current live rig alpha.
        const opacity=ghost.getComponent(UIOpacity)??ghost.addComponent(UIOpacity);
        opacity.opacity=Math.round((this.capturedOpacity[slot]??sourceOpacity)*entry.alpha);
      }
    }
    timeline.ghosts.forEach((entry,index)=>this.ghosts[entry.slot]?.setSiblingIndex(index+1));
  }

  private readonly capturedOpacity:number[]=[255,255,255];
  reset():void {this.timeline.reset();for(const ghost of this.ghosts)if(ghost)ghost.active=false;}
  destroy():void {this.node.destroy();}

  private copyPose(source:Node,target:Node,root=true):void {
    target.active=source.active;target.setPosition(source.position);target.setRotation(source.rotation);target.setScale(source.scale);
    const sourceTransform=source.getComponent(UITransform),targetTransform=target.getComponent(UITransform);
    if(sourceTransform&&targetTransform){targetTransform.setContentSize(sourceTransform.contentSize);targetTransform.setAnchorPoint(sourceTransform.anchorPoint);}
    const sourceSprite=source.getComponent(Sprite),targetSprite=target.getComponent(Sprite);
    if(sourceSprite&&targetSprite){
      targetSprite.enabled=sourceSprite.enabled;targetSprite.spriteFrame=sourceSprite.spriteFrame;targetSprite.color=sourceSprite.color;
      if(sourceTransform&&targetTransform){targetTransform.setContentSize(sourceTransform.contentSize);targetTransform.setAnchorPoint(sourceTransform.anchorPoint);}
    }
    const sourceOpacity=source.getComponent(UIOpacity);
    if(sourceOpacity){
      const targetOpacity=target.getComponent(UIOpacity)??target.addComponent(UIOpacity);targetOpacity.opacity=sourceOpacity.opacity;
      if(root){const slot=this.ghosts.indexOf(target);if(slot>=0)this.capturedOpacity[slot]=sourceOpacity.opacity;}
    }
    source.children.forEach((child,index)=>{
      let mirror=target.getChildByName(child.name);
      if(!mirror){mirror=instantiate(child);target.addChild(mirror);}
      mirror.setSiblingIndex(index);this.copyPose(child,mirror,false);
    });
  }
}
