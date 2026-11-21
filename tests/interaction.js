import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const delay=ms=>new Promise(r=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,r));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const overrides=library._settings.get_value('category-overrides');let pointer=null;
 try{
  library.close(false);Main.overview.showApps();await delay(350);library.goToPage(0,0);await delay(80);
  const group=library.groups.find(g=>g.id==='Utility'),icon=group.apps[0];
  library._pointerActor=icon;library._syncCategoryHover();assert(group.card.has_style_class_name('app-library-has-hover'),'app hover did not retain folder highlight');
  library._pointerActor=group.cluster;library._syncCategoryHover();assert(group.card.has_style_class_name('app-library-has-hover'),'cluster hover did not retain folder highlight');
  library._clearHover();assert(!group.card.has_style_class_name('app-library-has-hover'),'folder highlight stuck');
  const controls=[library.controls.button,library._previous,library._next].filter(actor=>actor.visible);
  const positions=controls.map(actor=>actor.get_transformed_position());
  library.open(group);await delay(340);
  controls.forEach((actor,i)=>assert(actor.get_transformed_position().every((v,j)=>Math.abs(v-positions[i][j])<1),'background control moved during expansion '+JSON.stringify({index:i,before:positions[i],after:actor.get_transformed_position(),translation:[actor.translation_x,actor.translation_y],home:library._homeGeometry})));
  assert(!group.apps.includes(global.stage.get_key_focus()),'opening selected first app without keyboard');
  const keyboard=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  const key=async symbol=>{keyboard.notify_keyval(GLib.get_monotonic_time(),symbol,Clutter.KeyState.PRESSED);keyboard.notify_keyval(GLib.get_monotonic_time(),symbol,Clutter.KeyState.RELEASED);await delay(40);};
  await key(Clutter.KEY_Right);assert(global.stage.get_key_focus()===group.apps[0],'first keyboard input did not select first icon');
  await key(Clutter.KEY_Right);assert(global.stage.get_key_focus()===group.apps[1],'right arrow did not move selection');
  await key(Clutter.KEY_Down);assert(global.stage.get_key_focus()===group.apps[1+library._folderColumns],'down arrow did not move selection');
  const children=library._iconLayer.get_children(),scrim=children.indexOf(library._scrim);
  assert(library.controls.button.visible&&children.indexOf(library.controls.button)<scrim&&library.controls.button.reactive,'Sort not retained beneath dim overlay');
  assert(children.indexOf(library._next)<scrim&&children.indexOf(library._previous)<scrim,'grid arrows not beneath overlay');
  assert(Math.abs(library._folderNext.get_allocation_box().x2-(library._panel.x+library._panel.width-24))<1,'folder arrow inset differs from Sort');
  // Close with the physical pointer outside every category.
  pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  pointer.notify_absolute_motion(GLib.get_monotonic_time(),10,100);await delay(40);
  // Simulate stale pointer state on several collapsed clusters while closing.
  library.close();
  for(const other of library.groups.filter(g=>g.apps.length>4).slice(0,3))other.cluster.set_hover(true);
  await delay(380);
  assert(library.groups.every(g=>!g.card.hover&&!g.cluster.hover&&!g.card.has_style_class_name('app-library-has-hover')),'collapse retained stale folder hover '+JSON.stringify(library.groups.filter(g=>g.card.hover||g.cluster.hover||g.card.has_style_class_name('app-library-has-hover')).map(g=>({id:g.id,card:g.card.hover,cluster:g.cluster.hover}))));
  controls.forEach((actor,i)=>assert(actor.get_transformed_position().every((v,j)=>Math.abs(v-positions[i][j])<1),'background control moved after collapse'));
  library.close(false);await delay(100);
  const sourceGroup=library.groups.find(g=>g.id==='Development'),target=library.groups.find(g=>g.id==='Graphics');
  const app=sourceGroup.apps[0],sx=app.translation_x+50,sy=app.translation_y+45;
  const [ox,oy]=library.get_transformed_position(),tx=target.card.translation_x+202,ty=target.card.translation_y+202;
  assert(library._dropGroupAt(tx,ty)===target,'folder background not hit-testable');
  // A real drag releases over padding, outside all child app/cluster targets.
  pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  pointer.notify_absolute_motion(GLib.get_monotonic_time(),ox+sx,oy+sy);await delay(30);
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.PRESSED);await delay(220);
  for(let i=1;i<=20;i++){pointer.notify_absolute_motion(GLib.get_monotonic_time(),ox+sx+(tx-sx)*i/20,oy+sy+(ty-sy)*i/20);await delay(16);}
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);await delay(180);
  assert(library.icons.get(app.app.get_id()).group.id==='Graphics','drop onto folder padding did not change category');
  return {folderHover:true,keyboardOnlySelection:true,keyboardArrows:true,backgroundControlsDimmed:true,stationaryBackgroundControls:true,collapseClearsHover:true,folderArrowInset:true,physicalFolderBackgroundDrop:true};
 }finally{pointer?.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);library.close(false);library._settings.set_value('category-overrides',overrides);await delay(100);}
}
