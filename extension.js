import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import {BmsSurface} from './bmsSurface.js';
import {CategoryDrag} from './categoryDrag.js';
import {LibraryControls} from './libraryControls.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PageIndicators from 'resource:///org/gnome/shell/ui/pageIndicators.js';
import * as SwipeTracker from 'resource:///org/gnome/shell/ui/swipeTracker.js';
import * as ParentalControls from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import {CATEGORIES, categoryFor, pageLayout, previewPosition, sortButtonLayout, folderLayout} from './model.js';

const TYPE_TAG = String(GLib.get_monotonic_time());
const TILE = 128;
const ICON = 80;
const DURATION = 280;
function allocate(actor, x, y, width, height) {
    const box = new Clutter.ActorBox({x1:x, y1:y, x2:x+width, y2:y+height});
    actor._libraryBox=[x,y,width,height];
    actor.allocate(box);
}
function ease(actor, properties, animate) {
    actor.ease({...properties, duration: animate ? DURATION : 0,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
}

// Children are allocated by Library, never by a competing fixed layout.
const LibraryLayer=GObject.registerClass({GTypeName:`AppLibraryLayer${TYPE_TAG}`},class LibraryLayer extends St.Widget {
    vfunc_allocate(box){this.set_allocation(box);}
});

const LibraryIcon = GObject.registerClass({GTypeName:`AppLibraryIcon${TYPE_TAG}`}, class LibraryIcon extends AppDisplay.AppIcon {
    _init(app, library) {
        super._init(app, {isDraggable:true, expandTitleOnHover:false});
        this.library = library;
        this.add_style_class_name('app-library-app');
        this.set_pivot_point(0,0);
        this.icon.setIconSize(ICON);
        this.icon.icon.set_pivot_point(0.5,0.5);
        this.set_size(TILE, TILE);
        this.group = null;
        this.previewIndex = -1;
        this._categorySubmenu = null;
        this.connect('notify::hover',()=>{
            if(!this.library.expanded&&!this.library._isPaging&&!this.library._morphing){this.library._hoverTarget=this.hover?this:null;this.library._syncCategoryHover();this.library._layoutKey="";this.library.queue_relayout();}
        });
    }

    activate(button) {
        if (!this.library.expanded && this.previewIndex >= 3 && this.group.apps.length > 4)
            this.library.open(this.group);
        else {
            this.library.recordUse(this.app.get_id());
            super.activate(button);
        }
    }

    handleDragOver(source) {
        return this.library.canDropApp(source,this.group,this)?DND.DragMotionResult.MOVE_DROP:DND.DragMotionResult.NO_DROP;
    }
    acceptDrop(source) {return this.library.dropApp(source,this.group,this);}

    popupMenu() {
        super.popupMenu();
        if (!this._categorySubmenu) {
            this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._categorySubmenu = new PopupMenu.PopupSubMenuMenuItem('Move to category');
            this._menu.addMenuItem(this._categorySubmenu);
        }
        this._categorySubmenu.menu.removeAll();
        const original=new PopupMenu.PopupMenuItem('Original category');
        original.connect('activate',()=>this.library.moveApp(this.app.get_id(),null));
        this._categorySubmenu.menu.addMenuItem(original);
        this._categorySubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        for(const category of this.library.categories()){
            const item=new PopupMenu.PopupMenuItem(category.name);
            item.connect('activate',()=>this.library.moveApp(this.app.get_id(),category.id));
            this._categorySubmenu.menu.addMenuItem(item);
        }
        return false;
    }
});

export const Library = GObject.registerClass({GTypeName:`AppLibrarySurface${TYPE_TAG}`}, class Library extends St.Widget {
    _init(settings) {
        super._init({style_class:'app-library', reactive:true, can_focus:true, x_expand:true, y_expand:true,
            clip_to_allocation:true});
        this._settings=settings;
        this._nativeView=Main.overview._overview.controls.appDisplay;
        this._nativeConnectDnD=this._nativeView._connectDnD;
        this._nativeView._disconnectDnD();this._nativeView._connectDnD=()=>{};
        this.groups=[];
        this.icons=new Map();
        this.expanded=null;
        this.page=0;
        this.folderPage=0;
        this._pageCount=1;
        this._folderPages=1;
        this._layoutKey='';
        this._animate=false;
        this._sources=new Set();
        this._disposed=false;
        this._rootWidth=0;
        this._rootHeight=0;
        this._scrim=new St.Widget({style_class:'app-library-scrim', reactive:true, opacity:0});
        this.add_child(this._scrim);
        this._scrim.connect('button-press-event', () => { this.close(); return Clutter.EVENT_STOP; });
        this._scrim.connect('touch-event',(_actor,event)=>this._outsideTouch(event));
        this._hover=new St.Widget({style_class:'app-library-preview-hover',opacity:0});
        this._hoverTarget=null;
        this._cards=new LibraryLayer();
        this.add_child(this._cards);this.add_child(this._hover);
        this._iconLayer=new LibraryLayer();
        this.add_child(this._iconLayer);
        this.remove_child(this._scrim);this._iconLayer.add_child(this._scrim);
        this._title=new St.Label({style_class:'app-library-dialog-title', opacity:0});
        this.add_child(this._title);
        this._close=new St.Button({style_class:'button app-library-close', can_focus:true,
            accessible_name:'Close category', child:new St.Icon({icon_name:'window-close-symbolic',icon_size:16}), opacity:0});
        this._close.connect('clicked',()=>this.close());
        this.add_child(this._close);
        this._indicators=new PageIndicators.PageIndicators(Clutter.Orientation.HORIZONTAL);
        this._indicators.connect('page-activated',(_i,page)=>this.goToPage(page));
        this.add_child(this._indicators);
        this._previous=this._arrow('go-previous-symbolic',-1);
        this._next=this._arrow('go-next-symbolic',1);
        this._folderPrevious=this._arrow('go-previous-symbolic',-1);
        this._folderNext=this._arrow('go-next-symbolic',1);
        this._adjustment=new St.Adjustment({actor:this,lower:0,upper:1,value:0,page_size:1,step_increment:1,page_increment:1});
        this._adjustment.connect('notify::value',()=>{if(!this._morphing)this._positionPages();});
        this._tracker=new SwipeTracker.SwipeTracker(this,Clutter.Orientation.HORIZONTAL,Shell.ActionMode.OVERVIEW,
            {name:'App Library pages'});
        this._tracker.connect('begin',tracker=>{
            this._startPaging();
            this._adjustment.remove_transition('value');
            const pages=this.expanded?this._folderPages:this._pageCount;
            tracker.confirmSwipe(Math.max(1,this.expanded?this._panel.width:this.width),
                Array.from({length:pages},(_,i)=>i),this._adjustment.value,Math.round(this._adjustment.value));
        });
        this._tracker.connect('update',(_t,progress)=>{this._adjustment.value=progress;});
        this._tracker.connect('end',(_t,duration,end)=>this.goToPage(end,duration));
        this.connect('captured-event',(_a,event)=>event.type()===Clutter.EventType.KEY_PRESS?this._key(event):Clutter.EVENT_PROPAGATE);
        this.connect('scroll-event',(_a,event)=>{
            if(event.get_scroll_direction()===Clutter.ScrollDirection.SMOOTH)return Clutter.EVENT_PROPAGATE;
            const direction=event.get_scroll_direction();
            this.goToPage(this._adjustment.value+([Clutter.ScrollDirection.UP,Clutter.ScrollDirection.LEFT].includes(direction)?-1:1));
            return Clutter.EVENT_STOP;
        });
        this._settings.connectObject('changed::category-overrides',()=>this.queueRefresh(),this);
        Shell.AppSystem.get_default().connectObject('installed-changed',()=>this.queueRefresh(),this);
        ParentalControls.getDefault().connectObject('app-filter-changed',()=>this.queueRefresh(),this);
        this.connect('destroy',()=>this._dispose());
        this._delegate=this;this.categoryDrag=new CategoryDrag(this);
        // Each category retains its renderer while collapsed, expanded and reparented.
        const library=this;
        this.bms={
            get pipeline(){return (library.expanded??library._morphGroup)?.bms?.pipeline??null;},
            get target(){return (library.expanded??library._morphGroup)?.bms?.target??null;},
            refresh:()=>{for(const group of this.groups){group.bms??=new BmsSurface(()=>group.card,()=>true,true);group.bms.refresh();group.bms.restack();}},
            allocate:()=>{for(const group of this.groups)group.bms?.allocate();},
            destroy:()=>{for(const group of this.groups)group.bms?.destroy();},
        };
        this.bms.refresh();
        this.controls=new LibraryControls(this,this._settings);this._iconLayer.add_child(this.controls.button);
        for(const arrow of [this._previous,this._next]){this.remove_child(arrow);this._iconLayer.add_child(arrow);}
        for(const key of ['sort-mode','custom-categories','custom-order','category-order','show-recents','pin-recents'])
            this._settings.connectObject('changed::'+key,()=>this.queueRefresh(),this);
        Shell.WindowTracker.get_default().connectObject('notify::focus-app',tracker=>{
            const app=tracker.focus_app;if(app)this.recordUse(app.get_id());
        },this);
        Main.overview.connectObject('showing',()=>this.queueRefresh(),this);
        Main.overview.connectObject('item-drag-begin',()=>{this._itemDragging=true;},
            'item-drag-end',()=>{this._itemDragging=false;if(this._refreshAfterDrag){this._refreshAfterDrag=false;this.queueRefresh();}},this);
        Main.layoutManager.connectObject('monitors-changed',()=>this.queueRefresh(),this);
        this.queueRefresh();
    }

    _arrow(icon,direction) {
        const button=new St.Button({style_class:'button app-library-page-arrow',can_focus:true,
            accessible_name:direction<0?'Previous page':'Next page',
            child:new St.Icon({icon_name:icon,icon_size:20})});
        button.connect('clicked',()=>this.goToPage((this.expanded?this.folderPage:this.page)+direction));
        this.add_child(button);
        return button;
    }

    queueRefresh() {
        if(this._itemDragging){this._refreshAfterDrag=true;return;}
        if(this._refreshId || this._disposed)return;
        this._refreshId=GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{
            this._refreshId=0;if(this._itemDragging)this._refreshAfterDrag=true;else this.refresh();return GLib.SOURCE_REMOVE;
        });
    }

    _dropGroupAt(x,y){
        if(this.expanded||!Number.isFinite(x)||!Number.isFinite(y))return null;
        return this.groups.find(group=>group.page===this.page&&x>=group.card.translation_x&&
            x<group.card.translation_x+group.card.width&&y>=group.card.translation_y&&
            y<group.card.translation_y+246)??null;
    }
    handleDragOver(source,_actor,x,y){
        if(source instanceof LibraryIcon){const group=this._dropGroupAt(x,y);return group&&this.canDropApp(source,group)?DND.DragMotionResult.MOVE_DROP:DND.DragMotionResult.CONTINUE;}
        return source?._libraryCategory&&this.categoryDrag.state?DND.DragMotionResult.MOVE_DROP:DND.DragMotionResult.NO_DROP;
    }
    acceptDrop(source,_actor,x,y){
        if(source instanceof LibraryIcon){const group=this._dropGroupAt(x,y);return group?this.dropApp(source,group):false;}
        return source?._libraryCategory?this.categoryDrag.finish(true):false;
    }

    categories(){
        const custom=this._settings.get_value('custom-categories').deepUnpack();
        return [...CATEGORIES,...Object.entries(custom).map(([id,name])=>({id,name}))];
    }
    recordUse(id){
        const used=this._settings.get_value('recently-used').deepUnpack();
        used[id]=Object.values(used).reduce((latest,value)=>Math.max(latest,value+1),Date.now());
        this._settings.set_value('recently-used',new GLib.Variant('a{sx}',used));
        if(!Main.overview.visible||this.expanded?.id==='Recents')this.queueRefresh();
    }
    canDropApp(source,group,target=null){
        return source instanceof LibraryIcon&&source.library===this&&group.id!=='Recents'&&
            (source.group!==group||target&&this.canReorderApp(source,target));
    }
    dropApp(source,group,target=null){
        if(!this.canDropApp(source,group,target))return false;
        if(source.group!==group){this.moveApp(source.app.get_id(),group.id);return true;}
        return this.reorderApp(source,target);
    }
    canReorderApp(source,target){
        return this._settings.get_string('sort-mode')==='custom'&&source instanceof LibraryIcon&&source!==target&&source.group===target.group;
    }
    reorderApp(source,target){
        if(!this.canReorderApp(source,target))return false;
        const ids=target.group.apps.map(a=>a.app.get_id()).filter(id=>id!==source.app.get_id());
        ids.splice(ids.indexOf(target.app.get_id()),0,source.app.get_id());
        const order=this._settings.get_value('custom-order').deepUnpack();order[target.group.id]=ids;
        this._settings.set_value('custom-order',new GLib.Variant('a{sas}',order));return true;
    }
    reorderCategory(source,target){
        if(this._settings.get_string('sort-mode')!=='custom'||!source?._libraryCategory||source._libraryCategory===target)return false;
        if(this._settings.get_boolean('pin-recents')&&source._libraryCategory.id==='Recents')return false;
        const ids=this.groups.map(g=>g.id).filter(id=>id!==source._libraryCategory.id);
        ids.splice(ids.indexOf(target.id),0,source._libraryCategory.id);this._settings.set_strv('category-order',ids);return true;
    }

    refresh() {
        const expandedId=this.expanded?.id;
        this.categoryDrag?.finish(false);
        this._resetPresentation();
        const overrides=this._settings.get_value('category-overrides').deepUnpack();
        const parentFilter=ParentalControls.getDefault();
        const stacks=Main.extensionManager.lookup('dash-stacks@neg-zero.com')?.stateObj?._appFolderPins?.contents?.hidden;
        const appSystem=Shell.AppSystem.get_default();
        const apps=appSystem.get_installed().filter(info=>
            info.should_show() && parentFilter.shouldShowApp(info) && !stacks?.has(info.get_id())
        ).map(info=>appSystem.lookup_app(info.get_id())).filter(Boolean).sort((a,b)=>a.get_name().localeCompare(b.get_name()));
        const mode=this._settings.get_string('sort-mode');
        const used=this._settings.get_value('recently-used').deepUnpack();
        const seen=this._settings.get_value('first-seen').deepUnpack();let changedSeen=false;
        const observed=Date.now();
        for(const app of apps)if(!seen[app.get_id()]){seen[app.get_id()]=observed;changedSeen=true;}
        if(changedSeen)this._settings.set_value('first-seen',new GLib.Variant('a{sx}',seen));
        const monitor=Main.layoutManager.primaryMonitor;
        const recentLimit=folderLayout(monitor.width,monitor.height).capacity;
        const recentApps=this._settings.get_boolean('show-recents')?apps.filter(a=>used[a.get_id()]).sort((a,b)=>used[b.get_id()]-used[a.get_id()]).slice(0,recentLimit):[];
        const present=new Set([...apps.map(a=>a.get_id()),...recentApps.map(a=>'recents:'+a.get_id())]);
        for(const [id,icon] of this.icons){
            if(!present.has(id)){icon.destroy();this.icons.delete(id);}
        }
        for(const group of this.groups)group.bms?.destroy();
        for(const group of this.groups){group.card.destroy();group.label.destroy();group.cluster.destroy();}
        this.groups=[];
        const buckets=new Map(this.categories().map(c=>[c.id,{...c,apps:[]} ]));
        for(const app of apps){
            const override=overrides[app.get_id()];
            const category=buckets.has(override)?override:categoryFor(app.get_app_info().get_categories());
            const group=buckets.get(category);
            let icon=this.icons.get(app.get_id());
            if(!icon){icon=new LibraryIcon(app,this);this.icons.set(app.get_id(),icon);this._iconLayer.add_child(icon);}
            icon.group=group;icon.previewIndex=group.apps.length;group.apps.push(icon);
        }
        if(this._settings.get_boolean('show-recents')){
            const group={id:'Recents',name:'Recents',apps:[]};buckets.set(group.id,group);
            for(const app of recentApps){const key='recents:'+app.get_id();let icon=this.icons.get(key);
                if(!icon){icon=new LibraryIcon(app,this);this.icons.set(key,icon);this._iconLayer.add_child(icon);}
                icon.group=group;group.apps.push(icon);
            }
        }
        const orders=this._settings.get_value('custom-order').deepUnpack();
        for(const group of buckets.values()){
            if(!group.apps.length&&group.id!=='Recents'&&!group.id.startsWith('custom-'))continue;
            const rank=orders[group.id]??[];
            group.apps.sort((a,b)=>{
                const aid=a.app.get_id(),bid=b.app.get_id();
                if(group.id==='Recents'||mode==='used')return (used[bid]??0)-(used[aid]??0)||a.app.get_name().localeCompare(b.app.get_name());
                if(mode==='added')return (seen[bid]??0)-(seen[aid]??0)||a.app.get_name().localeCompare(b.app.get_name());
                if(mode==='custom')return (rank.includes(aid)?rank.indexOf(aid):1e6)-(rank.includes(bid)?rank.indexOf(bid):1e6)||a.app.get_name().localeCompare(b.app.get_name());
                return a.app.get_name().localeCompare(b.app.get_name());
            });
            group.apps.forEach((a,i)=>{a.previewIndex=i;});
            group.card=new St.Button({style_class:'app-library-card',can_focus:true,accessible_name:group.name});
            group.card.set_size(208,208);group.card._libraryDynamicSize=true;
            if(group.id==='Recents'&&!group.apps.length){
                group.emptyIcon=new St.Icon({icon_name:'document-open-recent-symbolic',icon_size:64,
                    x_align:Clutter.ActorAlign.CENTER,y_align:Clutter.ActorAlign.CENTER,opacity:128});
                group.card.set_child(group.emptyIcon);
                group.card.accessible_name='Recents — no recently opened apps';
            }
            group.card.connect('clicked',()=>this.open(group));
            group.card.connect('notify::hover',()=>this._syncCategoryHover());
            group.card._delegate={_libraryCategory:group,
                getDragActor:()=>this.categoryDrag.preview(group),
                getDragActorSource:()=>group.card,
                handleDragOver:source=>this.canDropApp(source,group)||this._settings.get_string('sort-mode')==='custom'&&source?._libraryCategory?DND.DragMotionResult.MOVE_DROP:DND.DragMotionResult.NO_DROP,
                acceptDrop:source=>source instanceof LibraryIcon?this.dropApp(source,group):this.categoryDrag.state?this.categoryDrag.finish(true):this.reorderCategory(source,group)};
            if(mode==='custom'&&!(group.id==='Recents'&&this._settings.get_boolean('pin-recents'))){
                group.draggable=DND.makeDraggable(group.card);
                group.draggable.connect('drag-end',()=>this.categoryDrag.finish(false));
                group.draggable.connect('drag-cancelled',()=>this.categoryDrag.finish(false));
            }
            group.label=new St.Label({text:group.name,style_class:'app-library-category-label',x_align:Clutter.ActorAlign.CENTER});
            group.label.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
            group.label.clutter_text.set({x_align:Clutter.ActorAlign.CENTER,y_align:Clutter.ActorAlign.CENTER});
            group.cluster=new St.Button({style_class:'app-library-cluster',can_focus:true,accessible_name:`Open ${group.name}`});
            group.cluster.connect('clicked',()=>this.open(group));
            group.cluster.connect('notify::hover',()=>this._syncCategoryHover());
            this._cards.add_child(group.card);this._cards.add_child(group.label);this._iconLayer.add_child(group.cluster);this.groups.push(group);
        }
        const categoryOrder=this._settings.get_strv('category-order');
        const score=(group,times)=>Math.max(0,...group.apps.map(a=>times[a.app.get_id()]??0));
        this.groups.sort((a,b)=>{
            if(this._settings.get_boolean('pin-recents')&&(a.id==='Recents'||b.id==='Recents'))return a.id==='Recents'?-1:1;
            if(mode==='custom')return (categoryOrder.includes(a.id)?categoryOrder.indexOf(a.id):1e6)-(categoryOrder.includes(b.id)?categoryOrder.indexOf(b.id):1e6)||a.name.localeCompare(b.name);
            if(mode==='used'||mode==='added')return score(b,mode==='used'?used:seen)-score(a,mode==='used'?used:seen)||a.name.localeCompare(b.name);
            return a.id==='Other'?1:b.id==='Other'?-1:a.name.localeCompare(b.name);
        });
        this.expanded=this.groups.find(g=>g.id===expandedId)??null;
        if(this.expanded){
            this._morphGroup=this.expanded;
            this._raiseGroup(this.expanded);
            this._lift(true);
        }
        this.bms?.refresh();
        this._layoutKey='';this.queue_relayout();
    }

    moveApp(id,category) {
        if(category!==null && !this.categories().some(c=>c.id===category))return;
        const overrides=this._settings.get_value('category-overrides').deepUnpack();
        if(category===null)delete overrides[id];else overrides[id]=category;
        this._settings.set_value('category-overrides',new GLib.Variant('a{ss}',overrides));
    }

    open(group) {
        if(this._disposed||!this.groups.includes(group)||this.expanded===group)return;
        this._beginMorph(group);
        this._iconLayer.remove_clip();
        this._lift(true);
        this.expanded=group;this.folderPage=0;
        this._adjustment.remove_transition('value');this._adjustment.value=0;
        this._layoutKey='';this._animate=true;this.queue_relayout();
        this._finishMorph(()=>this.grab_key_focus());
    }

    close(animate=true) {
        if(!animate){this._resetPresentation();return;}
        if(!this.expanded){if(this._lifted)this._resetPresentation();return;}
        this._beginMorph(this.expanded);
        this._iconLayer.remove_clip();
        this.expanded=null;
        this._adjustment.remove_transition('value');this._adjustment.upper=this._pageCount;this._adjustment.value=this.page;
        this._layoutKey='';this._animate=true;this.queue_relayout();
        this._finishMorph(()=>{this._lift(false);global.stage.set_key_focus(null);});
    }

    _resetPresentation(){
        if(this._disposed)return;
        // Settings can remove the expanded category or interrupt its morph.
        // Always return the surface to the overview, even if expanded is null.
        this._morphSerial=(this._morphSerial??0)+1;
        for(const id of this._sources)GLib.source_remove(id);
        this._sources.clear();this._adjustment.remove_transition('value');
        const stop=actor=>{actor.remove_all_transitions();for(const child of actor.get_children())stop(child);};
        for(const child of this.get_children())stop(child);
        this._morphing=false;this._isPaging=false;this._animate=false;
        this.remove_style_class_name('app-library-morphing');this.remove_style_class_name('app-library-paging');
        if(this.groups.includes(this._morphGroup))this._morphGroup.card.remove_style_class_name('app-library-morph-card');
        this._restoreCardLayer();
        this.expanded=null;this._morphGroup=null;
        if(this._lifted)this._lift(false);
        this._iconLayer.remove_clip();this._scrim.opacity=0;this._scrim.reactive=false;
        this._close.opacity=0;this._close.reactive=false;this._close.can_focus=false;
        this._folderPrevious.hide();this._folderNext.hide();this._clearHover();
        this._adjustment.upper=this._pageCount;this._adjustment.value=this.page;
        this._layoutKey='';this.queue_relayout();
    }

    _beginMorph(group) {
        this._morphGroup=group;this._morphFolderPage=this.folderPage;
        this._folderPrevious.hide();this._folderNext.hide();
        this._raiseGroup(group);
        this._morphing=true;this.bms?.refresh();this.add_style_class_name("app-library-morphing");
        group.card.add_style_class_name("app-library-morph-card");
        this._clearHover();
        this._morphing=true;this._morphSerial=(this._morphSerial??0)+1;
        this._adjustment.remove_transition('value');this._hover.opacity=0;
    }
    _raiseGroup(group){
        this._iconLayer.set_child_above_sibling(this._scrim,null);
        // Keep the actual card above background apps, without moving any app actor.
        for(const actor of [group.card,group.label]){
            if(actor.get_parent()!==this._iconLayer){actor.get_parent().remove_child(actor);this._iconLayer.add_child(actor);}
            this._iconLayer.set_child_above_sibling(actor,null);
        }
        for(const icon of group.apps){icon.remove_clip();this._iconLayer.set_child_above_sibling(icon,null);}
        if(group===this.expanded)for(const icon of group.apps.slice(0,7))this._iconLayer.set_child_above_sibling(icon,null);
    }
    _finishMorph(callback) {
        const serial=this._morphSerial;
        this._later(()=>{
            if(serial!==this._morphSerial)return;
            this._morphing=false;callback();this._setPageClip();
            this.remove_style_class_name("app-library-morphing");
            this._morphGroup?.card.remove_style_class_name("app-library-morph-card");
            for(const group of this.groups)group.cluster.visible=!this.expanded&&!this._morphing&&group.apps.length>4;
            for(const icon of this.icons.values()){
                icon._libraryVisible=icon.group===this.expanded||previewPosition(icon.previewIndex,icon.group.apps.length).visible;
                icon.opacity=icon._libraryVisible?255:0;
                icon.icon.label.opacity=this.expanded&&icon.group===this.expanded?255:0;
                icon._morphSuppressed=false;
            }
            if(!this.expanded)this._restoreCardLayer();
            this._positionPages();this.bms?.refresh();
        },DURATION+24);
    }
    _restoreCardLayer(){
        const group=this._morphGroup;
        if(!group||!this.groups.includes(group))return;
        for(const actor of [group.card,group.label]){
            const parent=actor.get_parent();
            if(parent&&parent!==this._cards){parent.remove_child(actor);this._cards.add_child(actor);}
        }
        group.bms?.restack();
    }

    _setPageClip() {
        this._iconLayer.remove_clip();
        if(!this.expanded||!this._panel||this._morphing)return;
        const p=this._panel;
        for(const icon of this.expanded.apps){
            // Clip only the foreground apps; background categories stay untouched.
            const left=Math.max(0,p.x-icon.translation_x),top=Math.max(0,p.y+64-icon.translation_y);
            const right=Math.min(TILE,p.x+p.width-icon.translation_x),bottom=Math.min(TILE,p.y+p.height-44-icon.translation_y);
            icon.set_clip(left,top,Math.max(0,right-left),Math.max(0,bottom-top));
        }
    }

    _lift(open) {
        let [oldX,oldY]=this.get_transformed_position();
        const monitor=Main.layoutManager.primaryMonitor;
        if(!Number.isFinite(oldX)||!Number.isFinite(oldY))
            [oldX,oldY]=this._lifted?[monitor.x,monitor.y]:(this._homeOrigin??[monitor.x,monitor.y]);
        if(open){
            if(this._lifted)return;
            this._homeOrigin=[oldX,oldY];
            this._homeGeometry={x:oldX-monitor.x,y:oldY-monitor.y,width:this._homeAllocation?.width??this._rootWidth,height:this._homeAllocation?.height??this._rootHeight};
            this._lifted=true;
            this._homeParent=this.get_parent();
            this._homeParent.remove_child(this);Main.uiGroup.add_child(this);
            this.set_position(monitor.x,monitor.y);this.set_size(monitor.width,monitor.height);
        }else if(this._homeParent){
            this.get_parent().remove_child(this);this._homeParent.add_child(this);
            this.set_position(0,0);this.fixed_position_set=false;this.set_size(-1,-1);
            this._lifted=false;this._layoutKey="";this._homeParent.queue_relayout();
        }
        const [newX,newY]=open
            ? [Main.layoutManager.primaryMonitor.x,Main.layoutManager.primaryMonitor.y]
            : this._homeOrigin;
        for(const actor of [...this._cards.get_children(),...this._iconLayer.get_children()]){
            if(actor._zenosBmsSurface||actor===this._scrim)continue;
            actor.remove_all_transitions();actor.translation_x+=oldX-newX;actor.translation_y+=oldY-newY;
        }
    }

    _later(callback,ms) {
        const id=GLib.timeout_add(GLib.PRIORITY_DEFAULT,ms,()=>{this._sources.delete(id);if(!this._disposed)callback();return GLib.SOURCE_REMOVE;});
        this._sources.add(id);
    }

    _syncCategoryHover(){
        for(const group of this.groups){
            const hover=!this.expanded&&!this._morphing&&!this._isPaging&&
                (group.card.hover||group.cluster.hover||group.apps.some(app=>app.hover));
            if(hover)group.card.add_style_class_name('app-library-has-hover');
            else group.card.remove_style_class_name('app-library-has-hover');
        }
    }

    _clearHover() {
        this._hoverTarget=null;this._hover.remove_all_transitions();this._hover.opacity=0;
        for(const icon of this.icons.values())icon.set_hover(false);
        for(const group of this.groups){group.card.set_hover(false);group.cluster.set_hover(false);group.card.remove_style_class_name('app-library-has-hover');}
    }
    _startPaging() {
        this._isPaging=true;this._clearHover();this.add_style_class_name('app-library-paging');
    }
    _finishPaging() {
        this._isPaging=false;this.remove_style_class_name('app-library-paging');
        this._clearHover();
        const [x,y]=global.get_pointer();
        let picked=global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,x,y);
        for(let actor=picked;actor&&actor!==this;actor=actor.get_parent()){
            if(actor instanceof LibraryIcon&&actor.library===this&&actor.reactive){
                actor.set_hover(true);if(!this.expanded)this._hoverTarget=actor;break;
            }
            if(this.groups.some(group=>actor===group.card||actor===group.cluster)){actor.set_hover(true);break;}
        }
        this._layoutKey='';this.queue_relayout();
    }

    goToPage(page,duration=250) {
        if(this._morphing)return;
        this._startPaging();
        const count=this.expanded?this._folderPages:this._pageCount;
        page=Math.max(0,Math.min(count-1,Math.round(page)));
        if(this.expanded)this.folderPage=page;else this.page=page;
        this._adjustment.ease(page,{duration,mode:Clutter.AnimationMode.EASE_OUT_CUBIC,onComplete:()=>this._finishPaging()});
    }

    _outsideTouch(event){
        const type=event.type(),[x,y]=event.get_coords(),sequence=event.get_event_sequence();
        if(type===Clutter.EventType.TOUCH_BEGIN){if(this._outsideTap){this._outsideTap.moved=true;return Clutter.EVENT_STOP;}this._outsideTap={x,y,sequence,moved:false};return Clutter.EVENT_STOP;}
        const tap=this._outsideTap;
        if(!tap||tap.sequence!==sequence)return Clutter.EVENT_PROPAGATE;
        if(Math.hypot(x-tap.x,y-tap.y)>12)tap.moved=true;
        if(type===Clutter.EventType.TOUCH_CANCEL){this._outsideTap=null;return Clutter.EVENT_STOP;}
        if(type===Clutter.EventType.TOUCH_END){this._outsideTap=null;if(!tap.moved&&this.expanded)this.close();return Clutter.EVENT_STOP;}
        return Clutter.EVENT_PROPAGATE;
    }

    _key(event) {
        const key=event.get_key_symbol();
        if(this.expanded){
            const apps=this.expanded.apps.slice(this.folderPage*this._folderCapacity,(this.folderPage+1)*this._folderCapacity);
            const focus=global.stage.get_key_focus(),index=apps.findIndex(app=>app===focus||Boolean(focus&&app.contains(focus)));
            const directions=new Map([[Clutter.KEY_Left,-1],[Clutter.KEY_Right,1],[Clutter.KEY_Up,-this._folderColumns],[Clutter.KEY_Down,this._folderColumns]]);
            if(directions.has(key)&&apps.length){apps[Math.max(0,Math.min(apps.length-1,index<0?0:index+directions.get(key)))].grab_key_focus();return Clutter.EVENT_STOP;}
            if([Clutter.KEY_Tab,Clutter.KEY_ISO_Left_Tab].includes(key)){
                const targets=[...apps,this._close],current=targets.indexOf(focus);
                const backward=key===Clutter.KEY_ISO_Left_Tab||Boolean(event.get_state()&Clutter.ModifierType.SHIFT_MASK);
                targets[(current+(backward?-1:1)+targets.length)%targets.length].grab_key_focus();return Clutter.EVENT_STOP;
            }
            if(index<0&&apps.length&&[Clutter.KEY_Return,Clutter.KEY_KP_Enter,Clutter.KEY_space].includes(key)){apps[0].grab_key_focus();return Clutter.EVENT_STOP;}
        }
        if(key===Clutter.KEY_Escape && this.expanded){this.close();return Clutter.EVENT_STOP;}
        if([Clutter.KEY_Page_Down,Clutter.KEY_Page_Up].includes(key)){
            this.goToPage(this._adjustment.value+(key===Clutter.KEY_Page_Down?1:-1));return Clutter.EVENT_STOP;
        }
        if(key===Clutter.KEY_Home){this.goToPage(0);return Clutter.EVENT_STOP;}
        if(key===Clutter.KEY_End){this.goToPage((this.expanded?this._folderPages:this._pageCount)-1);return Clutter.EVENT_STOP;}
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_get_preferred_width(){return [0,0];}
    vfunc_get_preferred_height(){return [0,0];}

    vfunc_allocate(box) {
        this.set_allocation(box);
        const w=box.get_width(),h=box.get_height();
        if(!this._lifted&&w>0&&h>0)this._homeAllocation={width:w,height:h};
        const home=this._lifted?this._homeGeometry:{x:0,y:0,width:w,height:h};
        const cacheKey=`${w}:${h}:${this.expanded?.id}:${pageLayout(home.width,home.height).capacity}:${this.groups.length}`;
        if(cacheKey===this._layoutKey&&!this._animate){
            const reallocate=actor=>{
                if(actor._libraryBox){const [x,y,bw,bh]=actor._libraryBox;allocate(actor,x,y,actor._libraryDynamicSize?actor.width:bw,actor._libraryDynamicSize?actor.height:bh);}
                for(const child of actor.get_children())reallocate(child);
            };
            for(const child of this.get_children())reallocate(child);
            this.bms?.allocate();return;
        }
        this.controls.button.visible=true;
        this.controls.button.reactive=!this.expanded&&!this._morphing;this.controls.button.can_focus=this.controls.button.reactive;
        this._rootWidth=home.width;this._rootHeight=h;
        allocate(this._cards,0,0,w,h);allocate(this._iconLayer,0,0,w,h);allocate(this._scrim,0,0,w,h);
        const layout=pageLayout(home.width,home.height);
        this._pageCount=Math.max(1,Math.ceil(this.groups.length/layout.capacity));
        const {panelWidth,panelHeight,columns,rows,capacity}=folderLayout(w,h);
        const panel={x:(w-panelWidth)/2,y:(h-panelHeight)/2,width:panelWidth,height:panelHeight};
        this._panel=panel;
        this._folderCapacity=capacity;this._folderColumns=columns;
        this._folderPages=this.expanded?Math.max(1,Math.ceil(this.expanded.apps.length/this._folderCapacity)):1;
        this.page=Math.min(this.page,this._pageCount-1);this.folderPage=Math.min(this.folderPage,this._folderPages-1);
        const count=this.expanded?this._folderPages:this._pageCount;
        this._adjustment.upper=count;
        this._indicators.setNPages(count);
        const indicatorY=this.expanded?panel.y+panelHeight-48:h-32;
        const [,indicatorWidth]=this._indicators.get_preferred_width(-1);
        allocate(this._indicators,(w-indicatorWidth)/2,indicatorY,indicatorWidth,32);
        allocate(this._previous,home.x+24,home.y+home.height/2-20,40,40);
        allocate(this._next,home.x+home.width-64,home.y+home.height/2-20,40,40);
        allocate(this._folderPrevious,panel.x+24,h/2-20,40,40);
        allocate(this._folderNext,panel.x+panelWidth-64,h/2-20,40,40);
        allocate(this._close,panel.x+panelWidth-52,panel.y+16,36,36);
        allocate(this._title,panel.x+64,panel.y+22,panelWidth-128,36);
        this._title.text='';
        this._close.reactive=Boolean(this.expanded);this._close.can_focus=Boolean(this.expanded);
        ease(this._close,{opacity:this.expanded?255:0},this._animate);
        this._title.opacity=0;
        ease(this._scrim,{opacity:this.expanded?255:0},this._animate);
        this._scrim.reactive=Boolean(this.expanded);
        const key=`${w}:${h}:${this.expanded?.id}:${layout.capacity}:${this.groups.length}`;
        const changed=key!==this._layoutKey;this._layoutKey=key;
        const x0=home.x+(home.width-layout.columns*240+32)/2;
        const y0=home.y+Math.round(Math.max(8,(home.height-40-layout.rows*256)/2));
        const visibleCards=this.groups.slice(this.page*layout.capacity,(this.page+1)*layout.capacity).map((_g,i)=>({
            x:x0+(i%layout.columns)*240,y:y0+Math.floor(i/layout.columns)*256,width:208,height:208}));
        const sort=sortButtonLayout(home.width,visibleCards.map(card=>({...card,x:card.x-home.x,y:card.y-home.y})));
        this.controls.setCompact(sort.compact);
        allocate(this.controls.button,home.x+sort.x,home.y+sort.y,sort.width,sort.height);
        this.groups.forEach((group,index)=>{
            if(group._dragging){group.page=Math.floor(index/layout.capacity);return;}
            if(this._morphing&&group!==this._morphGroup){
                allocate(group.card,0,0,group.card.width,group.card.height);
                allocate(group.label,0,0,224,28);allocate(group.cluster,0,0,88,88);
                const opacity=255;
                if(changed){ease(group.card,{opacity},this._animate);ease(group.label,{opacity},this._animate);}
                group.card.reactive=false;group.cluster.reactive=false;
                for(const icon of group.apps){
                    allocate(icon,0,0,TILE,TILE);icon.reactive=false;
                    if(changed)ease(icon,{opacity:previewPosition(icon.previewIndex,group.apps.length).visible?255:0},this._animate);
                }
                return;
            }
            group.page=Math.floor(index/layout.capacity);
            const slot=index%layout.capacity;
            group.x=x0+(slot%layout.columns)*240;
            group.y=y0+Math.floor(slot/layout.columns)*256;
            allocate(group.card,0,0,group.card.width,group.card.height);allocate(group.label,0,0,224,this.expanded===group?36:28);
            const selected=this.expanded===group;
            group.card.reactive=selected||!this.expanded;group.card.can_focus=!this.expanded;
            if(changed){
                if(selected){group.card.add_style_class_name('app-library-expanded');group.label.add_style_class_name('app-library-expanded-title');}
                else{group.card.remove_style_class_name('app-library-expanded');group.label.remove_style_class_name('app-library-expanded-title');}
            }
            if(changed){
                ease(group.card,{translation_x:selected?panel.x:group.x+(group.page-this.page)*home.width,
                    translation_y:selected?panel.y:group.y,scale_x:1,
                    scale_y:1,width:selected?panelWidth:208,height:selected?panelHeight:208,opacity:255},this._animate);
                ease(group.label,{translation_x:selected?panel.x+panelWidth/2-112:group.x-8+(group.page-this.page)*home.width,translation_y:selected?panel.y+22:group.y+218,
                    opacity:255},this._animate);
            }
            allocate(group.cluster,0,0,88,88);
            group.cluster.translation_x=group.x+108+(group.page-this.page)*home.width;group.cluster.translation_y=group.y+108;
            group.cluster.visible=!this.expanded&&!this._morphing&&group.apps.length>4;
            group.cluster.reactive=group.cluster.visible&&group.page===this.page;
            group.apps.forEach((icon,i)=>{
                allocate(icon,0,0,TILE,TILE);
                const preview=previewPosition(i,group.apps.length);
                const page=Math.floor(i/this._folderCapacity),slot=i%this._folderCapacity;
                const expandedX=panel.x+(panelWidth-columns*144+16)/2+(slot%columns)*144;
                const expandedY=panel.y+80+Math.floor(slot/columns)*144;
                const scale=selected?1:preview.size/ICON;
                icon._libraryX=selected?expandedX:group.x+preview.x-23*scale;
                icon._libraryY=selected?expandedY:group.y+preview.y-11*scale;
                icon._libraryPage=selected?page:group.page;
                icon._libraryStride=selected?panelWidth:home.width;
                icon._libraryVisible=selected||preview.visible;
                icon.reactive=icon._libraryVisible && (selected?page===this.folderPage:group.page===this.page);
                icon.reactive=icon.reactive&&(selected||i<3||group.apps.length<=4);
                icon.can_focus=icon.reactive;
                if(selected){icon.remove_clip();icon.remove_style_class_name('app-library-collapsed-app');if(changed)icon.style=null;}
                else{icon.set_clip(19,7,88,88);icon.add_style_class_name('app-library-collapsed-app');if(changed)icon.style='background-color: transparent; box-shadow: none;';}
                const morphPage=this.expanded?this.folderPage:this._morphFolderPage;
                const suppress=this._morphing&&group===this._morphGroup&&page!==morphPage;
                if(suppress){icon.opacity=0;icon._morphSuppressed=true;}
                if(changed){
                    if(this._morphing)icon.opacity=suppress?0:255;
                    ease(icon,{translation_x:icon._libraryX+(icon._libraryPage-(selected?this.folderPage:this.page))*icon._libraryStride,
                        translation_y:icon._libraryY,scale_x:scale,scale_y:scale,
                        },this._animate);
                    if(!this._morphing)icon.opacity=icon._libraryVisible?255:0;
                    const artworkScale=!selected&&preview.size===80?0.9:1;
                    ease(icon.icon.icon,{scale_x:artworkScale,scale_y:artworkScale},this._animate);
                    ease(icon.icon.label,{opacity:selected?255:0},this._animate);
                    ease(icon._dot,{opacity:selected?255:0},this._animate);
                }
            });
        });
        if(changed&&!this._morphing)this._setPageClip();
        const hover=this._hoverTarget;
        this._hover.opacity=hover&&!this.expanded&&!this._isPaging&&!this._morphing?255:0;
        if(hover&&!this.expanded){
            const scale=hover.scale_x;
            allocate(this._hover,0,0,88*scale,88*scale);
            this._hover.translation_x=hover.translation_x+19*scale;
            this._hover.translation_y=hover.translation_y+7*scale;
        }else allocate(this._hover,0,0,1,1);
        this._animate=false;
        if(changed && !this._morphing)
            this._positionPages();
        this.bms?.allocate();
    }

    _positionPages() {
        if(!this._panel||this._morphing)return;
        const progress=this._adjustment.value;
        this._indicators.setCurrentPosition(progress);
        const count=this.expanded?this._folderPages:this._pageCount;
        const gridProgress=this.expanded?this.page:progress;
        this._previous.visible=this._pageCount>1&&gridProgress>0.01;
        this._next.visible=this._pageCount>1&&gridProgress<this._pageCount-1.01;
        this._previous.reactive=this._next.reactive=!this.expanded;
        this._previous.can_focus=this._next.can_focus=!this.expanded;
        this._folderPrevious.visible=Boolean(this.expanded)&&count>1&&progress>0.01;
        this._folderNext.visible=Boolean(this.expanded)&&count>1&&progress<count-1.01;
        for(const group of this.groups){
            if(group._dragging)continue;
            if(!this.expanded){
                group.card.translation_x=group.x+(group.page-progress)*this._rootWidth;
                group.label.translation_x=group.x-8+(group.page-progress)*this._rootWidth;
                group.cluster.translation_x=group.x+108+(group.page-progress)*this._rootWidth;
            }
            for(const icon of group.apps){
                if(this.expanded && group!==this.expanded)continue;
                icon.translation_x=icon._libraryX+(icon._libraryPage-progress)*icon._libraryStride;
                icon.reactive=icon._libraryVisible&&Math.abs(icon._libraryPage-progress)<0.1&&(Boolean(this.expanded)||icon.previewIndex<3||group.apps.length<=4);
                icon.can_focus=icon.reactive;
            }
        }
        this._setPageClip();
    }

    snapshot() {
        return {expanded:this.expanded?.id??null,page:this.page,folderPage:this.folderPage,
            pages:this._pageCount,folderPages:this._folderPages,icons:this.icons.size,
            size:[this.width,this.height],groups:this.groups.map(g=>({id:g.id,name:g.name,count:g.apps.length,page:g.page,previews:g.apps.slice(0,7).map(a=>({id:a.app.get_id(),position:a.icon.icon.get_transformed_position(),size:a.icon.icon.get_transformed_size()})),
                position:g.card.get_transformed_position(),size:g.card.get_transformed_size()}))};
    }

    _dispose() {
        this._nativeView._connectDnD=this._nativeConnectDnD;
        if(this._nativeView.mapped)this._nativeView._connectDnD();
        this.bms?.destroy();this.categoryDrag?.destroy();this.controls?.destroy();
        Shell.WindowTracker.get_default().disconnectObject(this);Main.overview.disconnectObject(this);Main.layoutManager.disconnectObject(this);
        this._disposed=true;
        if(this._refreshId)GLib.source_remove(this._refreshId);
        for(const id of this._sources)GLib.source_remove(id);
        this._sources.clear();this._tracker.destroy();
        this._settings.disconnectObject(this);Shell.AppSystem.get_default().disconnectObject(this);
        ParentalControls.getDefault().disconnectObject(this);
        for(const icon of this.icons.values())icon._menu?.destroy();
        this.icons.clear();
    }
});

export default class AppLibraryExtension extends Extension {
    enable() {
        this._display=Main.overview._overview.controls.appDisplay;
        this._nativeBox=this._display._box;
        this._nativeBox.hide();
        this.library=new Library(this.getSettings());
        this._display.add_child(this.library);
        this._hiddenId=Main.overview.connect('hiding',()=>this.library.close(false));
    }
    disable() {
        if(this._hiddenId)Main.overview.disconnect(this._hiddenId);
        this._hiddenId=0;
        this.library?.destroy();this.library=null;
        this._nativeBox?.show();this._nativeBox=null;this._display=null;
    }
}
