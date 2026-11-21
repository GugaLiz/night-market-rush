import {Color, Graphics, Node, Sprite, UITransform} from 'cc';
import {WORLD} from '../domain/core/config';
import {WEAPONS} from '../domain/core/weapons';
import type {GameState, Settings} from '../domain/shared/types';
import {SpriteAtlas} from './sprite-atlas';
import {isBrinedTray} from './weapon-impact-model';
import {enemyShotPoint, enemyShotVisual} from './enemy-shot-model';
import {projectilePosition, type ProjectileLaunch} from './projectile-position';
import {chopstickFlight} from './chopstick-flight-model';
import type {Vec} from '../domain/shared/types';

interface FlightSprite {node:Node; sprite:Sprite; transform:UITransform}
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const color=(hex:string,alpha=255)=>{const result=new Color().fromHEX(hex);result.a=alpha;return result;};

/** Migration-stage projectiles; rendering does not change the authoritative game. */
export class ProjectilesView {
  readonly node:Node;
  /** Sibling layer: host places it over actors/world effects and below UI. */
  readonly enemyShotNode:Node;
  private readonly graphics:Graphics;
  private readonly enemyGraphics:Graphics;
  private readonly sprites=new Map<number,FlightSprite>();

  constructor(parent:Node,private readonly atlas:SpriteAtlas) {
    this.node=new Node('Weapon and enemy projectiles');this.node.layer=parent.layer;
    this.node.addComponent(UITransform);parent.addChild(this.node);
    const canvas=new Node('Projectile trails');canvas.layer=this.node.layer;
    canvas.addComponent(UITransform);this.graphics=canvas.addComponent(Graphics);this.node.addChild(canvas);
    this.enemyShotNode=new Node('Enemy projectiles foreground');this.enemyShotNode.layer=parent.layer;
    this.enemyShotNode.addComponent(UITransform);this.enemyGraphics=this.enemyShotNode.addComponent(Graphics);parent.addChild(this.enemyShotNode);
  }

  update(state:GameState,settings:Settings,launch:ProjectileLaunch|null=null,catchPoint:Vec|null=null):void {
    const g=this.graphics;g.clear();this.enemyGraphics.clear();const alive=new Set<number>();
    for(const q of state.projectiles){
      alive.add(q.id);
      const a=Math.atan2(q.vy,q.vx),point=projectilePosition(q,state.time,state.player,launch,catchPoint);
      let x=point.x,y=point.y,rotation=0,height=0,width:number|undefined,name='';
      if(q.kind==='tray'){name='tray';height=28;width=38;rotation=settings.reduceMotion?0:state.time*17;}
      else if(q.kind==='spirit'){name='spiritOrb';height=39;}
      else if(q.kind==='chopsticks')this.drawChopsticks(x,y,a,q.travelled,q.id,settings.reduceMotion||settings.quality==='simple');
      else if(q.kind==='talisman'){name='talismanPaper';height=q.phase==='out'?30:28;rotation=q.phase==='out'?a+Math.PI/2:Math.sin(state.time*20)*.2;}
      else if(q.kind==='lunchbox'){
        const phase=Math.min(1,(state.time-q.bornAt)/.65);
        y+=phase*22-Math.sin(phase*Math.PI)*75;name='meal';height=32;rotation=phase*1.5;
        g.strokeColor=color('#ffdf9b',150);g.lineWidth=2;g.circle(X(q.targetX),Y(q.targetY),WEAPONS.lunchbox.width);g.stroke();
      }
      if(q.kind==='bag'&&(q.phase==='out'||q.phase==='return')){
        const limit=settings.reduceMotion?18:settings.quality==='simple'?43:65;
        this.drawPaperWake(x,y,a,Math.min(limit,q.travelled));
      }else if(!settings.reduceMotion&&q.kind!=='chopsticks'){
        const length=Math.min(settings.quality==='simple'?43:65,q.travelled);
        g.strokeColor=color('#ffe6b3',150);g.lineWidth=q.kind==='bag'?4:2;
        g.moveTo(X(x),Y(y));g.lineTo(X(x-Math.cos(a)*length),Y(y-Math.sin(a)*length));g.stroke();
      }
      if(q.kind==='bag'){
        this.drawPaperPuff(x,y,a,q.travelled);
      }
      if(isBrinedTray(q)){
        // A bright attached rim stays visible on both outbound and return legs,
        // including reduced motion, so the poison coating is never implicit.
        g.strokeColor=color('#216a61',245);g.lineWidth=6;g.circle(X(x),Y(y),25);g.stroke();
        g.strokeColor=color('#c9ffbd',255);g.lineWidth=2.5;g.circle(X(x),Y(y),25);g.stroke();
        g.fillColor=color('#7ee1a1',235);g.circle(X(x-17),Y(y+17),4);g.circle(X(x+15),Y(y+18),3);g.fill();
      }
      if(!name){this.sprites.get(q.id)?.node.setScale(0,0,1);continue;}
      const item=this.sprites.get(q.id)??this.create(q.id);
      const frame=this.atlas.require(name);item.sprite.spriteFrame=frame;
      const visualWidth=width??height*frame.rect.width/frame.rect.height;
      item.transform.setContentSize(visualWidth,height);
      item.node.setPosition(X(x),Y(y));item.node.angle=-rotation*180/Math.PI;
      item.node.setScale(q.kind==='spirit'&&q.vx<0?-1:1,1,1);
    }
    for(const [id,item] of this.sprites){if(!alive.has(id)){item.node.destroy();this.sprites.delete(id);}}
    for(const shot of state.enemyShots??[])this.drawEnemyShot(shot);
  }

  destroy():void {this.node.destroy();this.enemyShotNode.destroy();this.sprites.clear();}

  /** Paired bamboo sticks and their opening paper sleeve, matching Web local coordinates. */
  private drawChopsticks(x:number,y:number,angle:number,distance:number,id:number,quiet:boolean):void {
    const g=this.graphics,v=chopstickFlight(distance,id,quiet),c=Math.cos(angle),s=Math.sin(angle);
    const base=(u:number,w:number)=>({x:X(x+v.size*(u*c-w*s)),y:Y(y+v.size*(u*s+w*c))});
    const path=(point:(u:number,w:number)=>{x:number;y:number})=>({
      move:(u:number,w:number)=>{const p=point(u,w);g.moveTo(p.x,p.y);},
      line:(u:number,w:number)=>{const p=point(u,w);g.lineTo(p.x,p.y);},
      quad:(u:number,w:number,a:number,b:number)=>{const p=point(u,w),q=point(a,b);g.quadraticCurveTo(p.x,p.y,q.x,q.y);},
    });
    if(v.length>5){
      const tail=-32-v.length,mid=-32-v.length*.53,crest=v.crest,ribbon=path((u,w)=>base(u,w*.68));
      ribbon.move(-29,-3);ribbon.quad(-41,-15-crest,mid,-4-crest);ribbon.quad(mid-12,5,tail,-2);
      ribbon.line(tail+9,3);ribbon.quad(mid-8,15,mid+3,3-crest);ribbon.quad(-42,-7-crest,-29,1);g.close();
      g.fillColor=color('#40ac91',194);g.strokeColor=color('#286c61',194);g.lineWidth=1.4*v.size;g.fill();g.stroke();
      ribbon.move(-31,-4);ribbon.quad(-43,-14-crest,mid,-3-crest);g.strokeColor=color('#dcffe1',194);g.lineWidth=2.3*v.size;g.stroke();
      if(v.leaf){
        const leaf=path((u,w)=>base(tail+10+.72*u,(7+crest+.72*w)*.68));
        leaf.move(0,0);leaf.quad(3,-8,17,-6);leaf.quad(11,3,0,0);g.close();
        g.fillColor=color('#84dfab',194);g.strokeColor=color('#287260',194);g.lineWidth=1.5*v.size*.72;g.fill();g.stroke();
        leaf.move(2,0);leaf.line(13,-5);g.strokeColor=color('#e9ffe0',194);g.lineWidth=1.2*v.size*.72;g.stroke();
      }
    }
    for(const side of [-1,1]){
      const a=-side*(.045+v.spread*.15),ca=Math.cos(a),sa=Math.sin(a);
      const stick=path((u,w)=>base(u*ca-w*sa,side*1.6+u*sa+w*ca));
      stick.move(-40,-3);stick.quad(-43,-3,-42,0);stick.quad(-42,3.2,-39,3.3);
      stick.line(-8,1.6);stick.quad(2,1,2,0);stick.line(-10,-1.5);g.close();
      g.fillColor=color('#ffce65');g.strokeColor=color('#79412f');g.lineWidth=1.6*v.size;g.fill();g.stroke();
      const rect=(u:number,w:number,width:number,height:number,fill:string)=>{
        stick.move(u,w);stick.line(u+width,w);stick.line(u+width,w+height);stick.line(u,w+height);g.close();g.fillColor=color(fill);g.fill();
      };
      rect(-41,-2.4,10,5.2,'#bb4535');rect(-38,-2.3,2,5.1,'#fff0af');rect(-31,-2.4,4.5,4.9,'#508874');
      stick.move(-25,-1.8);stick.quad(-26,0,-24.5,2);stick.move(-13,-1);stick.quad(-14,.2,-13,1.6);
      g.strokeColor=color('#b67a34');g.lineWidth=1.5*v.size;g.stroke();
      stick.move(-24,-1.4);stick.line(-5,-.4);g.strokeColor=color('#fff3bb');g.lineWidth=1.2*v.size;g.stroke();
    }
  }

  /** Pleated paper pressure front from the Web artwork, in shot-local coordinates. */
  private drawPaperPuff(x:number,y:number,angle:number,distance:number):void {
    const g=this.graphics,size=.40+.60*Math.min(1,Math.max(0,distance)/85),c=Math.cos(angle),s=Math.sin(angle);
    const p=(u:number,v:number)=>({x:X(x+(u*c-v*s)*size),y:Y(y+(u*s+v*c)*size)});
    const move=(u:number,v:number)=>{const t=p(u,v);g.moveTo(t.x,t.y);};
    const line=(u:number,v:number)=>{const t=p(u,v);g.lineTo(t.x,t.y);};
    const quad=(u:number,v:number,w:number,z:number)=>{const a=p(u,v),b=p(w,z);g.quadraticCurveTo(a.x,a.y,b.x,b.y);};
    move(-18,-4);line(-9,-13);line(-1,-11);line(6,-15);quad(14,-8,16,0);
    line(7,13);line(0,10);line(-8,14);line(-16,6);g.close();
    g.fillColor=color('#efd39b',189);g.strokeColor=color('#926449');g.lineWidth=1.6*size;g.fill();g.stroke();
    move(-16,-4);line(-7,-7);line(-4,-11);line(1,-5);line(7,-12);line(12,-4);
    g.strokeColor=color('#fff5cf');g.lineWidth=2*size;g.stroke();
    move(-10,11);line(-7,4);line(0,7);line(4,3);line(8,5);
    g.strokeColor=color('#c58955');g.lineWidth=1.6*size;g.stroke();
  }

  /** Compress the wake along its direction while a shot is still near the hand. */
  private drawPaperWake(x:number,y:number,angle:number,length:number):void {
    if(length<=1)return;
    const g=this.graphics,c=Math.cos(angle),s=Math.sin(angle),stretch=length/65;
    const p=(u:number,v:number)=>({x:X(x+u*stretch*c-v*s),y:Y(y+u*stretch*s+v*c)});
    const move=(u:number,v:number)=>{const t=p(u,v);g.moveTo(t.x,t.y);};
    const quad=(u:number,v:number,w:number,z:number)=>{const a=p(u,v),b=p(w,z);g.quadraticCurveTo(a.x,a.y,b.x,b.y);};
    move(-17,-14);quad(0,-10,3,0);quad(-2,12,-18,15);quad(-5,4,-1,0);quad(-5,-7,-17,-10);g.close();
    g.fillColor=color('#eccb8d');g.strokeColor=color('#a77849');g.lineWidth=1.4;g.fill();g.stroke();
    move(-46,-8);quad(-24,-4,-29,4);quad(-34,10,-45,9);g.strokeColor=color('#fff4c4');g.lineWidth=2;g.stroke();
  }

  /** Soup has a noodle trail; tea has a brown body and green leaf. */
  private drawEnemyShot(shot:NonNullable<GameState['enemyShots']>[number]):void {
    const g=this.enemyGraphics,v=enemyShotVisual(shot),tea=v.kind==='tea';
    const p=(x:number,y:number)=>{const q=enemyShotPoint(v,x,y);return {x:X(q.x),y:Y(q.y)};};
    const move=(x:number,y:number)=>{const a=p(x,y);g.moveTo(a.x,a.y);};
    const bezier=(x1:number,y1:number,x2:number,y2:number,x3:number,y3:number)=>{
      const a=p(x1,y1),b=p(x2,y2),c=p(x3,y3);g.bezierCurveTo(a.x,a.y,b.x,b.y,c.x,c.y);
    };
    const quad=(x1:number,y1:number,x2:number,y2:number)=>{
      const a=p(x1,y1),b=p(x2,y2);g.quadraticCurveTo(a.x,a.y,b.x,b.y);
    };
    g.fillColor=color('#372629',65);g.ellipse(X(v.x),Y(v.y+3*v.scale),8*v.scale,3.6*v.scale);g.fill();
    move(-19,0);bezier(-6,-3,-1,-10,6,-7);bezier(16,-2,10,10,2,7);bezier(-5,6,-8,2,-19,0);g.close();
    g.fillColor=color(tea?'#b77b3d':'#f29e38');g.strokeColor=color(tea?'#78482f':'#773e2d');g.lineWidth=2*v.scale;g.fill();g.stroke();
    const shine=p(3,-3);g.fillColor=color('#fff1ba');g.ellipse(shine.x,shine.y,4*v.scale,1.9*v.scale);g.fill();
    if(tea){
      move(-5,-1);quad(-1,-6,4,-2);quad(2,2,-5,-1);g.close();g.fillColor=color('#718748');g.fill();
    }else{
      move(-25,2);bezier(-19,-5,-13,7,-8,2);quad(-4,-2,0,1);
      g.strokeColor=color('#8d5339');g.lineWidth=3.8*v.scale;g.stroke();
      move(-25,2);bezier(-19,-5,-13,7,-8,2);quad(-4,-2,0,1);
      g.strokeColor=color('#ffd78a');g.lineWidth=2*v.scale;g.stroke();
      const leaf=p(2,3);g.fillColor=color('#68904c');g.ellipse(leaf.x,leaf.y,3*v.scale,1.5*v.scale);g.fill();
    }
    // Mark the actual impact radius, even in simple/reduced-motion mode.
    g.strokeColor=color('#fff0bc',220);g.lineWidth=1.5;g.circle(X(v.x),Y(v.y),v.radius);g.stroke();
  }

  private create(id:number):FlightSprite {
    const node=new Node(`Projectile ${id}`);node.layer=this.node.layer;
    const transform=node.addComponent(UITransform);const sprite=node.addComponent(Sprite);
    this.node.addChild(node);const value={node,sprite,transform};this.sprites.set(id,value);return value;
  }
}
