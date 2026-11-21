/** Visual geometry shared by all lanes; distance remains simulation-owned. */
export interface ChopstickFlight {spread:number;size:number;length:number;crest:number;leaf:boolean}
export function chopstickFlight(distance:number,laneSeed:number,quiet:boolean):ChopstickFlight {
  const d=Math.max(0,distance),spread=Math.min(1,d/85),length=Math.min(d*.58,quiet?38:68);
  return {spread,size:.45+.55*spread,length,crest:quiet?2:Math.sin(d*.042+laneSeed*1.8)*5,leaf:!quiet&&length>44};
}
