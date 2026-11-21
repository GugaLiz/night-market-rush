import {Color, EventMouse, EventTouch, Graphics, Node, UITransform, Vec3} from 'cc';

export interface JoystickSettings {hand:'left'|'right';joystickSize:'small'|'medium'|'large'}
export interface JoystickVector {x:number;y:number}
const RADII={small:32,medium:42,large:54} as const;
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));

/** Touch and mouse input surface. Creator dispatches a simulated touch for a
 * mouse press, so the mouse handlers only validate/cancel it, never start a
 * second joystick. Parent supplies keyboard, sensor and interruption
 * handling. Place this full-screen node beneath HUD controls in draw/hit order;
 * an active modal must block touches and call clear(). Coordinates are in the
 * 1280x720 design space; vectors use the existing simulation's Y-down axis. */
export class TouchJoystick {
  readonly node:Node;
  private readonly transform:UITransform;
  private readonly ring:Node;
  private readonly knob:Node;
  private settings:JoystickSettings={hand:'left',joystickSize:'medium'};
  private enabled=false;
  private touchId:number|null=null;
  private mouseActive=false;
  private origin={x:0,y:0};
  private value:JoystickVector={x:0,y:0};

  constructor(parent:Node,private readonly onChange?:(vector:JoystickVector)=>void) {
    this.node=new Node('Joystick input');this.node.layer=parent.layer;
    this.transform=this.node.addComponent(UITransform);this.transform.setContentSize(1280,720);parent.addChild(this.node);
    this.ring=this.makeCircle('Joystick ring',42,new Color(255,230,190,45),new Color(249,226,192,180));
    this.knob=this.makeCircle('Joystick knob',19,new Color(240,201,151,220),new Color(255,240,215,255));
    this.ring.active=false;this.knob.active=false;
    this.node.on(Node.EventType.TOUCH_START,this.start,this);
    this.node.on(Node.EventType.TOUCH_MOVE,this.move,this);
    this.node.on(Node.EventType.TOUCH_END,this.end,this);
    this.node.on(Node.EventType.TOUCH_CANCEL,this.end,this);
    this.node.on(Node.EventType.MOUSE_DOWN,this.mouseDown,this);
    this.node.on(Node.EventType.MOUSE_MOVE,this.mouseMove,this);
    this.node.on(Node.EventType.MOUSE_UP,this.mouseUp,this);
    this.node.on(Node.EventType.MOUSE_LEAVE,this.mouseLeave,this);
  }
  setSettings(value:JoystickSettings):void {this.settings={...value};this.clear();}
  setEnabled(enabled:boolean):void {this.enabled=enabled;this.node.active=enabled;this.clear();}
  getVector():JoystickVector {return {...this.value};}
  clear():void {
    this.touchId=null;this.mouseActive=false;this.value={x:0,y:0};this.ring.active=false;this.knob.active=false;this.onChange?.({...this.value});
  }
  destroy():void {
    this.clear();this.node.off(Node.EventType.TOUCH_START,this.start,this);this.node.off(Node.EventType.TOUCH_MOVE,this.move,this);
    this.node.off(Node.EventType.TOUCH_END,this.end,this);this.node.off(Node.EventType.TOUCH_CANCEL,this.end,this);
    this.node.off(Node.EventType.MOUSE_DOWN,this.mouseDown,this);this.node.off(Node.EventType.MOUSE_MOVE,this.mouseMove,this);
    this.node.off(Node.EventType.MOUSE_UP,this.mouseUp,this);this.node.off(Node.EventType.MOUSE_LEAVE,this.mouseLeave,this);this.node.destroy();
  }
  private makeCircle(name:string,radius:number,fill:Color,stroke:Color):Node {
    const node=new Node(name);node.layer=this.node.layer;node.addComponent(UITransform).setContentSize(radius*2,radius*2);
    const g=node.addComponent(Graphics);g.fillColor=fill;g.strokeColor=stroke;g.lineWidth=3;g.circle(0,0,radius);g.fill();g.stroke();
    this.node.addChild(node);return node;
  }
  private point(event:EventTouch|EventMouse):JoystickVector {
    const p=event.getUILocation();const local=this.transform.convertToNodeSpaceAR(new Vec3(p.x,p.y,0));return {x:local.x,y:local.y};
  }
  private start(event:EventTouch):void {
    if(!this.enabled||this.touchId!==null||event.getID()===null)return;
    const p=this.point(event);
    // The top 14% is reserved for the HUD; each hand uses its own half.
    if(p.y>360-720*.14||(this.settings.hand==='left'&&p.x>64)||(this.settings.hand==='right'&&p.x< -64))return;
    this.touchId=event.getID();this.origin=p;this.value={x:0,y:0};
    const ratio=RADII[this.settings.joystickSize]/42;this.ring.setScale(ratio,ratio,1);this.knob.setScale(ratio,ratio,1);
    this.ring.setPosition(p.x,p.y);this.knob.setPosition(p.x,p.y);this.ring.active=true;this.knob.active=true;
    this.onChange?.({...this.value});event.propagationStopped=true;
  }
  private move(event:EventTouch):void {
    if(!this.enabled||event.getID()!==this.touchId||this.touchId===null)return;
    const p=this.point(event),dx=p.x-this.origin.x,dy=p.y-this.origin.y,n=Math.hypot(dx,dy);
    const radius=RADII[this.settings.joystickSize]*.62,limit=Math.max(1,n/radius),knobX=dx/limit,knobY=dy/limit;
    if(n>radius)this.origin={x:p.x-knobX,y:p.y-knobY};
    const travel=clamp((n-1.5)/(radius-1.5),0,1),strength=travel*travel*(3-2*travel);
    this.value=n?{x:dx/n*strength,y:-dy/n*strength}:{x:0,y:0};
    this.ring.setPosition(this.origin.x,this.origin.y);this.knob.setPosition(this.origin.x+knobX,this.origin.y+knobY);
    this.onChange?.({...this.value});event.propagationStopped=true;
  }
  private end(event:EventTouch):void {if(this.touchId!==null&&event.getID()===this.touchId){this.clear();event.propagationStopped=true;}}
  private mouseDown(event:EventMouse):void {
    if(!this.enabled)return;
    // Creator's simulated TOUCH_START is dispatched before MOUSE_DOWN.
    // A secondary button must not turn that simulation into movement.
    if(event.getButton()!==EventMouse.BUTTON_LEFT){if(this.touchId!==null)this.clear();return;}
    this.mouseActive=this.touchId===0;
  }
  private mouseMove(event:EventMouse):void {
    if(this.mouseActive&&event.getButton()!==EventMouse.BUTTON_LEFT)this.clear();
  }
  private mouseUp(event:EventMouse):void {
    if(this.mouseActive&&event.getButton()===EventMouse.BUTTON_LEFT)this.clear();
  }
  private mouseLeave(event:EventMouse):void {
    if(!this.mouseActive)return;
    const p=this.point(event);
    // Crossing a HUD button is not leaving the play surface.
    if(p.x<=-640||p.x>=640||p.y<=-360||p.y>=360)this.clear();
  }
}
