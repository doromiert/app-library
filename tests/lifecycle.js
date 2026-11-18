import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const delay=ms=>new Promise(r=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,r));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const saved=library._settings.get_value('category-overrides');
 const home=library._homeParent??library.get_parent();
 const unlifted=()=>!library._lifted&&library.get_parent()===home&&library.get_parent()!==Main.uiGroup;
 try{
  library.close(false);await delay(80);
  let source=library.groups.find(g=>g.id==='Development');
  const ids=source.apps.map(a=>a.app.get_id());
  for(const id of ids.slice(1))library.moveApp(id,'Graphics');
  await delay(100);source=library.groups.find(g=>g.id==='Development');
  assert(source.apps.length===1,'single-app category fixture failed');
  library.open(source);await delay(340);
  library.moveApp(ids[0],'Graphics');await delay(100);
  assert(!library.expanded&&unlifted(),'moving last app left library attached above desktop');
  Main.overview.hide();await delay(350);
  assert(unlifted()&&!library.mapped,'library remains mapped outside overview');
  Main.overview.showApps();await delay(350);
  let graphics=library.groups.find(g=>g.id==='Graphics');library.open(graphics);await delay(340);
  library.moveApp(graphics.apps[0].app.get_id(),'Office');await delay(100);
  graphics=library.expanded;
  assert(graphics?.id==='Graphics'&&graphics.card.get_parent()===library._iconLayer,'refresh lost foreground panel');
  const children=library._iconLayer.get_children(),cardIndex=children.indexOf(graphics.card);
  assert(graphics.apps.every(a=>children.indexOf(a)>cardIndex),'foreground app fell below card');
  Main.overview.hide();await delay(350);assert(unlifted()&&!library.mapped,'refreshed category orphaned on hide');
  Main.overview.showApps();await delay(350);
  graphics=library.groups.find(g=>g.id==='Graphics');library.open(graphics);await delay(30);
  library.moveApp(graphics.apps[0].app.get_id(),'Office');await delay(30);
  library.close(false);await delay(350);
  assert(unlifted()&&!library.expanded&&!library._morphing,'stale morph resurrected presentation');
  // Recovery must also work if selection has already disappeared.
  graphics=library.groups.find(g=>g.id==='Graphics');library.open(graphics);await delay(30);
  library.expanded=null;library.close(false);await delay(350);assert(unlifted(),'null selection prevented cleanup');
  return {lastAppMove:true,foregroundAfterRefresh:true,overviewHide:true,interruptedMorph:true,nullSelectionRecovery:true};
 }finally{
  library.close(false);library._settings.set_value('category-overrides',saved);await delay(100);
  Main.overview.showApps();
 }
}
