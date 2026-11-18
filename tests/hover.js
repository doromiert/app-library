import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const delay=ms=>new Promise(r=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,r));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
 const move=async(x,y)=>{pointer.notify_absolute_motion(GLib.get_monotonic_time(),x,y);await delay(60);};
 const stale=()=>library.groups.filter(g=>g.card.has_style_class_name('app-library-has-hover')||g.cluster.has_style_class_name('app-library-pointer-hover')).map(g=>g.id);
 try{
  library.close(false);Main.overview.dash.showAppsButton.checked=true;await delay(350);
  library.goToPage(0,0);await delay(80);
  const layoutGroups=library.groups.filter(g=>g.page===0&&g.apps.length>4);
  for(const group of layoutGroups){
   const [x,y]=group.cluster.get_transformed_position();
   await move(x+40,y+40);
   assert(group.cluster.has_style_class_name('app-library-pointer-hover')&&group.card.has_style_class_name('app-library-has-hover'),'cluster hover missing '+JSON.stringify({id:group.id,xy:[x,y],pointer:global.get_pointer(),pick:String(global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,x+40,y+40)),cluster:{visible:group.cluster.visible,mapped:group.cluster.mapped,reactive:group.cluster.reactive,hover:group.cluster.hover},root:{visible:library.visible,mapped:library.mapped}}));
   await move(10,100);
   assert(!stale().length,'pointer leave retained '+stale());
   await move(x+40,y+40);
   pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.PRESSED);
   pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);
   await delay(350);assert(library.expanded===group,'physical open failed '+group.id);
   await move(10,100);library.close();await delay(380);
   assert(!stale().length,'physical collapse retained '+stale());
  }
  // Stale native hover must never paint a collapsed card or cluster.
  await move(10,100);
  for(const group of layoutGroups){group.card.set_hover(true);group.cluster.set_hover(true);}
  await delay(80);
  assert(!stale().length,'cached hover still controls collapsed highlight');
  for(const group of layoutGroups){
   group.card.ensure_style();group.cluster.ensure_style();
   assert(group.cluster.get_theme_node().get_background_color().alpha===0,'stale native cluster hover still painted');
   group.card.set_hover(false);group.cluster.set_hover(false);
  }
  return {physicalClusterCrossings:true,physicalOpenClose:true,staleNativeHoverIgnored:true};
 }finally{pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);library.close(false);}
}
