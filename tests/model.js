import {folderLayout} from '../model.js';
import {sortButtonLayout} from '../model.js';
import {categoryFor, pageLayout, previewPosition} from '../model.js';
const assert = (test, message) => { if (!test) throw new Error(message); };
assert(categoryFor(null) === 'Other', 'uncategorized apps');
assert(categoryFor('X-GNOME;Unknown;') === 'Other', 'unregistered categories');
assert(categoryFor('Utility;Development;') === 'Development', 'prefer specific main category');
assert(categoryFor('Audio;Music;') === 'AudioVideo', 'audio alias');
assert(categoryFor('Game;', 'Office') === 'Office', 'explicit move');
assert(categoryFor('Game;', 'invalid') === 'Game', 'stale override');
for (const [width,height] of [[360,400],[800,500],[1400,760],[2800,1200]]) {
    const layout = pageLayout(width,height);
    assert(layout.capacity > 0 && layout.capacity <= 10, 'bounded pagination');
    for (let i=0;i<20;i++) {
        const p=previewPosition(i,20);
        assert(p.x>=0 && p.y>=0 && p.x+p.size<=208 && p.y+p.size<=208, 'preview bounds');
        assert(p.visible===(i<7), 'preview visibility');
    }
}
print('App Library category / pagination / preview geometry checks passed');

const first=previewPosition(0,8), second=previewPosition(1,8), third=previewPosition(2,8);
assert(first.x===16&&first.y===16&&first.size===80,'equal card padding');
assert(second.x-first.x-first.size===16,'horizontal gap equals padding');
assert(third.y-first.y-first.size===16,'vertical gap equals padding');
assert(208-second.x-second.size===16,'right padding');
assert(208-third.y-third.size===16,'bottom padding');
const miniFirst=previewPosition(3,8), miniLast=previewPosition(6,8);
assert(miniFirst.x===116&&miniFirst.y===116&&miniLast.x+32===188&&miniLast.y+32===188,'mini cluster remains centered with8px inset');
assert(previewPosition(4,8).x-miniFirst.x-miniFirst.size===8,'mini icon gap');

const crowded=sortButtonLayout(948,[{x:610,y:8,width:208,height:208}]);
if(!crowded.compact||crowded.width!==40)throw new Error('Sort label overlaps category');
const clear=sortButtonLayout(948,[{x:610,y:80,width:208,height:208}]);
if(clear.compact||clear.width!==112)throw new Error('Sort label not restored with space');

if(folderLayout(1920,1080).capacity!==16)throw new Error('normal folder capacity');
if(folderLayout(629,720).capacity!==12)throw new Error('narrow folder capacity');
if(folderLayout(500,500).capacity!==4)throw new Error('small folder capacity');
