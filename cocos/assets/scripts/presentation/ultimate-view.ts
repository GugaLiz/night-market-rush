import {Color, Graphics, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform, UIOpacity} from 'cc';
import {WORLD} from '../domain/core/config';
import {EXPRESS, expressSealRadius, WAVES, waveRadius} from '../domain/core/ultimates';
import type {ExpressCast, GameState, Settings, Vec, WaveCast} from '../domain/shared/types';
import {SpriteAtlas} from './sprite-atlas';

const tau=Math.PI*2;
const unit=(n:number)=>Math.max(0,Math.min(1,n));
const X=(x:number)=>x-WORLD.width/2;
const Y=(y:number)=>WORLD.height/2-y;
const color=(hex:string,alpha=255)=>{const c=new Color().fromHEX(hex);c.a=Math.round(255*unit(alpha/255));return c;};
const palettes={icebox:['#71deff','#e6fdff','#347eae'],steamer:['#ffd197','#fff4d3','#ad734b'],berry:['#fa538e','#ffe6d9','#971858']} as const;

interface Stamp {node:Node;transform:UITransform;sprite:Sprite;opacity:UIOpacity}

/**
 * Migration-stage ultimate presentation. GameState is authoritative; use a
 * render-only interpolated snapshot when available. Children use the same
 * centred, Y-up 1280x720 world as the other presentation layers. Place ground
 * behind actors and air above them. The caller owns the source texture/atlas;
 * this object owns its generated SpriteFrames and pooled nodes.
 *
 * `effectsTexture` is the original clay-ultimate-fx.webp 2x4 grid. This is
 * deliberately separate from SpriteAtlas because it is not a character atlas.
 */
export class UltimateView {
  readonly groundNode:Node;
  readonly airNode:Node;
  private readonly ground:Graphics;
  private readonly air:Graphics;
  private readonly groundStamps:Stamp[]=[];
  private readonly airStamps:Stamp[]=[];
  private readonly frames:SpriteFrame[]=[];
  private groundUsed=0;
  private airUsed=0;
  get hasEffectsTexture():boolean {return this.frames.length===8;}

  constructor(groundParent:Node,airParent:Node,private readonly atlas:SpriteAtlas,effectsTexture:Texture2D|null){
    this.groundNode=this.node('UltimateGround',groundParent);this.ground=this.node('UltimateGroundGraphics',this.groundNode).addComponent(Graphics);
    this.airNode=this.node('UltimateAir',airParent);this.air=this.node('UltimateAirGraphics',this.airNode).addComponent(Graphics);
    try {if(effectsTexture)this.setEffectsTexture(effectsTexture);}
    catch(error){this.groundNode.destroy();this.airNode.destroy();throw error;}
  }

  /** Attach optional artwork after battle is ready; the simulation never depends on it. */
  setEffectsTexture(effectsTexture:Texture2D):void {
    if(this.frames.length)return;
    const cell=effectsTexture.width/2;
    if(!Number.isInteger(cell)||cell<=0||effectsTexture.height!==cell*4)throw new Error('Ultimate effects texture must be a 2x4 square-cell atlas');
    try {
      for(let i=0;i<8;i++){
        const frame=new SpriteFrame();this.frames.push(frame);frame.texture=effectsTexture;
        frame.rect=new Rect((i%2)*cell,Math.floor(i/2)*cell,cell,cell);
        frame.originalSize=new Size(cell,cell);frame.packable=false;
      }
    } catch(error) {
      for(const frame of this.frames)frame.destroy();this.frames.length=0;throw error;
    }
  }

  update(state:GameState,settings:Pick<Settings,'reduceMotion'|'quality'>,visibleWidth:number=WORLD.width,visibleHeight:number=WORLD.height):void {
    this.ground.clear();this.air.clear();this.groundUsed=0;this.airUsed=0;
    const quiet=settings.reduceMotion||settings.quality==='simple';
    for(const cast of state.ultimates??[]){
      if(cast.kind==='express'){this.expressGround(cast,state.time,quiet);this.expressAir(cast,state.time,settings.reduceMotion);}
      else {
        this.waveGround(cast,state.time,quiet);
        if(cast.kind==='berry'){
          this.berryJets(cast,state.time,quiet);
          if(!settings.reduceMotion)this.berryEdges(cast,state.time,visibleWidth,visibleHeight);
        }
        this.castTool(cast,state,settings.reduceMotion);
      }
    }
    this.hideUnused(this.groundStamps,this.groundUsed);this.hideUnused(this.airStamps,this.airUsed);
  }

  reset():void {this.ground.clear();this.air.clear();this.hideUnused(this.groundStamps,0);this.hideUnused(this.airStamps,0);}
  destroy():void {this.groundNode.destroy();this.airNode.destroy();for(const f of this.frames)f.destroy();this.frames.length=0;}

  private node(name:string,parent:Node):Node {const n=new Node(name);n.layer=parent.layer;n.addComponent(UITransform);parent.addChild(n);return n;}
  private hideUnused(pool:Stamp[],used:number):void {for(let i=used;i<pool.length;i++)pool[i].node.active=false;}
  private stamp(ground:boolean,frame:SpriteFrame,x:number,y:number,w:number,h:number,angle=0,alpha=1,flip=1):void {
    const pool=ground?this.groundStamps:this.airStamps,index=ground?this.groundUsed++:this.airUsed++;
    let item=pool[index];
    if(!item){
      const n=this.node('UltimateSprite',ground?this.groundNode:this.airNode);
      const transform=n.getComponent(UITransform)!,sprite=n.addComponent(Sprite),opacity=n.addComponent(UIOpacity);
      sprite.sizeMode=Sprite.SizeMode.CUSTOM;item={node:n,transform,sprite,opacity};pool.push(item);
    }
    item.node.active=true;item.sprite.spriteFrame=frame;item.transform.setContentSize(w,h);
    item.node.setPosition(X(x),Y(y));item.node.setScale(flip,1,1);item.node.angle=-angle*180/Math.PI;item.opacity.opacity=Math.round(255*unit(alpha));
  }
  private fx(ground:boolean,index:number,x:number,y:number,w:number,h:number,angle=0,alpha=1):void {
    const frame=this.frames[index];
    if(frame){this.stamp(ground,frame,x,y,w,h,angle,alpha);return;}
    // The rings, bands and cast tools still show the hit area while artwork downloads.
    const g=ground?this.ground:this.air;
    const fallback=['#9aeaff','#ffcf98','#a6f3d0','#fa84af','#a6f2ff','#ffd197','#f97eab','#ffbed1'];
    g.fillColor=color(fallback[index]??'#fff4d3',Math.round(100*unit(alpha)));
    g.ellipse(X(x),Y(y),Math.max(1,w*.30),Math.max(1,h*.30));g.fill();
  }
  private sprite(name:string,x:number,y:number,height:number,angle=0,alpha=1,flip=1):void {
    const frame=this.atlas.require(name);this.stamp(false,frame,x,y,height*frame.rect.width/frame.rect.height,height,angle,alpha,flip);
  }
  private arc(g:Graphics,x:number,y:number,r:number,start:number,end:number):void {
    const n=Math.max(8,Math.ceil(Math.abs(end-start)*16));
    for(let i=0;i<=n;i++){const a=start+(end-start)*i/n,px=X(x+Math.cos(a)*r),py=Y(y+Math.sin(a)*r);if(!i)g.moveTo(px,py);else g.lineTo(px,py);}
  }
  private ring(g:Graphics,x:number,y:number,r:number,hex:string,width:number,alpha=1,start=0,end=tau):void {
    if(!(r>0)||alpha<=0)return;g.strokeColor=color(hex,255*alpha);g.lineWidth=width;this.arc(g,x,y,r,start,end);g.stroke();
  }
  private band(g:Graphics,x:number,y:number,inner:number,outer:number,start:number,end:number,hex:string,alpha:number):void {
    if(!(outer>0)||alpha<=0)return;this.arc(g,x,y,outer,start,end);
    const n=Math.max(8,Math.ceil(Math.abs(end-start)*16));
    for(let i=n;i>=0;i--){const a=start+(end-start)*i/n;g.lineTo(X(x+Math.cos(a)*inner),Y(y+Math.sin(a)*inner));}
    g.close();g.fillColor=color(hex,255*alpha);g.fill();
  }

  private waveGround(cast:WaveCast,time:number,quiet:boolean):void {
    const tune=WAVES[cast.kind],age=time-cast.bornAt-tune.windup,g=this.ground;
    const [edge,light,shadow]=palettes[cast.kind],ice=cast.kind==='icebox',berry=cast.kind==='berry';
    if(age<0){
      const grip=unit(1+age/tune.windup);
      if(ice)this.ring(g,cast.x,cast.y,40+grip*40,'#a6f2ff',2,.38+.35*grip,cast.angle-Math.PI*.45,cast.angle+Math.PI*.45);
      else if(!berry)this.ring(g,cast.x,cast.y,28+12*grip,'#ffc987',2,.38+.35*grip);
      else for(let i=0;i<8;i++){
        const a=i*tau/8,r=16+(1-grip)*53;g.fillColor=color('#ec7191',180);
        g.circle(X(cast.x+Math.cos(a)*r),Y(cast.y+Math.sin(a)*r*.6-15),2+i%3);g.fill();
      }
      return;
    }
    const radius=waveRadius(cast,time),fade=unit((tune.travel+tune.fade-age)/tune.fade);
    if(radius<1||fade<=0)return;
    const start=ice?cast.angle-Math.PI/2:0,span=ice?Math.PI:tau,width=Math.min(radius,berry?135:ice?110:85);
    this.band(g,cast.x,cast.y,Math.max(0,radius-width),radius,start,start+span,edge,(berry?.24:.16)*fade);
    this.ring(g,cast.x,cast.y,radius,shadow,ice?5:berry?9:7,.63*fade,start,start+span);
    this.ring(g,cast.x,cast.y,radius,light,ice?2.2:3,fade,start,start+span);
    if(ice){
      // Half-disc artwork is oriented along the same locked heading as the hit front.
      this.fx(true,4,cast.x+Math.cos(cast.angle)*radius*.48,cast.y+Math.sin(cast.angle)*radius*.48,
        radius*.94,radius*.91,cast.angle,.90*fade);
    }else if(!berry){
      if(!quiet)this.fx(true,5,cast.x,cast.y,radius*2.14,radius*2.13,.06,.30*fade);
      this.fx(true,5,cast.x,cast.y-7,radius*2.03,radius*2,-.03,.84*fade);
    }
    const spacing=(ice?110:berry?130:146)*(quiet?1.75:1),count=Math.max(5,Math.min(36,Math.ceil(span*cast.reach/spacing)));
    const gap=span*radius/count;
    for(let i=0;i<count;i++){
      if((gap<30&&i%4!==0)||(gap<55&&i%2!==0))continue;
      const a=start+span*(i+.5)/count,dx=Math.cos(a),dy=Math.sin(a),bend=(1+Math.sin(a*7+cast.bornAt))*(berry?8:ice?5:4);
      const x=cast.x+(radius-bend)*dx,y=cast.y+(radius-bend)*dy;
      if(x< -96||y< -96||x>WORLD.width+96||y>WORLD.height+96)continue;
      const pulse=(1+Math.sin(a*9+cast.bornAt))*.5,size=(ice?36:berry?46:42)+pulse*(ice?42:22);
      if(!berry)this.fx(true,ice?0:1,x,y-size*.18,size*(ice?1:1.21),size*(.85+pulse*.21),ice?a+.32:dy*.36+Math.sin(i*3)*.14,fade*(ice?.73:.40));
      else {const r=4+pulse*3;g.fillColor=color(edge,255*fade);g.circle(X(x),Y(y),r);g.fill();g.strokeColor=color(shadow,255*fade);g.lineWidth=1.7;g.stroke();
        if(!quiet)this.fx(true,7,x-dx*16,y-dy*16,17+pulse*14,16+pulse*10,a,fade*.7);}
    }
  }

  private berryJets(cast:WaveCast,time:number,quiet:boolean):void {
    const age=time-cast.bornAt-WAVES.berry.windup;if(age<0)return;
    const t=unit(age/.32),alpha=unit((.53-age)/.25);if(!alpha)return;
    const count=quiet?5:9;
    for(let i=0;i<count;i++){
      const a=(i+.31*Math.sin(i*6.1+.9))*tau/count+cast.angle*.12,weight=(1+Math.sin(i*8.2+.4))*.5;
      const length=(190+240*weight)*(1-(1-t)**1.6),x=Math.cos(a)*length,y=Math.sin(a)*length*.88;
      this.fx(true,3,cast.x+x*.72,cast.y-12+y*.72,length*.70,length*(.24+.12*weight),a+.30,alpha);
      if(i%3===1)this.fx(true,7,cast.x+x,cast.y-26+y,35+weight*24,32+weight*21,a*.44,alpha);
    }
    const width=(470-50*t)*(1-(1-t)**1.85);this.fx(true,6,cast.x,cast.y-12-width*.73*.30,width,width*.73,0,alpha);
  }

  private berryEdges(cast:WaveCast,time:number,width:number,height:number):void {
    const age=time-cast.bornAt-WAVES.berry.windup;if(age<.04||age>.43||width<=0||height<=0)return;
    const t=unit((age-.04)/.19),alpha=unit((.43-age)/.18)*t;
    for(let i=0;i<4;i++){
      const x=WORLD.width/2+(i%2===0?-width/2-6:width/2+6);
      const y=WORLD.height/2+(i<2?-height/2+16:height/2-8),r=(31+i*4)*(1+t);
      this.air.fillColor=color('#b32063',alpha*125);this.air.circle(X(x),Y(y),r);this.air.fill();
      this.ring(this.air,x,y,r*.89,'#ffb7c5',2.8,alpha);
    }
  }

  private expressGround(cast:ExpressCast,time:number,quiet:boolean):void {
    const completed=cast.landings.length-1;if(completed<0)return;
    const release=cast.bornAt+EXPRESS.windup,latest=completed+(cast.onLeg?1:0),g=this.ground;
    for(let leg=Math.max(1,latest-1);leg<=latest;leg++){
      const from=cast.landings[leg-1],end=cast.landings[leg]??cast;if(!from)continue;
      const dx=end.x-from.x,dy=end.y-from.y,distance=Math.hypot(dx,dy),fade=unit(1-Math.max(0,time-release-leg*EXPRESS.leg)/EXPRESS.fade);
      if(distance<2||fade===0)continue;
      const length=Math.min(distance,quiet?210:315),ux=dx/distance,uy=dy/distance;
      if(cast.onLeg&&leg===latest){
        g.strokeColor=color('#9cf9d8',fade*50);g.lineWidth=EXPRESS.radius*2;
        g.moveTo(X(end.x-ux*length*.5),Y(end.y-uy*length*.5));g.lineTo(X(end.x),Y(end.y));g.stroke();
      }
      g.strokeColor=color('#54dcbb',fade*145);g.lineWidth=26;g.moveTo(X(end.x-ux*length),Y(end.y-uy*length));g.lineTo(X(end.x),Y(end.y));g.stroke();
      g.strokeColor=color('#c9ffe4',fade*215);g.lineWidth=4;g.moveTo(X(end.x-ux*length*.27),Y(end.y-uy*length*.27));g.lineTo(X(end.x),Y(end.y));g.stroke();
      if(cast.onLeg&&leg===latest){const a=Math.atan2(dy,dx);this.ring(g,end.x,end.y,EXPRESS.radius,'#e0ffe4',2.6,fade,a-1.38,a+1.38);}
    }
    if(cast.onLeg&&latest%EXPRESS.legsPerOrder===0){
      const approach=unit(((time-cast.legStart)/EXPRESS.leg-.45)/.55);
      this.ring(g,cast.target.x,cast.target.y,expressSealRadius(latest),latest===EXPRESS.legs?'#ffd48d':'#a6f3d0',3,.5*approach);
    }
    for(let i=Math.max(0,completed-1);i<=completed;i++){
      const age=Math.max(0,time-release-i*EXPRESS.leg),final=i===EXPRESS.legs,fade=unit(1-age/(final?EXPRESS.fade:.55));
      if(fade===0)continue;
      const mark=cast.landings[i],order=i>0&&i%EXPRESS.legsPerOrder===0,r=order?expressSealRadius(i):33,size=final?132:order?100:54;
      this.ring(g,mark.x,mark.y,r,final?'#ffd48d':order?'#d7ffbf':'#8af4ca',final?5:3,fade*.87);
      if(order)this.ring(g,mark.x,mark.y,r-6,final?'#ba6140':'#329c87',10,fade*(.74-.34*unit(age/.16)));
      this.fx(true,2,mark.x,mark.y,size,size*.76,i%2?.24:-.18,fade*.87);
    }
  }

  private expressAir(cast:ExpressCast,time:number,reduced:boolean):void {
    if(!cast.landings.length||cast.landings.length>EXPRESS.legs)return;
    const progress=unit((time-cast.legStart)/EXPRESS.leg),arc=Math.sin(progress*Math.PI);
    const start=cast.landings[cast.landings.length-(cast.onLeg?1:2)];if(!start)return;
    const side=cast.target.x>=start.x?1:-1,lift=arc*(reduced?11:45),top=cast.y-lift-4;
    this.air.fillColor=color('#4f4238',92);this.air.ellipse(X(cast.x),Y(cast.y),22-5*arc,6-arc);this.air.fill();
    this.sprite('rigBagSide',cast.x,top-24,48,side*.14*arc,1,side);
    this.sprite('express',cast.x-side*19,top-24,26,-side*(.2+arc*.16),1,side);
  }

  private castTool(cast:WaveCast,state:GameState,reduced:boolean):void {
    const tune=WAVES[cast.kind],age=state.time-cast.bornAt,after=age-tune.windup;
    if(age<0||after>.49)return;
    const load=unit(age/tune.windup),fade=unit((.49-after)/.19)*unit((age-.09)/.06);
    const heading=cast.kind==='icebox'?cast.angle:Math.atan2(state.player.moveDirection.y,state.player.moveDirection.x);
    const ground:Vec=cast.kind==='icebox'?{x:cast.x+Math.cos(heading)*26,y:cast.y+Math.sin(heading)*16}:cast;
    const anticipation=reduced?0:Math.sin(load*Math.PI)*.14,size=cast.kind==='steamer'?73:57;
    this.sprite(cast.kind,ground.x,ground.y-17,size*(1+anticipation),anticipation,fade);
    if(after>0&&cast.kind!=='icebox'){
      const release=unit(after/.40),jump=reduced?0:Math.sin(release*Math.PI),x=ground.x+22+release*28,y=ground.y-45-jump*65;
      this.air.fillColor=color(cast.kind==='steamer'?'#ad793e':'#b67b32',fade*255);
      this.air.strokeColor=color('#563b2d',fade*255);this.air.lineWidth=2;const r=cast.kind==='steamer'?22:11;
      this.air.ellipse(X(x),Y(y),r,r*.58);this.air.fill();this.air.stroke();
    }
  }
}
