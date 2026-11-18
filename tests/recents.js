import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {folderLayout} from '../model.js';
const delay=ms=>new Promise(r=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,r));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const settings=library._settings,history=settings.get_value('recently-used'),show=settings.get_boolean('show-recents'),pin=settings.get_boolean('pin-recents');
 try{
  library.close(false);settings.set_boolean('show-recents',true);settings.set_boolean('pin-recents',true);settings.set_value('recently-used',new GLib.Variant('a{sx}',{}));await delay(150);
  let group=library.groups.find(g=>g.id==='Recents');assert(group&&group.apps.length===0&&group.emptyIcon,'empty Recents is missing placeholder');assert(library.groups[0]===group,'empty Recents not pinned first');
  library.recordUse([...library.icons.values()][0].app.get_id());library.queueRefresh();await delay(150);group=library.groups.find(g=>g.id==='Recents');assert(group.apps.length===1&&!group.emptyIcon,'history did not replace Recents placeholder');
  const apps=[...library.icons.values()].filter(a=>a.group.id!=='Recents').slice(0,24);
  const populated=Object.fromEntries(apps.map((a,i)=>[a.app.get_id(),100+i]));
  settings.set_value('recently-used',new GLib.Variant('a{sx}',populated));library.queueRefresh();await delay(150);
  group=library.groups.find(g=>g.id==='Recents');
  const monitor=Main.layoutManager.primaryMonitor,limit=folderLayout(monitor.width,monitor.height).capacity;
  assert(group.apps.length===Math.min(apps.length,limit),'Recents exceeds one-page capacity');
  library.open(group);await delay(340);
  const oldest=apps[0].app.get_id(),next=apps[1].app.get_id();
  library.recordUse(oldest);library.recordUse(next);await delay(150);
  group=library.groups.find(g=>g.id==='Recents');
  assert(group.apps[0].app.get_id()===next&&group.apps[1].app.get_id()===oldest,'Recents not ordered by last opening');
  assert(Object.keys(settings.get_value('recently-used').deepUnpack()).length===apps.length,'one-page display truncated saved history');
  library.open(group);await delay(340);assert(library._folderPages===1&&!library._folderNext.visible&&!library._folderPrevious.visible,'Recents has extra pages');
  library.close(false);
  return {emptyVisible:true,placeholder:true,pinnedFirst:true,historyReplacesPlaceholder:true,onePage:true,lastOpenedFirst:true,historyRetained:true};
 }finally{settings.set_value('recently-used',history);settings.set_boolean('show-recents',show);settings.set_boolean('pin-recents',pin);library.queueRefresh();await delay(100);}
}
