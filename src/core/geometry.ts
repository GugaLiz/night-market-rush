import type {Vec, Zone} from '../shared/types';

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const distanceSquared = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Position is measured at the rider's feet along the clipped strip of paper. */
export function isOnPaperRoute(point:Vec, route:Zone, time:number):boolean {
  if (route.kind !== 'route' || time < route.bornAt || time >= route.expiresAt || route.length <= 0) return false;
  const dx=point.x-route.x, dy=point.y-route.y;
  const cos=Math.cos(route.angle), sin=Math.sin(route.angle);
  const along=dx*cos+dy*sin, across=dy*cos-dx*sin;
  return along >= 0 && along <= route.length && Math.abs(across) <= route.width/2;
}

/** Earliest time of a swept circle touching a stationary point, or null. */
export function sweepContact(start: Vec, end: Vec, center: Vec, radius: number): number | null {
  const x = start.x - center.x, y = start.y - center.y;
  const dx = end.x - start.x, dy = end.y - start.y;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (x * dx + y * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function segmentDistanceSquared(start: Vec, end: Vec, point: Vec): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator < 1e-12 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator, 0, 1);
  return (start.x + dx * t - point.x) ** 2 + (start.y + dy * t - point.y) ** 2;
}

export function relativeSweep(a0: Vec, a1: Vec, b0: Vec, b1: Vec, radius: number): number | null {
  return sweepContact({x: a0.x - b0.x, y: a0.y - b0.y}, {x: a1.x - b1.x, y: a1.y - b1.y}, {x: 0, y: 0}, radius);
}

/** Squared separation of two finite segments, including crossing interiors. */
export function segmentSeparationSquared(a:Vec,b:Vec,c:Vec,d:Vec):number {
  const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,den=ux*vy-uy*vx;
  if(Math.abs(den)>1e-12){const wx=c.x-a.x,wy=c.y-a.y,t=(wx*vy-wy*vx)/den,s=(wx*uy-wy*ux)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
  return Math.min(segmentDistanceSquared(a,b,c),segmentDistanceSquared(a,b,d),segmentDistanceSquared(c,d,a),segmentDistanceSquared(c,d,b));
}
