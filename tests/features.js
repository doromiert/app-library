import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const delay=ms=>new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,resolve));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const settings=library._settings;
 const keys=['sort-mode','custom-categories','custom-order','category-order','show-recents','pin-recents','recently-used','first-seen','category-overrides'];
 const saved=new Map(keys.map(k=>[k,settings.get_value(k)]));
 library.close(false);await delay(60);let pointer=null;
 try{
  const custom=settings.get_value('custom-categories').deepUnpack();custom['custom-native-test']='Native test category';
  settings.set_value('custom-categories',new GLib.Variant('a{ss}',custom));await delay(100);
  assert(library.groups.some(g=>g.id==='custom-native-test'),'empty custom category missing');
  let utilities=library.groups.find(g=>g.id==='Utility'),a=utilities.apps[0],b=utilities.apps[1];
  library.moveApp(a.app.get_id(),'custom-native-test');await delay(100);
  assert(a.group.id==='custom-native-test','custom category assignment');
  const other=library.groups.find(g=>g.id==='Office');
  assert(other.card._delegate.acceptDrop(a),'app drop into another category rejected');await delay(100);
  assert(a.group.id==='Office','app drop did not change category');
  a.popupMenu();const items=a._categorySubmenu.menu._getMenuItems();assert(items[0].label.text==='Original category','Original category not in submenu');a._menu.close();
  library.moveApp(a.app.get_id(),null);await delay(100);
  assert(a.group.id==='Utility','original category reset');
  settings.set_boolean('pin-recents',false);settings.set_string('sort-mode','custom');await delay(100);
  utilities=library.groups.find(g=>g.id==='Utility');a=utilities.apps[1];b=utilities.apps[0];
  assert(library.reorderApp(a,b),'app reorder rejected');await delay(100);
  assert(library.groups.find(g=>g.id==='Utility').apps[0]===a,'app order did not change');
  utilities=library.groups.find(g=>g.id==='Utility');library.open(utilities);await delay(350);
  const source=utilities.apps[1],target=utilities.apps[0];
  const center=actor=>{const [x,y]=actor.get_transformed_position(),[w,h]=actor.get_transformed_size();return [x+w/2,y+h/2];};
  pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  const [sx,sy]=center(source),[tx,ty]=center(target);
  pointer.notify_absolute_motion(GLib.get_monotonic_time(),sx,sy);await delay(30);
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.PRESSED);await delay(220);
  for(let i=1;i<=20;i++){pointer.notify_absolute_motion(GLib.get_monotonic_time(),sx+(tx-sx)*i/20,sy+(ty-sy)*i/20);await delay(16);}
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);await delay(250);
  assert(library.groups.find(g=>g.id==='Utility').apps[0]===source,'physical app drag did not reorder');
  library.close(false);await delay(100);
  let last=library.groups.at(-1),first=library.groups[0];assert(library.reorderCategory({_libraryCategory:last},first),'category reorder rejected');await delay(100);
  assert(library.groups[0].id===last.id,'category order did not change');
  const fromIndex=library.groups.findIndex(g=>g.apps.length>4&&g.page===library.page);
  const toIndex=fromIndex+1;const fromGroup=library.groups[fromIndex],toGroup=library.groups[toIndex];
  const [fcx,fcy]=fromGroup.card.get_transformed_position(),[tcx,tcy]=toGroup.card.get_transformed_position();
  pointer.notify_absolute_motion(GLib.get_monotonic_time(),fcx+104,fcy+8);await delay(30);
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.PRESSED);await delay(80);
  for(let i=1;i<=20;i++){pointer.notify_absolute_motion(GLib.get_monotonic_time(),fcx+104+(tcx-fcx)*i/20,fcy+8+(tcy-fcy)*i/20);await delay(16);}
  assert(library.categoryDrag.state?.group===fromGroup,'category drag did not start');
  const dragActor=fromGroup.draggable._dragActor;
  assert(dragActor.get_children().length>=2+Math.min(3,fromGroup.apps.length),'category drag preview is just a label');
  assert(library.groups.indexOf(fromGroup)===toIndex,'live category rearrangement did not follow pointer');
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);await delay(300);
  assert(!library.categoryDrag.state,'category drag did not settle');
  assert(settings.get_strv('category-order')[toIndex]===fromGroup.id,'category drop did not persist');
  const used={[a.app.get_id()]:100,[b.app.get_id()]:200};settings.set_value('recently-used',new GLib.Variant('a{sx}',used));settings.set_boolean('show-recents',true);
  settings.set_boolean('pin-recents',true);settings.set_string('sort-mode','used');await delay(100);
  let recent=library.groups.find(g=>g.id==='Recents');assert(recent?.apps[0].app.get_id()===b.app.get_id(),'Recents is not chronological');
  assert(library.groups[0].id==='Recents','Recents not pinned first by default');
  settings.set_boolean('pin-recents',false);settings.set_string('sort-mode','alphabetical');await delay(100);
  assert(library.groups[0].id!=='Recents','Recents unpin did not affect category sort');
  settings.set_boolean('pin-recents',true);
  const fresh=new Gio.Settings({settings_schema:settings.settings_schema});assert(fresh.get_value('recently-used').deepUnpack()[b.app.get_id()]===200,'history not stored in settings backend');
  settings.set_boolean('show-recents',false);await delay(100);assert(!library.groups.some(g=>g.id==='Recents'),'Recents toggle did not hide category');
  const seen=settings.get_value('first-seen').deepUnpack();seen[a.app.get_id()]=100;seen[b.app.get_id()]=9999999999999;settings.set_value('first-seen',new GLib.Variant('a{sx}',seen));settings.set_string('sort-mode','added');await delay(100);
  assert(library.groups.find(g=>g.id==='Utility').apps[0].app.get_id()===b.app.get_id(),'recently added order');
  settings.set_string('sort-mode','alphabetical');await delay(100);
  utilities=library.groups.find(g=>g.id==='Utility');assert(utilities.apps.every((a,i)=>i===0||utilities.apps[i-1].app.get_name().localeCompare(a.app.get_name())<=0),'alphabetical order');
  library.controls.rebuild();assert(library.controls.menu._getMenuItems().length===8,'grid options menu');
  library.controls.newCategory();await delay(250);assert(library.controls.dialog.state===0,'new category dialog did not open');library.controls.dialog.close();
  return {customCategory:true,originalCategory:true,customAppOrder:true,physicalAppDrag:true,physicalCategoryDrag:true,customCategoryOrder:true,recents:true,historyBackend:true,sortModes:true,inlineControls:true};
 }finally{
  pointer?.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);
  library.controls.dialog?.close();library.close(false);
  for(const [key,value]of saved)settings.set_value(key,value);await delay(100);
 }
}
