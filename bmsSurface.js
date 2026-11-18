// Optional integration with Blur My Shell's own renderer, not a second blur implementation.
// BMS's DynamicPipeline API is private; tested against v78, and guarded when unavailable.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class BmsSurface {
    constructor(getTarget, active=()=>true, manualAllocation=false) {
        this.getTarget=getTarget;this.active=active;this.manualAllocation=manualAllocation;
        this.pipeline=null;this.target=null;this.owner=null;this.disposed=false;this.generation=0;
        this.settings=null;this.settingsId=0;this.targetIds=[];this.bindings=[];
        this.extensionId=Main.extensionManager.connect('extension-state-changed',(_manager,extension)=>{
            if(extension.uuid==='blur-my-shell@aunetx')this.refresh();
        });
        this.interface=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
        this.interfaceId=this.interface.connect('changed::color-scheme',()=>this.refresh());
        this.modeId=Main.sessionMode.connect('updated',()=>this.refresh());
        this.refresh();
    }

    refresh() {
        if(this.disposed)return;
        const serial=++this.generation;
        const record=Main.extensionManager.lookup('blur-my-shell@aunetx');
        const owner=record?.state===1?record.stateObj:null;
        if(!owner?._effects_manager||!owner?._pipelines_manager||owner._paused||!owner._user_session_mode_enabled){
            this.clear();this.unwatch();this.owner=null;return;
        }
        if(this.owner!==owner){
            this.clear();this.unwatch();this.owner=owner;
            this.settings=owner.getSettings().get_child('appfolder');
            this.settingsId=this.settings.connect('changed',()=>this.refresh());
        }
        if(!this.settings.get_boolean('blur')||!this.active()||!this.getTarget()){
            this.clear();return;
        }
        Promise.all([
            import(`file://${record.path}/render/dynamic_surface.js`),
            import(`file://${record.path}/conveniences/style.js`),
        ]).then(([renderer,style])=>{
            if(this.disposed||serial!==this.generation||this.owner!==owner)return;
            const target=this.getTarget();if(!target?.get_parent())return;
            const pipelineId=style.get_pipeline_id(owner._settings.appfolder);
            if(this.target!==target){
                this.clear();this.target=target;this.oldStyle=target.style;
                this.pipeline=new renderer.DynamicPipeline(owner._effects_manager,owner._pipelines_manager,pipelineId,{corner_radius:0});
                const actor=this.pipeline.create_actor('zenos-bms-surface');this.pipeline.ownsActor=true;
                target.get_parent().insert_child_below(actor,target);
                if(!this.manualAllocation)actor.add_constraint(new Clutter.BindConstraint({source:target,coordinate:Clutter.BindCoordinate.ALL}));
                for(const property of ['translation-x','translation-y','scale-x','scale-y','opacity','visible'])
                    this.bindings.push(target.bind_property(property,actor,property,2));
                this.targetIds.push(target.connect('destroy',()=>this.clear()));
                this.targetIds.push(target.connect('style-changed',()=>this.updateRadius()));
                this.pipeline.attach_pipeline();
            } else if(this.pipeline.pipelineId!==pipelineId)this.pipeline.change_pipeline_to(pipelineId);
            this.restack();
            const choice=owner._appfolder_blur.get_folder_style();
            const backgrounds=['', 'rgba(0,0,0,0)', 'rgba(255,255,255,0.65)', 'rgba(30,30,33,0.5)'];
            const original=(this.oldStyle??'').trim().replace(/;+$/,'');
            target.style=choice?`${original?original+'; ':''}background-color: ${backgrounds[choice]};`:this.oldStyle;
            target.add_style_class_name('zenos-bms-managed');
            this.updateRadius();this.allocate();
        }).catch(error=>{
            if(serial!==this.generation||this.disposed)return;
            this.clear();console.warn(`ZenOS optional BMS surface: ${error.message}`);
        });
    }

    restack(){
        const actor=this.pipeline?.actor,parent=this.target?.get_parent();
        if(!actor||!parent)return;
        actor._zenosBmsSurface=true;
        if(actor.get_parent()!==parent){actor.get_parent()?.remove_child(actor);parent.add_child(actor);}
        const siblings=parent.get_children();
        if(siblings.indexOf(actor)!==siblings.indexOf(this.target)-1)parent.set_child_below_sibling(actor,this.target);
    }
    updateRadius(){
        if(!this.target||!this.pipeline)return;
        const radius=this.target.get_theme_node().get_border_radius(0);
        this.pipeline.set_corner_radius(radius/St.ThemeContext.get_for_stage(global.stage).scale_factor);
    }
    allocate(){
        if(!this.manualAllocation||!this.pipeline?.actor||!this.target?.has_allocation())return;
        this.pipeline.actor.allocate(this.target.get_allocation_box());
    }
    clear(){
        const target=this.target;this.target=null;
        for(const binding of this.bindings)binding.unbind();this.bindings=[];
        if(target){
            for(const id of this.targetIds)target.disconnect(id);
            target.remove_style_class_name('zenos-bms-managed');target.style=this.oldStyle;
        }
        this.targetIds=[];this.pipeline?.destroy();this.pipeline=null;
    }
    unwatch(){if(this.settingsId)this.settings.disconnect(this.settingsId);this.settingsId=0;this.settings=null;}
    destroy(){
        this.disposed=true;this.generation++;this.clear();this.unwatch();
        Main.extensionManager.disconnect(this.extensionId);Main.sessionMode.disconnect(this.modeId);
        this.interface.disconnect(this.interfaceId);
    }
}
