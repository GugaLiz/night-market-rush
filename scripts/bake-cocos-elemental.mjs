/** Bake the legacy Canvas-only wok and vapor artwork into portable Cocos PNGs. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const art=path.join(root,'cocos/assets/resources/art');
const inputs=await Promise.all(['clay-elemental-tools.png','clay-ultimate-fx.png'].map(name=>readFile(path.join(art,name))));
const chrome=process.env.COCOS_AUDIO_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({headless:true,executablePath:chrome});
try {
  const page=await browser.newPage();
  const output=await page.evaluate(async encoded=>{
    const load=async value=>{const image=new Image();image.src=`data:image/png;base64,${value}`;await image.decode();return image;};
    const [tools,ultimate]=await Promise.all(encoded.map(load));
    const make=(w,h)=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;};
    const oval=(ctx,x,y,rx,ry,fill)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();};
    const pan=make(236,137),brush=pan.getContext('2d');brush.drawImage(tools,10,59,236,137,0,0,236,137);
    const image=brush.getImageData(0,0,236,137),rgba=image.data;
    for(let i=0;i<rgba.length;i+=4){
      const r=rgba[i],g=rgba[i+1],b=rgba[i+2],t=Math.max(0,Math.min(1,(Math.min(r,b)-g-5)/35))*.82,light=.44*r+.30*g+.26*b;
      rgba[i]=r+(light*1.08+12-r)*t;rgba[i+1]=g+(light*.63+7-g)*t;rgba[i+2]=b+(light*.47+12-b)*t;
    }
    brush.putImageData(image,0,0);
    // Match drawVortexMouth: keep only the near iron wall over pulled enemies.
    const rim=make(236,137),rimBrush=rim.getContext('2d');rimBrush.translate(144,64);
    rimBrush.beginPath();rimBrush.moveTo(-89,-4);rimBrush.bezierCurveTo(-84,44,56,65,83,-3);
    rimBrush.lineTo(83,75);rimBrush.lineTo(-89,75);rimBrush.closePath();rimBrush.clip();rimBrush.drawImage(pan,-144,-64);
    const broth=make(128,128),soup=broth.getContext('2d');soup.drawImage(pan,83,26,122,76,0,0,128,128);
    const edge=soup.createRadialGradient(64,64,0,64,64,64);edge.addColorStop(0,'#000');edge.addColorStop(.82,'#000');edge.addColorStop(1,'#0000');
    soup.globalCompositeOperation='destination-in';soup.fillStyle=edge;soup.fillRect(0,0,128,128);
    const vapor=make(128,96),mist=vapor.getContext('2d');
    for(const [x,y,r] of [[25,64,25],[86,65,36],[58,54,38],[35,45,25],[66,34,22],[90,44,19],[105,59,20]]){
      const fill=mist.createRadialGradient(x-4,y-r*.3,0,x,y,r);fill.addColorStop(0,'#edffb8c4');fill.addColorStop(.38,'#bcea78a8');fill.addColorStop(.73,'#81bf6184');fill.addColorStop(1,'#54878600');
      oval(mist,x,y,r,r*.84,fill);
    }
    const tuft=make(128,96),clay=tuft.getContext('2d'),cell=ultimate.naturalWidth/2;
    clay.drawImage(ultimate,cell,0,cell,cell,-6,-20,140,130);clay.globalCompositeOperation='source-atop';clay.fillStyle='#88c741a8';clay.fillRect(0,0,128,96);
    mist.globalAlpha=.45;mist.drawImage(tuft,0,0);
    const pool=make(256,256),wash=pool.getContext('2d'),gradient=wash.createRadialGradient(128,128,0,128,128,128);
    gradient.addColorStop(0,'#344f332e');gradient.addColorStop(.48,'#50783345');gradient.addColorStop(.87,'#a8da624a');gradient.addColorStop(1,'#c9ee8400');
    oval(wash,128,128,128,128,gradient);
    return Object.fromEntries(Object.entries({'vortex-warm':pan,'vortex-broth':broth,'vortex-rim':rim,'brine-vapor':vapor,'brine-pool':pool}).map(([name,canvas])=>[name,canvas.toDataURL('image/png').split(',')[1]]));
  },inputs.map(input=>input.toString('base64')));
  for(const [name,base64] of Object.entries(output)){
    if(process.argv.includes('--rim-only')&&name!=='vortex-rim')continue;
    const file=path.join(art,`${name}.png`);await writeFile(file,Buffer.from(base64,'base64'));console.log(`Created ${path.relative(root,file)}`);
  }
} finally {await browser.close();}
