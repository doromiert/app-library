import GLib from 'gi://GLib';
const delay=ms=>new Promise(r=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,r));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const settings=library._settings,history=settings.get_value('recently-used'),show=settings.get_boolean('show-recents'),pin=settings.get_boolean('pin-recents');
 try{
  library.close(false);settings.set_boolean('show-recents',true);settings.set_boolean('pin-recents',true);settings.set_value('recently-used',new GLib.Variant('a{sx}',{}));await delay(150);
  let group=library.groups.find(g=>g.id==='Recents');assert(group&&group.apps.length===0&&group.emptyIcon,'empty Recents is missing placeholder');assert(library.groups[0]===group,'empty Recents not pinned first');
  library.recordUse([...library.icons.values()][0].app.get_id());library.queueRefresh();await delay(150);group=library.groups.find(g=>g.id==='Recents');assert(group.apps.length===1&&!group.emptyIcon,'history did not replace Recents placeholder');
  return {emptyVisible:true,placeholder:true,pinnedFirst:true,historyReplacesPlaceholder:true};
 }finally{settings.set_value('recently-used',history);settings.set_boolean('show-recents',show);settings.set_boolean('pin-recents',pin);library.queueRefresh();await delay(100);}
}
