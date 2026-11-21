/** Web-only semantic mirror. The Cocos UI remains the visual and gameplay authority.
 * Pass a real Document only on the Web; native/minigame hosts need no DOM. */
export type SemanticControl =
  | {id:string;kind:'button';label:string;disabled?:boolean}
  | {id:string;kind:'tab';label:string;selected:boolean;disabled?:boolean}
  | {id:string;kind:'switch';label:string;checked:boolean;disabled?:boolean}
  | {id:string;kind:'slider';label:string;value:number;min:number;max:number;step:number;valueText?:string;disabled?:boolean};
export interface SemanticView {
  /** Stable until the visible Cocos screen changes. */
  id:string;
  title:string;
  modal?:boolean;
  controls:readonly SemanticControl[];
  /** Readable noninteractive text belonging to the current screen. */
  content?:readonly string[];
  /** On view change, focus this control; omit to keep focus with the host. */
  initialFocus?:string;
}
export interface SemanticCallbacks {
  /** Route the ID and optional value through the same handler as the Cocos control. */
  activate:(id:string,value?:boolean|number)=>void;
  /** The host must draw/remove a visible focus indicator on the matching Cocos node. */
  focus:(id:string|null)=>void;
  /** Use the same cancel/back policy as the current Cocos view. */
  escape?:()=>void;
}
export interface WebAccessibilityBridge {
  setView(view:SemanticView):void;
  /** Supply only meaningful, rate-limited changes; do not announce each game frame. */
  announce(message:string):void;
  destroy():void;
}

/** No browser globals are accessed during module import or when doc is null. */
export function createWebAccessibilityBridge(doc:Document|null,callbacks:SemanticCallbacks,parent?:HTMLElement):WebAccessibilityBridge|null {
  if(!doc)return null;
  const host=parent??doc.body;if(!host)return null;
  const root=doc.createElement('section');root.setAttribute('aria-label','游戏操作');
  // The bridge is available to assistive technology but never paints game UI.
  Object.assign(root.style,{position:'fixed',width:'1px',height:'1px',padding:'0',margin:'-1px',overflow:'hidden',clipPath:'inset(50%)',whiteSpace:'nowrap',border:'0'});
  const title=doc.createElement('h2'),content=doc.createElement('div'),controls=doc.createElement('div'),status=doc.createElement('div');
  title.id=`game-semantic-title-${Math.random().toString(36).slice(2)}`;
  root.setAttribute('aria-labelledby',title.id);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  root.append(title,content,controls,status);host.appendChild(root);
  const nodes=new Map<string,HTMLButtonElement|HTMLInputElement>();
  let current:SemanticView|null=null,disposed=false;
  const focusable=()=>Array.from(controls.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button:not(:disabled),input:not(:disabled)'));
  root.addEventListener('keydown',event=>{
    // Creator also receives global keys. Never let activation or arrow keys
    // simultaneously trigger dash/movement while semantic controls have focus.
    if(event.key==='Escape'){if(callbacks.escape){event.stopPropagation();event.preventDefault();callbacks.escape();}return;}
    event.stopPropagation();
    if(event.key!=='Tab'||!current?.modal)return;
    const list=focusable();if(!list.length){event.preventDefault();return;}
    const index=list.indexOf(doc.activeElement as HTMLButtonElement|HTMLInputElement);
    if(event.shiftKey&&index<=0){event.preventDefault();list[list.length-1].focus();}
    else if(!event.shiftKey&&(index<0||index===list.length-1)){event.preventDefault();list[0].focus();}
  });
  root.addEventListener('keyup',event=>event.stopPropagation());
  root.addEventListener('focusout',event=>{
    const next=event.relatedTarget as Node|null;
    if(!next||!root.contains(next))callbacks.focus(null);
  });
  const create=(item:SemanticControl)=>{
    const node=item.kind==='slider'?doc.createElement('input'):doc.createElement('button');
    if(node.tagName==='INPUT')(node as HTMLInputElement).type='range';else (node as HTMLButtonElement).type='button';
    node.dataset.semanticId=item.id;
    node.addEventListener('focus',()=>callbacks.focus(item.id));
    node.addEventListener('click',()=>{if(node.tagName==='BUTTON'){
      const model=current?.controls.find(entry=>entry.id===item.id);
      if(model&&!model.disabled)callbacks.activate(item.id,model.kind==='switch'?!model.checked:undefined);
    }});
    node.addEventListener('input',()=>{if(node.tagName==='INPUT'){
      const model=current?.controls.find(entry=>entry.id===item.id);
      if(model?.kind==='slider'&&!model.disabled)callbacks.activate(item.id,Number((node as HTMLInputElement).value));
    }});
    return node;
  };
  return {
    setView(view){
      if(disposed)return;
      const seen=new Set<string>();
      for(const item of view.controls){if(!item.id||seen.has(item.id))throw new Error('Semantic control IDs must be nonempty and unique');seen.add(item.id);}
      const changed=current?.id!==view.id;
      const focused=(doc.activeElement as HTMLElement|null)?.dataset?.semanticId;
      current=view;title.textContent=view.title;
      const paragraphs=view.content??[];
      if(paragraphs.length!==content.children.length||paragraphs.some((text,index)=>content.children[index]?.textContent!==text)){
        content.replaceChildren(...paragraphs.map(text=>{const p=doc.createElement('p');p.textContent=text;return p;}));
      }
      if(view.modal){root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');}
      else {root.removeAttribute('role');root.removeAttribute('aria-modal');}
      for(const [id,node] of nodes){
        const item=view.controls.find(entry=>entry.id===id);
        if(!item||(item.kind==='slider')!==(node.tagName==='INPUT')){node.remove();nodes.delete(id);}
      }
      view.controls.forEach((item,index)=>{
        let node=nodes.get(item.id);if(!node){node=create(item);nodes.set(item.id,node);}
        const existing=controls.children[index];if(existing!==node)controls.insertBefore(node,existing??null);
        node.setAttribute('aria-label',item.label);node.disabled=!!item.disabled;
        if(item.kind==='slider'){
          const input=node as HTMLInputElement;input.min=String(item.min);input.max=String(item.max);input.step=String(item.step);input.value=String(item.value);
          if(item.valueText)input.setAttribute('aria-valuetext',item.valueText);else input.removeAttribute('aria-valuetext');
          input.removeAttribute('role');input.removeAttribute('aria-selected');input.removeAttribute('aria-checked');
        }else{
          const button=node as HTMLButtonElement;button.textContent=item.label;
          // Category choices use pressed buttons, so they remain valid even
          // when mixed with other controls instead of being inside a tablist.
          if(item.kind==='tab')button.setAttribute('aria-pressed',String(item.selected));else button.removeAttribute('aria-pressed');
          button.removeAttribute('role');button.removeAttribute('aria-selected');
          if(item.kind==='switch'){button.setAttribute('role','switch');button.setAttribute('aria-checked',String(item.checked));}else button.removeAttribute('aria-checked');
        }
      });
      if(changed&&view.initialFocus){const target=nodes.get(view.initialFocus);if(target&&!target.disabled)target.focus();}
      else if(!changed&&focused&&nodes.has(focused)&&doc.activeElement!==nodes.get(focused))nodes.get(focused)?.focus();
      else if(focused&&!nodes.has(focused))callbacks.focus(null);
    },
    announce(message){if(!disposed&&status.textContent!==message)status.textContent=message;},
    destroy(){if(disposed)return;disposed=true;if(root.contains(doc.activeElement))callbacks.focus(null);nodes.clear();root.remove();},
  };
}
