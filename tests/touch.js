import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
const delay=ms=>new Promise(r=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,r));
const assert=(v,s)=>{if(!v)throw new Error(s);};
export async function run(library){
 const group=library.groups.find(g=>g.id==='Graphics');library.close(false);await delay(60);library.open(group);await delay(330);
 const event=(type,x=4,y=4,sequence=1)=>({type:()=>type,get_coords:()=>[x,y],get_event_sequence:()=>sequence});
 library._outsideTouch(event(Clutter.EventType.TOUCH_BEGIN));library._outsideTouch(event(Clutter.EventType.TOUCH_UPDATE,40));library._outsideTouch(event(Clutter.EventType.TOUCH_END,40));
 assert(library.expanded===group,'outside swipe closed folder');
 library._outsideTouch(event(Clutter.EventType.TOUCH_BEGIN));library._outsideTouch(event(Clutter.EventType.TOUCH_CANCEL));assert(library.expanded===group,'cancelled touch closed folder');
 library._outsideTouch(event(Clutter.EventType.TOUCH_BEGIN));library._outsideTouch(event(Clutter.EventType.TOUCH_END));assert(!library.expanded,'outside touch tap did not close folder');await delay(330);
 return {outsideTap:true,swipePreserved:true,cancelPreserved:true};
}
