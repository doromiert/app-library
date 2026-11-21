import GLib from 'gi://GLib';
const delay=ms=>new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,resolve));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 library.close(false);await delay(100);
 const education=library.groups.find(g=>g.id==='Education');
 if(education){
  const otherPositions=new Map(library.groups.filter(g=>g!==education).map(g=>[g,g.card.get_transformed_position()]));
  const titleActor=education.label,titleStart=titleActor.get_transformed_position();
  library.open(education);await delay(70);
  assert(education.label===titleActor&&Math.hypot(...titleActor.get_transformed_position().map((v,i)=>v-titleStart[i]))>1,'category title does not animate '+JSON.stringify({start:titleStart,now:titleActor.get_transformed_position(),morph:library._morphing,card:education.card.get_transformed_position(),title:education.label===titleActor}));
  for(const [g,[x,y]] of otherPositions){const [nx,ny]=g.card.get_transformed_position();assert(Math.hypot(nx-x,ny-y)<2,'unselected category moved during expansion');assert(g.card.opacity===255&&g.apps.slice(0,3).every(a=>a.opacity===255),'background category disappeared');}
  assert(education.apps[0].icon.label.opacity>0&&education.apps[0].icon.label.opacity<255,'opening labels did not fade');
  assert(education.apps.slice(16).every(a=>a.opacity===0),'off-page icons visible during expansion');
  education.card.ensure_style();
  assert(education.card.opacity===255&&education.card.get_theme_node().get_background_color().alpha>0,'translucent opening panel');
  assert(education.apps.slice(0,7).every(a=>a.opacity===255),'persistent preview artwork faded');
  assert(education.apps.slice(7,16).some(a=>a.opacity>0&&a.opacity<255),'extra opening apps did not fade in');
  await delay(280);education.cluster.set_hover(true);library.close();await delay(70);
  assert(!education.cluster.visible&&library._hover.opacity===0,'collapse retained miniature highlight');
  assert(education.apps[0].icon.label.opacity>0&&education.apps[0].icon.label.opacity<255,'closing labels did not fade');
  education.card.ensure_style();assert(education.card.get_theme_node().get_background_color().alpha>0,'translucent closing panel');
  await delay(280);
 }
 library.goToPage(library._pageCount-1,0);await delay(50);
 const group=library.groups.find(g=>g.page===library.page);
 assert(group,'last category page is empty');
 const before=group.card.get_transformed_position();
 library.open(group);await delay(70);
 const opening=group.card.get_transformed_position();
 await delay(280);const opened=group.card.get_transformed_position();
 assert(Math.hypot(opening[0]-before[0],opening[1]-before[1])>1,'open did not move '+JSON.stringify({before,opening,page:library.page,group:group.id,morph:library._morphing}));
 assert(Math.hypot(opening[0]-opened[0],opening[1]-opened[1])>1,'open snapped directly to target');
 library.close();await delay(70);const closing=group.card.get_transformed_position();
 await delay(280);const closed=group.card.get_transformed_position();
 assert(Math.hypot(closing[0]-closed[0],closing[1]-closed[1])>1,'close snapped directly to target');
 assert(Math.hypot(closed[0]-before[0],closed[1]-before[1])<2,'close did not return to source card '+JSON.stringify({before,opening,opened,closing,closed,home:library._homeGeometry,size:library.get_size(),page:library.page}));
 assert(library.page===group.page,'closing changed category page');
 library.goToPage(0,0);await delay(50);
 const card=library.groups.find(g=>g.page===0);const x0=card.card.translation_x;
 library._hoverTarget=card.apps[0];library._hover.opacity=255;
 library.goToPage(1,250);await delay(70);
 assert(library._hover.opacity===0&&library._hoverTarget===null,'stale hover during category page motion');
 const xm=card.card.translation_x;
 await delay(250);const x1=card.card.translation_x;
 assert(xm<x0&&xm>x1,'category pagination snaps or reverses');
 assert(Math.abs((x0-x1)-library._rootWidth)<2,'category page stride incorrect');
 library.goToPage(0,0);
 return {opening:true,closing:true,returnsToOrigin:true,categoryPageTween:true,pages:library._pageCount};
}
