import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
const delay=ms=>new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,resolve));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const original=library._settings.get_string('sort-mode');library.close(false);library._settings.set_string('sort-mode','alphabetical');await delay(120);library.goToPage(0,0);await delay(60);
 try{
  const g=library.groups.find(g=>g.id==='Graphics'),[sx,sy]=g.card.get_transformed_position();
  const [cx,cy]=g.cluster.get_transformed_position();
  const pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  pointer.notify_absolute_motion(GLib.get_monotonic_time(),cx+44,cy+44);await delay(30);
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.PRESSED);await delay(30);
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);
  const frames=[];
  for(let i=0;i<24;i++){await delay(16);const [x,y]=g.card.get_transformed_position();if(g.card.has_allocation())frames.push([x,y]);}
  assert(library.expanded===g,'physical cluster click did not open Graphics');
  const [ex,ey]=g.card.get_transformed_position();
  assert(frames.every(([x,y])=>x>=Math.min(sx,ex)-2&&x<=Math.max(sx,ex)+2&&y>=Math.min(sy,ey)-2&&y<=Math.max(sy,ey)+2),'panel escaped source→destination bounds '+JSON.stringify({sx,sy,ex,ey,frames}));
  library.close();const closing=[];
  for(let i=0;i<24;i++){await delay(16);if(g.card.has_allocation())closing.push(g.card.get_transformed_position());}
  assert(closing.every(([x,y])=>x>=Math.min(sx,ex)-2&&x<=Math.max(sx,ex)+2&&y>=Math.min(sy,ey)-2&&y<=Math.max(sy,ey)+2),'collapse escaped source→destination bounds '+JSON.stringify({sx,sy,ex,ey,closing,geometry:library._homeGeometry}));
  return {physicalClusterOpen:true,openingFrames:frames.length,closingFrames:closing.length,source:[sx,sy],destination:[ex,ey]};
 }finally{library.close(false);library._settings.set_string('sort-mode',original);}
}
