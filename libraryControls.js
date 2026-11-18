import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

export const SORT_MODES=[['alphabetical','Alphabetical'],['added','Recently added'],['used','Recently used'],['custom','Custom order']];
export class LibraryControls {
 constructor(library,settings){
  this.library=library;this.settings=settings;
  const content=new St.BoxLayout({style_class:'app-library-sort-content',x_align:Clutter.ActorAlign.CENTER,y_align:Clutter.ActorAlign.CENTER});
  content.add_child(new St.Icon({icon_name:'view-sort-descending-symbolic',icon_size:20}));
  this.label=new St.Label({text:'Sort',y_align:Clutter.ActorAlign.CENTER});
  content.add_child(this.label);
  this.button=new St.Button({style_class:'button app-library-sort',can_focus:true,accessible_name:'Sort and App Library options',child:content});
  this.menu=new PopupMenu.PopupMenu(this.button,0.5,St.Side.TOP);
  Main.uiGroup.add_child(this.menu.actor);this.menu.actor.hide();
  this.manager=new PopupMenu.PopupMenuManager(this.button);this.manager.addMenu(this.menu);
  this.button.connect('clicked',()=>{this.rebuild();this.menu.toggle();});
 }
 setCompact(compact){
  if(this.compact===compact)return;
  this.compact=compact;this.label.visible=!compact;
 }
 rebuild(){
  this.menu.removeAll();
  for(const [id,label] of SORT_MODES){const item=new PopupMenu.PopupMenuItem(label);item.setOrnament(this.settings.get_string('sort-mode')===id?PopupMenu.Ornament.DOT:PopupMenu.Ornament.NONE);item.connect('activate',()=>this.settings.set_string('sort-mode',id));this.menu.addMenuItem(item);}
  this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
  this.menu.addAction('New category…',()=>this.newCategory());
  const recents=new PopupMenu.PopupSwitchMenuItem('Recents',this.settings.get_boolean('show-recents'));
  recents.connect('toggled',(_item,state)=>this.settings.set_boolean('show-recents',state));this.menu.addMenuItem(recents);
  const pin=new PopupMenu.PopupSwitchMenuItem('Pin Recents first',this.settings.get_boolean('pin-recents'));
  pin.connect('toggled',(_item,state)=>this.settings.set_boolean('pin-recents',state));this.menu.addMenuItem(pin);
 }
 newCategory(){
  this.dialog?.destroy();this.dialog=new ModalDialog.ModalDialog({styleClass:'app-library-new-category'});
  const title=new St.Label({text:'New category',style_class:'app-library-dialog-title'});
  const entry=new St.Entry({hint_text:'Category name',can_focus:true,style_class:'app-library-category-entry'});
  const error=new St.Label({text:'',style_class:'app-library-entry-error'});
  this.dialog.contentLayout.add_child(title);this.dialog.contentLayout.add_child(entry);this.dialog.contentLayout.add_child(error);
  const create=()=>{
   const name=entry.get_text().trim();
   if(!name||name.length>80){error.text='Enter a name between1 and80 characters.';return;}
   if(this.library.categories().some(c=>c.name.toLocaleLowerCase()===name.toLocaleLowerCase())){error.text='That category already exists.';return;}
   const categories=this.settings.get_value('custom-categories').deepUnpack();categories['custom-'+GLib.uuid_string_random()]=name;
   this.settings.set_value('custom-categories',new GLib.Variant('a{ss}',categories));this.dialog.close();
  };
  this.dialog.setButtons([{label:'Cancel',action:()=>this.dialog.close(),key:Clutter.KEY_Escape},{label:'Create',action:create,default:true}]);
  entry.clutter_text.connect('activate',create);this.dialog.setInitialKeyFocus(entry);this.dialog.open();
 }
 destroy(){this.dialog?.destroy();this.menu.destroy();this.button.destroy();}
}
