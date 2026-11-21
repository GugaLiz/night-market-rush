import {Mask,Node,Sprite,SpriteFrame,UITransform} from 'cc';
import {layoutTongs,type TongsSegment} from './held-tongs-geometry';

/** Native atlas sprites clipped in the aligned blade coordinate system.
 * No canvas, generated bitmap or platform-specific API is needed. */
export class HeldTongs {
  readonly node:Node;
  private readonly upper:Node;
  private readonly lower:Node;

  constructor(parent:Node,frame:SpriteFrame,reach:number) {
    const layout=layoutTongs(frame.rect.width,frame.rect.height,reach);
    const node=this.node=new Node('Articulated tongs');node.layer=parent.layer;node.addComponent(UITransform);parent.addChild(node);
    const segment=(name:string,geometry:TongsSegment)=>{
      const pivot=new Node(name);pivot.layer=node.layer;pivot.addComponent(UITransform);pivot.setPosition(geometry.pivotX,0,0);node.addChild(pivot);
      const centerX=(geometry.left+geometry.right)/2-geometry.pivotX,centerY=(geometry.top+geometry.bottom)/2;
      const clip=new Node(`${name} mask`);clip.layer=node.layer;clip.addComponent(UITransform).setContentSize(geometry.right-geometry.left,geometry.bottom-geometry.top);
      clip.setPosition(centerX,-centerY,0);pivot.addChild(clip);clip.addComponent(Mask);
      const image=new Node(`${name} artwork`);image.layer=node.layer;const transform=image.addComponent(UITransform);
      const sprite=image.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;
      transform.setContentSize(layout.width*layout.scale,layout.height*layout.scale);transform.setAnchorPoint(.16,.17);
      image.setPosition(-geometry.pivotX-centerX,centerY,0);
      // The atlas image is rotated into the source-space blade axis.
      image.setRotationFromEuler(0,0,layout.imageAngle*180/Math.PI);clip.addChild(image);
      return pivot;
    };
    segment('Tongs handle',layout.segments[0]);this.upper=segment('Tongs upper jaw',layout.segments[1]);this.lower=segment('Tongs lower jaw',layout.segments[2]);
    node.active=false;
  }

  show(hand:{x:number;y:number},angle:number,jaws:number):void {
    this.node.active=true;this.node.setPosition(hand.x,-hand.y,0);this.node.setRotationFromEuler(0,0,-angle*180/Math.PI);
    this.upper.setRotationFromEuler(0,0,jaws*180/Math.PI);this.lower.setRotationFromEuler(0,0,-jaws*180/Math.PI);
  }
  hide():void {this.node.active=false;}
}
