/** The host resolves permission/fallback first, then supplies its effective
 * movement mode and whether the primary pointer is touch-like. */
export function openingHint(mode:'joystick'|'tilt',coarsePointer:boolean):string {
  const movement=mode==='tilt'?'倾斜设备':coarsePointer?'拖动摇杆':'方向键 / WASD ';
  return `${movement}移动并瞄准，碰青色泡放技能，靠近金箱换武器`;
}
