import type {Assets} from './assets';
export function drawSprite(c:CanvasRenderingContext2D,assets:Assets,name:string,x:number,y:number,height:number,angle=0,flip=1,anchorY=1,width?:number):void {
  const s=assets.sprites[name]; if(!s)return;
  const w=width??height*s.width/s.height;
  c.save();c.translate(x,y);c.rotate(angle);c.scale(flip<0?-1:1,1);
  c.drawImage(s.image,s.x,s.y,s.width,s.height,-w/2,-height*anchorY,w,height);c.restore();
}
