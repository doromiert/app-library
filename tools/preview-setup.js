import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class Setup extends Extension {
    enable() {
        this.root=GLib.getenv('APP_LIBRARY_PREVIEW_ROOT');this.revision=0;this.disposed=false;
        this.record=null;this.frames=[];this.tick=GLib.get_monotonic_time();this.longestGap=0;
        const read=path=>{const [,b]=GLib.file_get_contents(path);return JSON.parse(new TextDecoder().decode(b));};
        this.read=read;
        const config=read(this.root+'/settings.json');
        const iface=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
        iface.set_string('color-scheme','prefer-dark');iface.set_string('icon-theme',config.iconTheme);iface.set_string('accent-color',config.accent);
        global.settings.set_strv('favorite-apps',config.favorites);
        new Gio.Settings({schema_id:'org.gnome.desktop.background'}).set_string('picture-options','none');
        this.timer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,50,()=>{
            const now=GLib.get_monotonic_time();this.longestGap=Math.max(this.longestGap,(now-this.tick)/1000);this.tick=now;
            if(this.disposed)return GLib.SOURCE_REMOVE;
            try {
                const record=Main.extensionManager.lookup('app-library@neg-zero.com');
                if(!this.record && record?.stateObj?.library && !Main.layoutManager._startingUp){
                    this.record=record;record.stateObj.getSettings().set_string('sort-mode','custom');Main.overview.showApps();Main.overview.dash.showAppsButton.checked=true;
                    this.firstPaint=GLib.get_monotonic_time();this.captureLater(700);
                }
                const requestFile=Gio.File.new_for_path(this.root+'/request.json');
                if(this.record&&requestFile.query_exists(null)){
                    const req=read(requestFile.get_path());
                    if(req.sequence> (this.sequence??0)){
                        this.sequence=req.sequence;this.command(req).catch(e=>this.error(e));
                    }
                }
            } catch(e){this.error(e);}
            return GLib.SOURCE_CONTINUE;
        });
    }
    error(e){GLib.file_set_contents(this.root+'/error.txt',String(e)+'\n'+e.stack);}
    async command(req) {
        let library=this.record.stateObj.library;
        if(req.op==='reload'){
            const path=`${this.root}/updates/${req.revision}`;
            const module=await import(`file://${path}/extension.js`);
            const previous=library.expanded?.id;
            const settings=this.record.stateObj.getSettings();
            library.destroy();
            library=new module.Library(settings);
            this.record.stateObj.library=library;
            Main.overview._overview.controls.appDisplay.add_child(library);
            const theme=St.ThemeContext.get_for_stage(global.stage).get_theme();
            if(this.loadedStyle)theme.unload_stylesheet(this.loadedStyle);
            else theme.unload_stylesheet(Gio.File.new_for_path(this.record.path+'/stylesheet.css'));
            this.loadedStyle=Gio.File.new_for_path(path+'/stylesheet.css');theme.load_stylesheet(this.loadedStyle);
            this.revision=req.revision;
            if(previous)GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,100,()=>{
                const group=library.groups.find(g=>g.id===previous);if(group)library.open(group);
            });
        } else if(req.op==='test'){
            try{
                const test=await import(req.module+'?revision='+req.sequence);
                const result=await test.run(library);
                GLib.file_set_contents(this.root+'/test-result.json',JSON.stringify({sequence:req.sequence,pass:true,result}));
            }catch(error){
                GLib.file_set_contents(this.root+'/test-result.json',JSON.stringify({sequence:req.sequence,pass:false,error:String(error),stack:error.stack}));
                throw error;
            }
        }
        else if(req.op==='open')library.open(library.groups.find(g=>g.id===req.category)??library.groups[0]);
        else if(req.op==='close')library.close();
        else if(req.op==='page')library.goToPage(req.page);
        else if(req.op==='move')library.moveApp(req.appid,req.category??null);
        else if(req.op==='identity'){
            const before=new Map([...library.icons].map(([id,a])=>[id,[a,a.icon.icon,a.get_parent()]]));
            const target=library.groups.find(g=>g.id===req.category)??library.groups[0];library.open(target);
            await new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,340,resolve));
            const during=[...before].every(([id,[actor,texture,parent]])=>library.icons.get(id)===actor&&actor.icon.icon===texture&&actor.get_parent()===parent);
            library.close();
            await new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,340,resolve));
            const after=[...before].every(([id,[actor,texture,parent]])=>library.icons.get(id)===actor&&actor.icon.icon===texture&&actor.get_parent()===parent);
            GLib.file_set_contents(this.root+'/identity.json',JSON.stringify({during,after,count:before.size}));
        }
        this.captureLater(400);
    }
    captureLater(delay) {
        if(this.captureId)GLib.source_remove(this.captureId);
        this.captureId=GLib.timeout_add(GLib.PRIORITY_DEFAULT,delay,()=>{this.captureId=0;this.capture();return GLib.SOURCE_REMOVE;});
    }
    capture() {
        try {
            const library=this.record.stateObj.library;
            const data={...library.snapshot(),revision:this.revision,sequence:this.sequence??0,
                pid:Gio.Credentials.new().get_unix_pid(),bus:GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),longestGap:this.longestGap};
            GLib.file_set_contents(this.root+'/ready.json',JSON.stringify(data));
            const file=Gio.File.new_for_path(this.root+'/preview.png');
            const stream=file.replace(null,false,Gio.FileCreateFlags.NONE,null);
            new Shell.Screenshot().screenshot(false,stream).finally(()=>stream.close(null));
        } catch(e){this.error(e);}
    }
    disable(){this.disposed=true;if(this.timer)GLib.source_remove(this.timer);if(this.captureId)GLib.source_remove(this.captureId);}
}
