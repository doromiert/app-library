import Pango from 'gi://Pango';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import {previewPosition} from './model.js';

export class CategoryDrag {
 constructor(library){
  this.library=library;this.state=null;
  this.monitor={dragMotion:event=>{this.motion(event);return DND.DragMotionResult.CONTINUE;}};
  DND.addDragMonitor(this.monitor);
 }
 preview(group){
  this.finish(false);
  this.state={group,order:this.library.groups.map(g=>g.id)};group._dragging=true;
  const preview=new St.Widget({layout_manager:new Clutter.FixedLayout(),width:208,height:246});
  const card=new St.Widget({style_class:'app-library-card',width:208,height:208});preview.add_child(card);
  const label=new St.Label({text:group.name,style_class:'app-library-category-label',width:224});label.clutter_text.set_line_alignment(Pango.Alignment.CENTER);label.clutter_text.set({x_align:Clutter.ActorAlign.CENTER,y_align:Clutter.ActorAlign.CENTER});label.set_position(-8,218);preview.add_child(label);
  group.apps.forEach((app,index)=>{
   const p=previewPosition(index,group.apps.length);if(!p.visible)return;
   const size=p.size===80?72:p.size;
   const icon=app.app.create_icon_texture(size);icon.set_position(p.x+(p.size-size)/2,p.y+(p.size-size)/2);preview.add_child(icon);
  });
  for(const actor of [group.card,group.label,group.cluster,...group.apps]){actor.remove_all_transitions();actor.opacity=0;}
  this.library._clearHover();return preview;
 }
 motion(event){
  const state=this.state,library=this.library;
  const ownApp=event.source?.library===library;
  if(ownApp&&library.expanded){
   const [ox,oy]=library.get_transformed_position(),p=library._panel;
   if(event.x<ox+p.x||event.x>ox+p.x+p.width||event.y<oy+p.y||event.y>oy+p.y+p.height)library.close(false);
   return;
  }
  if(ownApp||state){
   const [ox]=library.get_transformed_position(),now=GLib.get_monotonic_time();
   if(now-(this.edgeTime??0)>500000){
    const direction=event.x<ox+32?-1:event.x>ox+library._rootWidth-32?1:0;
    if(direction){this.edgeTime=now;library.goToPage(library.page+direction);}
   }
  }
  if(!state||event.source?._libraryCategory!==state.group)return;
  const candidates=library.groups.filter(g=>g!==state.group&&g.page===library.page&&!(g.id==='Recents'&&library._settings.get_boolean('pin-recents')));
  let nearest=null,distance=Infinity;
  for(const group of candidates){const [x,y]=group.card.get_transformed_position();const d=Math.hypot(event.x-x-104,event.y-y-104);if(d<distance){distance=d;nearest=group;}}
  if(!nearest||distance>155)return;
  const from=library.groups.indexOf(state.group),to=library.groups.indexOf(nearest);
  if(from===to)return;
  library.groups.splice(from,1);library.groups.splice(to,0,state.group);
  library._layoutKey='';library._animate=true;library.queue_relayout();
 }
 finish(accept){
  if(!this.state)return false;
  const {group,order}=this.state;this.state=null;group._dragging=false;
  if(!accept)this.library.groups.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  else this.library._settings.set_strv('category-order',this.library.groups.map(g=>g.id));
  for(const actor of [group.card,group.label,group.cluster,...group.apps])actor.opacity=255;
  this.library._layoutKey='';this.library._animate=false;this.library.queue_relayout();
  return true;
 }
 destroy(){this.finish(false);DND.removeDragMonitor(this.monitor);}
}
