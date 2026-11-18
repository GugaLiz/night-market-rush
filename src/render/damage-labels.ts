import {WORLD} from '../core/config';
import {clamp} from '../core/geometry';
import type {DamageSource,GameEvent,GameState} from '../shared/types';
import type {Assets,SpriteName} from './assets';
import {drawSprite} from './sprite';

type Hit={id:number;amount:number;source:DamageSource|null;time:number;bornAt:number;expires:number;hidden:boolean};
type Group={id:number;x:number;y:number;anchorX:number;anchorY:number;offsetX:number;offsetY:number;nextLayout:number;lastHit:number;deathAt:number|null;hits:Hit[]};
export interface DamageLabelRow {amount:number;count:number;source:DamageSource|null;alpha:number;folded:boolean;ids:number[];age:number;scale:number;fontSize:number}
export interface DamageLabelGroup {victimId:number;x:number;y:number;anchorX:number;anchorY:number;player:boolean;heal:boolean;rows:DamageLabelRow[]}
type Rect={x:number;y:number;w:number;h:number};
export const DAMAGE_LABEL_LAYOUT={ttl:1.05,deathTtl:.5,rowHeight:30,width:100,maxRows:5,budget:30,maxFontSize:28,minFontSize:14} as const;
const {ttl:TTL,deathTtl:DEATH_TTL,rowHeight:ROW_HEIGHT,width:WIDTH}=DAMAGE_LABEL_LAYOUT;
const crowds=(a:Rect,b:Rect)=>a.x<b.x+b.w+8&&a.x+a.w+8>b.x&&a.y<b.y+b.h+8&&a.y+a.h+8>b.y;

/** Bounded visual history. A hit's own expiry is never refreshed by subsequent hits. */
export class DamageLabels {
  private clock=0;
  private groups=new Map<number,Group>();
  private seen=new Map<number,number>();
  private playerDamage:Hit|null=null;
  private playerHeal:Hit|null=null;
  private visible:DamageLabelGroup[]=[];

  reset():void{this.clock=0;this.groups.clear();this.seen.clear();this.playerDamage=null;this.playerHeal=null;this.visible=[];}

  add(event:GameEvent):void {
    if(event.type==='kill'){
      if(event.victimId!==undefined){const group=this.groups.get(event.victimId);if(group&&group.deathAt===null)group.deathAt=this.clock;}
      return;
    }
    if(event.type!=='damage'&&event.type!=='heal')return;
    if(!Number.isFinite(event.amount)||event.amount<=0||this.seen.has(event.id))return;
    this.seen.set(event.id,this.clock+TTL+DEATH_TTL);
    const hit:Hit={id:event.id,amount:event.amount,source:event.type==='damage'?event.source:null,time:event.type==='damage'?event.time:this.clock,bornAt:this.clock,expires:this.clock+TTL,hidden:false};
    if(event.type==='heal'){this.playerHeal=hit;return;}
    if(event.victimId===0){this.playerDamage=hit;return;}
    let group=this.groups.get(event.victimId);
    if(!group){
      group={id:event.victimId,x:event.x,y:event.y-80,anchorX:event.x,anchorY:event.y-80,offsetX:0,offsetY:0,nextLayout:0,lastHit:this.clock,deathAt:null,hits:[]};
      this.groups.set(group.id,group);
    }
    if(group.deathAt!==null)return;
    group.hits.push(hit);group.hits.sort((a,b)=>a.time-b.time||a.id-b.id);group.lastHit=this.clock;
  }

  /** dt is visual elapsed time: callers pass 0 while paused. */
  update(dt:number,state:GameState):void {
    this.clock+=Math.max(0,Number.isFinite(dt)?dt:0);
    for(const [id,until] of this.seen)if(until<=this.clock)this.seen.delete(id);
    const enemies=new Map(state.enemies.map(e=>[e.id,e]));
    for(const [id,group] of this.groups){
      group.hits=group.hits.filter(h=>h.expires>this.clock);
      if(!group.hits.length||(group.deathAt!==null&&this.clock-group.deathAt>=DEATH_TTL)){this.groups.delete(id);continue;}
      const enemy=enemies.get(id);
      if(enemy&&group.deathAt===null){
        const height=enemy.kind==='bowl'?83:enemy.kind==='box'?69:58;
        group.anchorX=enemy.x;group.anchorY=enemy.y-height-9;
      }else if(group.deathAt===null)group.deathAt=this.clock;
    }
    if(this.playerDamage&&this.playerDamage.expires<=this.clock)this.playerDamage=null;
    if(this.playerHeal&&this.playerHeal.expires<=this.clock)this.playerHeal=null;
    this.visible=[];
    const p=state.player;
    const top=84,bottom=Math.min(WORLD.bounds.bottom,WORLD.height-110);
    const left=16+WIDTH/2,right=WORLD.width-16-WIDTH/2;
    const playerGroups:DamageLabelGroup[]=[];
    const occupied:Rect[]=[];
    // Reserve both player slots before allocating enemy labels, including at screen corners.
    for(const [hit,heal] of [[this.playerDamage,false],[this.playerHeal,true]] as const)if(hit){
      const x=clamp(p.x+(heal?-95:95),left,right);
      let y=clamp(p.y-112+(heal?ROW_HEIGHT+8:0),top,bottom-ROW_HEIGHT);
      if(occupied.some(r=>crowds({x:x-WIDTH/2,y,w:WIDTH,h:ROW_HEIGHT},r))){
        const candidates=[...occupied.map(r=>r.y+r.h+8),...occupied.map(r=>r.y-ROW_HEIGHT-8)];
        const free=candidates.find(candidate=>candidate>=top&&candidate+ROW_HEIGHT<=bottom&&!occupied.some(r=>crowds({x:x-WIDTH/2,y:candidate,w:WIDTH,h:ROW_HEIGHT},r)));
        if(free!==undefined)y=free;
      }
      occupied.push({x:x-WIDTH/2,y,w:WIDTH,h:ROW_HEIGHT});
      playerGroups.push({victimId:0,x,y,anchorX:p.x,anchorY:p.y-96,player:true,heal,rows:this.rows([hit],null)});
    }
    const protectedAreas:Rect[]=[{x:p.x-39,y:p.y-122,w:78,h:130}];
    for(const e of state.enemies)if(e.phase==='warn'||e.phase==='dash'){
      const endX=e.x+e.dashX*150,endY=e.y+e.dashY*150;
      protectedAreas.push({x:Math.min(e.x,endX)-18,y:Math.min(e.y,endY)-18,w:Math.abs(endX-e.x)+36,h:Math.abs(endY-e.y)+36});
    }
    const groups=[...this.groups.values()].sort((a,b)=>{
      const distance=(g:Group)=>(g.anchorX-p.x)**2+(g.anchorY+70-p.y)**2;
      return Number(b.id===state.weapon.targetId)-Number(a.id===state.weapon.targetId)||distance(a)-distance(b)||b.lastHit-a.lastHit||a.id-b.id;
    });
    let budget:number=DAMAGE_LABEL_LAYOUT.budget;
    for(const group of groups){
      const hits=group.hits.filter(h=>!h.hidden);if(!hits.length)continue;
      const rows=this.rows(hits,group.deathAt);
      if(rows.length>budget){for(const h of hits)h.hidden=true;continue;}
      const h=rows.length*ROW_HEIGHT;
      const rectangle=(ox:number,oy:number):Rect=>({x:clamp(group.anchorX+ox,left,right)-WIDTH/2,y:clamp(group.anchorY-h+oy,top,Math.max(top,bottom-h)),w:WIDTH,h});
      const free=(r:Rect)=>!protectedAreas.some(p=>crowds(r,p))&&!occupied.some(p=>crowds(r,p));
      // Movement and newly reserved player slots can invalidate the 0.2-second lock.
      // Reflow immediately in that case; stability must never force text overlap.
      if(this.clock>=group.nextLayout||!free(rectangle(group.offsetX,group.offsetY))){
        const horizontal=WIDTH+8,vertical=h+8;
        const offsets=[[group.offsetX,group.offsetY],[0,0],[-horizontal,0],[horizontal,0],[0,-vertical],[-horizontal,-vertical],[horizontal,-vertical],[0,vertical],[-horizontal,vertical],[horizontal,vertical]];
        let best:number[]|undefined;
        for(const offset of offsets){
          if(free(rectangle(offset[0],offset[1]))){best=offset;break;}
        }
        // Never choose a least-bad collision or replay these hits later as space opens.
        if(!best){for(const hit of hits)hit.hidden=true;continue;}
        group.offsetX=best[0];group.offsetY=best[1];group.nextLayout=this.clock+.2;
      }
      budget-=rows.length;
      const rect=rectangle(group.offsetX,group.offsetY);group.x=rect.x+WIDTH/2;group.y=rect.y;
      occupied.push(rect);this.visible.push({victimId:group.id,x:group.x,y:group.y,anchorX:group.anchorX,anchorY:group.anchorY,player:false,heal:false,rows});
    }
    this.visible.push(...playerGroups);
  }

  private rows(hits:Hit[],deathAt:number|null):DamageLabelRow[]{
    const bundles=hits.length<=DAMAGE_LABEL_LAYOUT.maxRows?hits.map(h=>[h]):[hits.slice(0,-4),...hits.slice(-4).map(h=>[h])];
    return bundles.map(bundle=>{
      const source=bundle.every(h=>h.source===bundle[0].source)?bundle[0].source:null;
      const newest=bundle[bundle.length-1];
      const age=Math.max(0,this.clock-newest.bornAt),scale=1-.5*clamp(age/TTL,0,1);
      const fade=clamp((newest.expires-this.clock)/.25,0,1)*(deathAt===null?1:clamp(1-(this.clock-deathAt)/DEATH_TTL,0,1));
      return {amount:bundle.reduce((sum,h)=>sum+h.amount,0),count:bundle.length,source,alpha:fade,folded:bundle.length>1,ids:bundle.map(h=>h.id),age,scale,fontSize:DAMAGE_LABEL_LAYOUT.maxFontSize*scale};
    });
  }

  /** Copy suitable for render verification, diagnostics and tests. */
  snapshot():DamageLabelGroup[]{return this.visible.map(g=>({...g,rows:g.rows.map(r=>({...r,ids:[...r.ids]}))}));}

  draw(ctx:CanvasRenderingContext2D,assets:Assets,_state:GameState,reduceMotion=false):void {
    ctx.save();ctx.textBaseline='middle';ctx.textAlign='left';
    for(const group of this.visible){
      if(!group.player&&Math.abs(group.x-group.anchorX)>30){
        ctx.globalAlpha=.3*(group.rows.at(-1)?.alpha??1);ctx.strokeStyle='#fff0c9';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(group.x,group.y+group.rows.length*ROW_HEIGHT);ctx.lineTo(group.anchorX,group.anchorY+4);ctx.stroke();
      }
      group.rows.forEach((row,index)=>{
        const x=group.x-WIDTH/2,y=group.y+index*ROW_HEIGHT;
        ctx.save();ctx.beginPath();ctx.rect(x,y,WIDTH,ROW_HEIGHT);ctx.clip();
        const cy=y+ROW_HEIGHT/2;
        ctx.globalAlpha=row.alpha;ctx.fillStyle=group.player?(group.heal?'#153f3255':'#581c2a55'):'#28283124';
        ctx.beginPath();ctx.roundRect(x,y+1,WIDTH,ROW_HEIGHT-2,5);ctx.fill();
        const source=row.source==='dash'?'box':row.source;
        if(source&&source in assets.sprites){const sprite=assets.sprites[source],height=Math.min(18,18*sprite.height/sprite.width);drawSprite(ctx,assets,source as SpriteName,x+12,cy+height/2,height,0,1,1);}
        else {ctx.fillStyle=group.heal?'#91ffc2':'#d6cabc';ctx.font='bold 11px "Microsoft YaHei",sans-serif';ctx.fillText(group.heal?'+':row.folded?'叠':'伤',x+5,cy);}
        ctx.fillStyle=group.player?(group.heal?'#9fffc8':'#ffbdc6'):index===group.rows.length-1?'#fff6d6':'#eddfbc';
        const fontSize=reduceMotion?22:row.fontSize;
        ctx.font=`900 ${row.folded?Math.min(16,fontSize):fontSize}px "Microsoft YaHei",sans-serif`;
        const amount=Number.isInteger(row.amount)?String(row.amount):row.amount.toFixed(1);
        const text=row.folded?`${amount} · ${row.count}击`:`${group.heal?'+':group.player?'−':''}${amount}`;
        ctx.strokeStyle='#362720';ctx.lineWidth=2.5;ctx.strokeText(text,x+25,cy,WIDTH-28);ctx.fillText(text,x+25,cy,WIDTH-28);ctx.restore();
      });
    }
    ctx.restore();
  }
}
