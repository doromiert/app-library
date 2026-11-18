import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const delay=ms=>new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,resolve));
const assert=(v,s)=>{if(!v)throw new Error(s);};
async function waitFor(check,message){for(let i=0;i<80;i++){if(check())return;await delay(25);}throw new Error(message);}
export async function run(library){
 const id='blur-my-shell@aunetx';let bms=Main.extensionManager.lookup(id);
 assert(bms?.state===1,'BMS inactive');
 const settings=bms.stateObj.getSettings().get_child('appfolder');
 const oldBlur=settings.get_boolean('blur'),oldStyle=settings.get_int('style-dialogs');
 const stackId='dash-stacks@neg-zero.com';let stacks=Main.extensionManager.lookup(stackId);
 if(!stacks){const dir=Gio.File.new_for_path(GLib.getenv('APP_LIBRARY_PREVIEW_ROOT')+'/data/gnome-shell/extensions/'+stackId);stacks=Main.extensionManager.createExtensionObject(stackId,dir,2);await Main.extensionManager.loadExtension(stacks);Main.extensionManager.enableExtension(stackId);}
 if(stacks.state===6)await Main.extensionManager.loadExtension(stacks);
 Main.extensionManager.enableExtension(stackId);
 await waitFor(()=>Main.extensionManager.lookup(stackId)?.state===1,'Dash Stacks did not enable');
 const dash=Main.extensionManager.lookup(stackId).stateObj;
 const oldStacks=dash.getSettings().get_string('stacks');
 const folder=GLib.getenv('APP_LIBRARY_PREVIEW_ROOT')+'/home/BMS fixture';GLib.mkdir_with_parents(folder,0o700);GLib.file_set_contents(folder+'/Example.txt','BMS fixture');
 try{
  settings.set_boolean('blur',true);settings.set_int('style-dialogs',3);
  library.close(false);await delay(50);
  const group=library.groups.find(g=>g.id==='Graphics'),app=group.apps[0];
  app.set_hover(true);app.ensure_style();app.icon.ensure_style();
  assert(app.get_theme_node().get_background_color().alpha===0&&app.icon.get_theme_node().get_background_color().alpha===0,'secondary collapsed hover fill '+JSON.stringify({app:app.get_theme_node().get_background_color().alpha,body:app.icon.get_theme_node().get_background_color().alpha,classes:app.style_class,bodyClasses:app.icon.style_class}));
  assert(library._hover.get_theme_node().get_border_radius(0)>0,'shared hover is not rounded');
  app.set_hover(false);library.open(group);await delay(60);
  assert(library._morphing&&library.bms.pipeline?.pipeline,'BMS detached during opening');
  assert(!library._previous.visible&&!library._next.visible,'page arrows visible during opening');
  const siblings=library._iconLayer.get_children();
  assert(siblings.indexOf(group.card)>siblings.indexOf(library.groups.find(g=>g.id==='Development').apps[0]),'expanded panel is below background icons');
  await waitFor(()=>library.bms.pipeline?.pipeline,'App Library did not attach BMS pipeline');
  assert(library.bms.pipeline.effects.length>0,'BMS effects missing');
  await delay(60);library.bms.target.ensure_style();
  assert(library.bms.target.get_theme_node().get_background_color().alpha<255,'BMS tint masked by opaque background '+JSON.stringify({style:library.bms.target.style,classes:library.bms.target.style_class,alpha:library.bms.target.get_theme_node().get_background_color().alpha}));
  const card=library.expanded.card,texture=library.expanded.apps[0].icon.icon;
  dash.getSettings().set_string('stacks',JSON.stringify([{name:'BMS fixture',path:folder,icon:'folder',autoIcon:false}]));await delay(200);
  const button=dash._buttons.find(x=>x._stackButton)?._stackButton;assert(button,'stack button missing');
  const dockItem=button._dashItem,dock=Main.overview.dash;dockItem.showLabel();
  if(dock._showLabelTimeoutId)GLib.source_remove(dock._showLabelTimeoutId);
  dock._showLabelTimeoutId=GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,100,()=>{dock._showLabelTimeoutId=0;dockItem.showLabel();});
  button._togglePopup();assert(dock._showLabelTimeoutId===0&&!dockItem.label.visible,'opening stack retained tooltip or queued callback');
  dockItem.showLabel();assert(!dockItem.label.visible,'tooltip reappeared while popup open');
  await waitFor(()=>button.popup?._bmsSurface.pipeline?.pipeline,'Dash popup did not attach BMS pipeline');
  const popup=button.popup;
  await delay(240);
  const surface=popup._bmsSurface;
  const targetBounds=surface.target.get_allocation_box(),blurBounds=surface.pipeline.actor.get_allocation_box();
  assert(Math.abs(targetBounds.x1-blurBounds.x1)<1&&Math.abs(targetBounds.y1-blurBounds.y1)<1&&Math.abs(targetBounds.get_width()-blurBounds.get_width())<1&&Math.abs(targetBounds.get_height()-blurBounds.get_height())<1,'Dash blur does not cover whole content '+JSON.stringify({target:[targetBounds.x1,targetBounds.y1,targetBounds.get_width(),targetBounds.get_height()],blur:[blurBounds.x1,blurBounds.y1,blurBounds.get_width(),blurBounds.get_height()]}));
  assert(popup._bmsSurface.pipeline.effects.length>0,'Dash blur effects missing');
  const popupPipeline=popup._bmsSurface.pipeline;
  const nested=folder+'/Nested';GLib.mkdir_with_parents(nested,0o700);GLib.file_set_contents(nested+'/Inside.txt','fixture');
  popup._navigate(nested,'Nested');await delay(100);
  assert(popup._bmsSurface.pipeline===popupPipeline,'directory navigation replaced BMS surface');
  button._pins._folderData.set('bms-preview',{name:'Apps',apps:[group.apps[0].app]});
  try{popup._navigateStack({appFolder:'bms-preview',name:'Apps'});await delay(100);assert(popup._renderCount>0&&popup._bmsSurface.pipeline===popupPipeline,'app folder view lost BMS surface');}
  finally{button._pins._folderData.delete('bms-preview');}
  for(const choice of [2,3]){settings.set_int('style-dialogs',choice);await delay(60);const c=popup._bmsSurface.target.get_theme_node().get_background_color();assert(c.red===(choice===2?255:30)&&c.alpha<255,'Dash folder light/dark material mismatch '+JSON.stringify({choice,color:[c.red,c.green,c.blue,c.alpha],style:popup._bmsSurface.target.style}));}
  settings.set_int('style-dialogs',3);
  const radius=popup._bmsSurface.pipeline.cornerRadius;assert(radius>0,'Dash corner radius not preserved');
  settings.set_boolean('blur',false);await delay(100);
  assert(!library.bms.pipeline&&!popup._bmsSurface.pipeline,'BMS toggle failed to detach');
  assert(card.get_theme_node().get_background_color().alpha===255,'App Library fallback lost opaque background');
  settings.set_boolean('blur',true);await waitFor(()=>library.bms.pipeline&&popup._bmsSurface.pipeline,'BMS toggle failed to reattach');
  assert(library.expanded.card===card&&library.expanded.apps[0].icon.icon===texture,'BMS replaced card or icon');
  Main.extensionManager.disableExtension(id);await waitFor(()=>Main.extensionManager.lookup(id).state!==1,'BMS disable failed');await delay(100);
  assert(!library.bms.pipeline,'BMS disable retained renderer');
  Main.extensionManager.enableExtension(id);await waitFor(()=>Main.extensionManager.lookup(id).state===1,'BMS reenable failed');
  await waitFor(()=>library.bms.pipeline?.pipeline,'BMS reenable failed to restore library blur');
  library.close();await delay(60);assert(!library._previous.visible&&!library._next.visible,'page arrows visible during closing');assert(library._morphing&&library.bms.pipeline?.pipeline,'BMS detached during closing');await delay(300);
  const materialChecks=[];
  for(const choice of [2,3]){
   settings.set_int('style-dialogs',choice);await delay(80);
   const group=library.groups.find(g=>g.id==='Graphics');
   const color=()=>{group.card.ensure_style();const c=group.card.get_theme_node().get_background_color();return [c.red,c.green,c.blue,c.alpha];};
   const collapsed=color(),renderer=group.bms.pipeline;assert(renderer?.pipeline,'collapsed card lacks BMS renderer');
   library.open(group);await delay(60);assert(JSON.stringify(color())===JSON.stringify(collapsed),'opening changed BMS material '+choice);
   await delay(300);assert(JSON.stringify(color())===JSON.stringify(collapsed),'expanded changed BMS material '+choice);
   library.close();await delay(60);assert(JSON.stringify(color())===JSON.stringify(collapsed),'closing changed BMS material '+choice);
   await delay(300);assert(JSON.stringify(color())===JSON.stringify(collapsed),'collapsed changed BMS material '+choice);
   assert(group.bms.pipeline===renderer,'morph replaced BMS renderer');
   assert(library.groups.every(g=>g.bms?.pipeline?.pipeline),'a background card lacks BMS renderer');
   assert(collapsed[0]===(choice===2?255:30),'wrong light/dark tint '+JSON.stringify(collapsed));
   materialChecks.push(choice===2?'light':'dark');
  }
  return {dockTooltipSuppressed:true,persistentRenderers:true,dashDirectoryAndAppFolders:true,materialChecks,singleRoundedHover:true,continuousMorph:true,bmsVersion:78,appLibraryBlur:true,dashStacksBlur:true,liveToggle:true,disableReenable:true,originalActors:true,rounded:true};
 }finally{
  settings.set_boolean('blur',oldBlur);settings.set_int('style-dialogs',oldStyle);library.close(false);
  const current=Main.extensionManager.lookup(stackId)?.stateObj;current?.getSettings().set_string('stacks',oldStacks);
 }
}
