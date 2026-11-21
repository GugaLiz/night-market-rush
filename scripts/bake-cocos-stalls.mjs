/** Reproduce the legacy stall awning's Canvas filter as portable PNGs.
 * Requires project Playwright dependencies and a local Chromium browser. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(path.join(root,'public/assets/clay-order-stall.webp'));
const chrome=process.env.COCOS_AUDIO_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({headless:true,executablePath:chrome});
try {
  const page=await browser.newPage();
  const results=await page.evaluate(async(base64)=>{
    const image=new Image();image.src=`data:image/webp;base64,${base64}`;await image.decode();
    const styles={vortex:'hue-rotate(297deg) saturate(.73)',frost:'hue-rotate(158deg) saturate(.68)',
      brine:'hue-rotate(73deg) saturate(.69)',final:'hue-rotate(345deg)'};
    const output={};
    for(const [name,filter] of Object.entries(styles)){
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const c=canvas.getContext('2d');c.drawImage(image,0,0);c.save();c.scale(canvas.width,canvas.height);
      c.beginPath();c.moveTo(.096,.061);c.lineTo(.88,.037);c.lineTo(.862,.226);c.lineTo(.818,.266);
      c.lineTo(.80,.38);c.lineTo(.174,.391);c.lineTo(.094,.340);c.lineTo(.019,.288);c.lineTo(.018,.222);
      c.closePath();c.clip();c.filter=filter;c.drawImage(image,0,0,1,1);c.restore();
      output[name]=canvas.toDataURL('image/png').split(',')[1];
    }
    return output;
  },source.toString('base64'));
  for(const [name,base64] of Object.entries(results)){
    const file=path.join(root,'cocos/assets/resources/art',`stall-${name}.png`);
    await writeFile(file,Buffer.from(base64,'base64'));console.log(`Created ${path.relative(root,file)}`);
  }
} finally {await browser.close();}
