import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const delay=ms=>new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,resolve));
const assert=(value,message)=>{if(!value)throw new Error(message);};
export async function run(library){
 const settings=library._settings;
 Main.overview.showApps();Main.overview.dash.showAppsButton.checked=true;await delay(400);
 const samples=[];let maxGap=0,last=GLib.get_monotonic_time();
 const beat=GLib.timeout_add(GLib.PRIORITY_DEFAULT,16,()=>{const now=GLib.get_monotonic_time();maxGap=Math.max(maxGap,(now-last)/1000);last=now;return GLib.SOURCE_CONTINUE;});
 try{
  library.close(false);await delay(120);library.goToPage(0,0);await delay(80);
  const group=library.groups.find(g=>g.id==='Education');assert(group?.apps.length>=20,'multi-page Education fixture required');
  const icons=[...group.apps],card=group.card;
  const anchor=()=>{
   const [x,y]=card.get_transformed_position(),[w,h]=card.get_transformed_size();
   const [cx,cy]=library._close.get_transformed_position(),[dx,dy]=library._folderIndicators.get_transformed_position();
   assert(Math.abs(cx-(x+w-52))<2&&Math.abs(cy-(y+16))<2,'close button detached '+JSON.stringify({x,y,w,h,cx,cy}));
   assert(Math.abs(dx-(x+(w-library._folderIndicators.width)/2))<2&&Math.abs(dy-(y+h-48))<2,'page dots detached '+JSON.stringify({x,y,w,h,dx,dy}));
   samples.push({width:w,close:[cx,cy],dots:[dx,dy],extraOpacity:icons[7].opacity});
  };
  const persistent=()=>assert(icons.slice(0,7).every(icon=>icon.opacity===255),'a persistent preview icon faded');
  const start=GLib.get_monotonic_time();library.open(group);
  for(let i=0;i<12&&card.width<=208;i++)await delay(16);
  anchor();persistent();
  const feedbackMs=(GLib.get_monotonic_time()-start)/1000;assert(card.width>208,'opening did not respond '+JSON.stringify({width:card.width,expanded:library.expanded?.id,morph:library._morphing,duration:library._morphDuration,finish:library._morphFinishId,animate:library._animate,same:library.groups.includes(group),size:library.get_size()}));
  assert(icons[7].opacity>0&&icons[7].opacity<255,'additional apps did not fade in');
  assert(icons.slice(16).every(icon=>icon.opacity===0),'off-page apps appeared');
  assert(library.controls.button.reactive&&!library.controls.button.has_style_pseudo_class('insensitive'),'Sort has disabled appearance');
  for(let i=0;i<12;i++){await delay(16);anchor();persistent();}
  await delay(120);assert(library.expanded===group&&!library._morphing,'opening did not settle');
  assert(group.draggable&&!group.draggable.startGesture.enabled,'expanded folder drag gesture is enabled');
  const pointerDrag=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  const [dragX,dragY]=card.get_transformed_position(),dragWidth=card.width;
  pointerDrag.notify_absolute_motion(GLib.get_monotonic_time(),dragX+20,dragY+card.height-80);await delay(30);
  pointerDrag.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.PRESSED);await delay(30);
  pointerDrag.notify_absolute_motion(GLib.get_monotonic_time(),dragX+100,dragY+card.height-120);await delay(40);
  assert(!library.categoryDrag.state&&Math.abs(card.width-dragWidth)<1,'physical drag moved an expanded folder');
  pointerDrag.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);await delay(350);
  if(!library.expanded){library.open(group);await delay(350);}
  const keyboard=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  const key=async symbol=>{keyboard.notify_keyval(GLib.get_monotonic_time(),symbol,Clutter.KeyState.PRESSED);keyboard.notify_keyval(GLib.get_monotonic_time(),symbol,Clutter.KeyState.RELEASED);await delay(40);};
  Main.overview.searchEntry.grab_key_focus();await key(Clutter.KEY_Right);
  assert(global.stage.get_key_focus()===icons[0],'arrow did not enter folder selection from search focus');
  Main.overview.searchEntry.grab_key_focus();await key(Clutter.KEY_Tab);
  assert(global.stage.get_key_focus()===icons[0],'Tab did not enter folder selection from search focus');
  await key(Clutter.KEY_Right);assert(global.stage.get_key_focus()===icons[1],'arrow navigation did not advance');
  icons[1].set_hover(true);await delay(60);icons[1].ensure_style();
  const highlight=icons[1].get_theme_node().get_background_color();
  assert(highlight.red===255&&highlight.green===255&&highlight.blue===255&&highlight.alpha>0,'expanded hover is not a bright translucent highlight');
  icons[1].set_hover(false);

  library.close();await delay(45);anchor();persistent();
  assert(icons[7].opacity>0&&icons[7].opacity<255,'additional apps did not fade out');
  assert(icons.slice(16).every(icon=>icon.opacity===0),'off-page apps animated on close');
  const closingWidth=card.width;
  library.open(group);assert(Math.abs(card.width-closingWidth)<1,'reopening snapped geometry');for(let i=0;i<5&&card.width===closingWidth;i++)await delay(16);anchor();persistent();
  assert(card.width>closingWidth,'reopening did not reverse the collapse '+JSON.stringify({before:closingWidth,after:card.width,expanded:library.expanded?.id,morph:library._morphing,duration:library._morphDuration,finish:library._morphFinishId,animate:library._animate,serial:library._morphSerial}));
  library.close();await delay(25);const repeatedWidth=card.width;library.close();
  assert(library._lifted&&library._morphing&&Math.abs(card.width-repeatedWidth)<1,'repeated close reset presentation');
  library.open(group);await delay(350);
  assert(library.expanded===group&&!library._morphing&&library._lifted,'stale close callback won after reopening');anchor();persistent();
  assert(group.apps.every((icon,i)=>icon===icons[i]),'morph replaced app actors');
  library.close();for(let i=0;i<13;i++){await delay(16);anchor();persistent();}
  await delay(120);assert(!library.expanded&&!library._morphing&&!library._lifted,'closing left an orphaned foreground');
  assert(icons.slice(7).every(icon=>icon.opacity===0),'hidden preview apps retained opacity');
  assert(library._close.opacity===0&&library._folderIndicators.opacity===0,'folder controls remain visible after collapse');
  assert(library._indicators.opacity===255,'grid dots did not return');
  assert(group.draggable.startGesture.enabled,'collapsed folder dragging did not recover');
  const pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  const [gx,gy]=group.cluster.get_transformed_position();
  pointer.notify_absolute_motion(GLib.get_monotonic_time(),gx+44,gy+44);await delay(60);
  assert(group.cluster.reactive&&group.card.has_style_class_name('app-library-has-hover'),'hover did not recover after collapse');
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.PRESSED);await delay(25);
  pointer.notify_button(GLib.get_monotonic_time(),Clutter.BUTTON_PRIMARY,Clutter.ButtonState.RELEASED);await delay(55);
  assert(library.expanded===group,'physical click did not reopen folder after collapse');
  await delay(300);library.close();await delay(420);
  assert(group.card.has_style_class_name('app-library-has-hover'),'stationary pointer hover did not return after closing '+JSON.stringify({pointer:global.get_pointer(),cluster:group.cluster.get_transformed_position(),card:card.get_transformed_position(),visible:library.visible,mapped:library.mapped,expanded:library.expanded?.id,morphing:library._morphing,actor:global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,...global.get_pointer().slice(0,2))?.toString()}));
  assert(maxGap<400&&feedbackMs<400,'400ms responsiveness budget exceeded');
  return {anchors:true,persistentIconsOpaque:true,extraIconsFade:true,offPageHidden:true,interruptible:true,hoverAndClickRecover:true,keyboardEntry:true,brightHover:true,expandedDragBlocked:true,sortEnabled:true,feedbackMs,maxGap,samples};
 }finally{GLib.source_remove(beat);library.close(false);}
}
