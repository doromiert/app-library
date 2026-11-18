import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
const delay=ms=>new Promise(resolve=>GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,ms,resolve));
const assert=(v,message)=>{if(!v)throw new Error(message);};
export async function run(library) {
    const original=library._settings.get_value('category-overrides');
    const expandedId=library.expanded?.id;
    const identity=new Map([...library.icons].map(([id,a])=>[id,[a,a.icon.icon,a.get_parent()]]));
    const retained=()=>[...identity].every(([id,[a,texture,parent]])=>library.icons.get(id)===a&&a.icon.icon===texture&&a.get_parent()===parent);
    let maxGap=0,last=GLib.get_monotonic_time();
    const heartbeat=GLib.timeout_add(GLib.PRIORITY_DEFAULT,20,()=>{const now=GLib.get_monotonic_time();maxGap=Math.max(maxGap,(now-last)/1000);last=now;return GLib.SOURCE_CONTINUE;});
    try {
        library.close(false);await delay(100);
        const group=library.groups.find(g=>g.id==='Utility');assert(group,'Utilities fixture');
        const begin=GLib.get_monotonic_time();library.open(group);await delay(30);
        const feedbackMs=(GLib.get_monotonic_time()-begin)/1000;
        await delay(300);
        assert(library._folderCapacity===16,'expanded folder is not4x4');
        assert(library._folderPages===Math.ceil(group.apps.length/16),'folder page count');
        assert(!library._iconLayer.has_clip,'background category layer was clipped');
        assert(group.apps.every(a=>a.has_clip),'foreground apps lack viewport clipping');
        const inactive=group.apps[16];if(inactive){inactive.ensure_style();assert(inactive.get_theme_node().get_background_color().alpha===0,'inactive tile has dark fill');}
        assert(retained(),'expansion replaced an app/icon/parent');
        assert(library._next.width===library._next.height,'next arrow not circular');
        assert(library.width===Main.layoutManager.primaryMonitor.width&&library.height===Main.layoutManager.primaryMonitor.height,'full viewport scrim');
        const pageIcon=group.apps[0],startX=pageIcon.translation_x;
        library.goToPage(1);await delay(70);const midX=pageIcon.translation_x;await delay(230);
        assert(midX<startX&&midX>pageIcon.translation_x,'folder paging snapped instead of tweening');
        assert(Math.abs(startX-pageIcon.translation_x-library._panel.width)<2,'folder page stride '+JSON.stringify({startX,endX:pageIcon.translation_x,panel:library._panel.width,adjustment:library._adjustment.value,morph:library._morphing}));
        assert(Math.abs(library._adjustment.value-1)<0.01,'folder pagination');
        assert(!library._next.visible,'stray next arrow at last page');
        assert(retained(),'pagination replaced actor');
        library.close();await delay(320);assert(retained(),'collapse replaced actor');
        const app=group.apps[0];app.popupMenu();
        assert(app._categorySubmenu.menu._getMenuItems().length===library.categories().length+2,'context category choices');app._menu.close();
        library.moveApp(app.app.get_id(),'Office');await delay(100);
        assert(library.icons.get(app.app.get_id())===app&&app.group.id==='Office','move lost actor or category');
        library._settings.set_value('category-overrides',original);await delay(100);
        assert(retained(),'category move/reset replaced actor');
        assert(feedbackMs<400&&maxGap<400,'Doherty responsiveness threshold exceeded');
        return {actorIdentity:true,textureIdentity:true,parentIdentity:true,folder4x4:true,pagination:true,categoryMenu:true,moveAndReset:true,circularArrow:true,fullScrim:true,feedbackMs,maxGap,apps:identity.size};
    } finally {
        GLib.source_remove(heartbeat);library._settings.set_value('category-overrides',original);
        library.close(false);
        if(expandedId){const g=library.groups.find(g=>g.id===expandedId);if(g)library.open(g);}
    }
}
