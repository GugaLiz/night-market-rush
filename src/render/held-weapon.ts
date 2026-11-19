import type {Assets} from './assets';
import type {Vec} from '../shared/types';

type Blade = 'tongs' | 'knife' | 'sword';

// Grip and tip landmarks of the trimmed paintings establish a fixed scale.
const landmarks: Record<Blade, {grip: Vec; tip: Vec}> = {
  tongs: {grip:{x:.16,y:.83}, tip:{x:.78,y:.15}},
  knife: {grip:{x:.11,y:.76}, tip:{x:.98,y:.11}},
  sword: {grip:{x:.13,y:.63}, tip:{x:.97,y:.09}},
};

interface AlignedBlade {image: HTMLCanvasElement; grip: Vec; reach: number}

export class HeldBlades {
  private cache = new Map<Blade, AlignedBlade>();
  constructor(private assets: Assets) {}

  draw(ctx:CanvasRenderingContext2D, kind:Blade, wrist:Vec, angle:number, length:number, jaws:number):void {
    const {image,grip,reach}=this.cache.get(kind)??this.align(kind);
    const scale=length/reach;
    ctx.save();ctx.translate(wrist.x,wrist.y);ctx.rotate(angle);ctx.scale(scale,scale);
    if(kind==='tongs'&&jaws!==0){
      const hinge=Math.round(grip.x+reach*.33),split=Math.round(grip.y);
      ctx.drawImage(image,0,0,hinge,image.height,-grip.x,-grip.y,hinge,image.height);
      ctx.translate(hinge-grip.x,0);
      for(const upper of [true,false]){
        const y=upper?0:split,h=upper?split:image.height-split,w=image.width-hinge;
        ctx.save();ctx.rotate(upper?-jaws:jaws);
        ctx.drawImage(image,hinge,y,w,h,-.4,y-grip.y,w,h);ctx.restore();
      }
    }else ctx.drawImage(image,-grip.x,-grip.y);
    ctx.restore();
  }

  private align(kind:Blade):AlignedBlade {
    const src=this.assets.sprites[kind], marks=landmarks[kind];
    const grip={x:marks.grip.x*src.width,y:marks.grip.y*src.height};
    const dx=marks.tip.x*src.width-grip.x, dy=marks.tip.y*src.height-grip.y;
    const reach=Math.hypot(dx,dy), angle=Math.atan2(dy,dx);
    const cos=Math.cos(angle), sin=Math.sin(angle);
    const corners=[{x:0,y:0},{x:src.width,y:0},{x:0,y:src.height},{x:src.width,y:src.height}]
      .map(p=>({x:(p.x-grip.x)*cos+(p.y-grip.y)*sin,y:-(p.x-grip.x)*sin+(p.y-grip.y)*cos}));
    const minX=Math.floor(Math.min(...corners.map(p=>p.x)))-1,minY=Math.floor(Math.min(...corners.map(p=>p.y)))-1;
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(Math.max(...corners.map(p=>p.x)))-minX+1;
    canvas.height=Math.ceil(Math.max(...corners.map(p=>p.y)))-minY+1;
    const aligned=canvas.getContext('2d')!;
    aligned.translate(-minX,-minY);aligned.rotate(-angle);
    aligned.drawImage(src.image,src.x,src.y,src.width,src.height,-grip.x,-grip.y,src.width,src.height);
    const blade={image:canvas,grip:{x:-minX,y:-minY},reach};
    this.cache.set(kind,blade);
    return blade;
  }
}
