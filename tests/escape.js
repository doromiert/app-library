import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const delay=ms=>new Promise(r=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,r));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const keyboard=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
 const escape=async()=>{keyboard.notify_keyval(GLib.get_monotonic_time(),Clutter.KEY_Escape,Clutter.KeyState.PRESSED);keyboard.notify_keyval(GLib.get_monotonic_time(),Clutter.KEY_Escape,Clutter.KeyState.RELEASED);await delay(360);};
 try{
  library.close(false);Main.overview.showApps();Main.overview.dash.showAppsButton.checked=true;await delay(350);
  const group=library.groups.find(g=>g.id==='Utility');
  for(const focus of ['folder','app','search']){
   library.open(group);await delay(340);
   if(focus==='app')group.apps[0].grab_key_focus();
   if(focus==='search')Main.overview.searchEntry.grab_key_focus();
   await escape();
   assert(!library.expanded&&!library._lifted,'Escape left category expanded with '+focus+' focus');
   assert(Main.overview.visible&&Main.overview.dash.showAppsButton.checked,'Escape left app library while closing '+focus+' focus');
   assert(!group.apps.includes(global.stage.get_key_focus()),'Escape retained category app focus');
  }
  await escape();
  assert(!Main.overview.dash.showAppsButton.checked||!Main.overview.visible,'Escape without a folder did not leave app library');
  return {folderFirst:true,appFocus:true,searchFocus:true,secondEscapeLeaves:true};
 }finally{library.close(false);Main.overview.showApps();Main.overview.dash.showAppsButton.checked=true;await delay(350);}
}
