import {Color, Graphics, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform} from 'cc';
import {CONFIG, WORLD} from '../domain/core/config';
import type {GameState} from '../domain/shared/types';

/** Painted street backdrop; the host owns its textures and the world viewport. */
export class MarketBackground {
  readonly node:Node;
  private readonly pieces:Node[]=[];
  private readonly frames:SpriteFrame[]=[];
  private readonly overlay:Graphics;
  private lastKey='';

  constructor(parent:Node,private readonly textures:readonly [Texture2D,Texture2D]) {
    this.node=new Node('Market background');this.node.layer=parent.layer;
    this.node.addComponent(UITransform);parent.addChild(this.node);
    for(let i=0;i<3;i++){
      const piece=new Node(`Backdrop ${i}`);piece.layer=this.node.layer;
      piece.addComponent(UITransform);piece.addComponent(Sprite);this.node.addChild(piece);this.pieces.push(piece);
    }
    const shade=new Node('Wave transition shade');shade.layer=this.node.layer;
    shade.addComponent(UITransform);this.overlay=shade.addComponent(Graphics);this.node.addChild(shade);
  }

  /** Width/height are visible game units, not physical display pixels. */
  update(state:GameState|null,width:number,height:number,reduceMotion:boolean):void {
    if(!(width>0&&height>0))return;
    const wave=state?.wave??1,age=state?Math.max(0,state.time-state.waveStartedAt):0;
    const changing=wave>1&&age<CONFIG.waves.transition;
    const progress=Math.min(1,age/CONFIG.waves.transition);
    const shown=changing&&progress<.45?wave-1:wave;
    const texture=this.textures[shown%2===0?1:0];
    const key=`${shown%2}/${width}/${height}/${texture.width}/${texture.height}`;
    if(key!==this.lastKey){this.rebuild(texture,width,height);this.lastKey=key;}
    this.overlay.clear();
    if(changing){
      const fade=progress<.45?progress/.45:(1-progress)/.55;
      this.overlay.fillColor=new Color(23,26,45,Math.round(255*Math.min(1,fade)*(reduceMotion?.35:.8)));
      this.overlay.rect(-width/2,-height/2,width,height);this.overlay.fill();
    }
  }

  destroy():void {this.node.destroy();for(const frame of this.frames)frame.destroy();this.frames.length=0;}

  private rebuild(texture:Texture2D,width:number,height:number):void {
    for(const piece of this.pieces)piece.getComponent(Sprite)!.spriteFrame=null;
    for(const frame of this.frames)frame.destroy();this.frames.length=0;
    const w=texture.width,h=texture.height,border=.2;
    const spans: Array<{source:[number,number,number,number];target:[number,number,number,number]}> = [];
    if(width>WORLD.width+1){
      const edge=WORLD.width*border;
      spans.push({source:[0,0,w*border,h],target:[-width/2,-height/2,edge,height]},
        {source:[w*border,0,w*(1-2*border),h],target:[-width/2+edge,-height/2,width-2*edge,height]},
        {source:[w*(1-border),0,w*border,h],target:[width/2-edge,-height/2,edge,height]});
    }else if(height>WORLD.height+1){
      const edge=WORLD.height*border;
      spans.push({source:[0,0,w,h*border],target:[-width/2,height/2-edge,width,edge]},
        {source:[0,h*border,w,h*(1-2*border)],target:[-width/2,-height/2+edge,width,height-2*edge]},
        {source:[0,h*(1-border),w,h*border],target:[-width/2,-height/2,width,edge]});
    }else spans.push({source:[0,0,w,h],target:[-width/2,-height/2,width,height]});
    this.pieces.forEach((node,index)=>{
      const span=spans[index];node.active=!!span;if(!span)return;
      const [x,y,sw,sh]=span.source,[left,bottom,tw,th]=span.target;
      const frame=new SpriteFrame();frame.texture=texture;frame.rect=new Rect(x,y,sw,sh);
      frame.originalSize=new Size(sw,sh);frame.packable=false;this.frames.push(frame);
      node.getComponent(Sprite)!.spriteFrame=frame;
      node.getComponent(UITransform)!.setContentSize(tw,th);node.setPosition(left+tw/2,bottom+th/2);
    });
  }
}
