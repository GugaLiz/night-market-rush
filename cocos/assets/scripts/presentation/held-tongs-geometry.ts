/** Layout for the original painted tongs, in the web rig's Y-down local space. */
export interface TongsSegment {left:number;right:number;top:number;bottom:number;pivotX:number}
export interface TongsLayout {
  width:number;height:number;imageAngle:number;scale:number;hinge:number;
  segments:readonly [TongsSegment,TongsSegment,TongsSegment];
}
const GRIP={x:.16,y:.83},TIP={x:.78,y:.15};

/** Align the image's grip-to-tip axis before splitting its two jaws. */
export function layoutTongs(width:number,height:number,reach:number):TongsLayout {
  if(!(width>0&&height>0&&reach>0))throw new Error('Tongs dimensions and reach must be positive');
  const dx=(TIP.x-GRIP.x)*width,dy=(TIP.y-GRIP.y)*height;
  const sourceReach=Math.hypot(dx,dy),imageAngle=Math.atan2(dy,dx),factor=reach/sourceReach;
  const cos=Math.cos(imageAngle),sin=Math.sin(imageAngle),gx=GRIP.x*width,gy=GRIP.y*height;
  const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>({
    x:((x-gx)*cos+(y-gy)*sin)*factor,
    y:(-(x-gx)*sin+(y-gy)*cos)*factor,
  }));
  // Keep a small padding for linear filtering at the rotated image boundary.
  const pad=2*factor,minX=Math.min(...corners.map(p=>p.x))-pad,maxX=Math.max(...corners.map(p=>p.x))+pad;
  const minY=Math.min(...corners.map(p=>p.y))-pad,maxY=Math.max(...corners.map(p=>p.y))+pad;
  const hinge=reach*.33,overlap=.4*factor;
  return {width,height,imageAngle,scale:factor,hinge,segments:[
    {left:minX,right:hinge,top:minY,bottom:maxY,pivotX:0},
    {left:hinge-overlap,right:maxX,top:minY,bottom:0,pivotX:hinge},
    {left:hinge-overlap,right:maxX,top:0,bottom:maxY,pivotX:hinge},
  ]};
}

/** Match the original blade opening at windup and during its active sweep. */
export function tongsJawAngle(phase:'windup'|'active'|'recovery'|null,progress:number):number {
  const t=Math.max(0,Math.min(1,progress)),smooth=t*t*(3-2*t);
  return phase==='windup'?.045*smooth:phase==='active'?.04-.064*smooth:0;
}
