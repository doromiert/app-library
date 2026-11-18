// XDG Desktop Menu Specification main categories. Audio/Video share AudioVideo.
export const CATEGORIES = [
    ['AudioVideo', 'Sound & Video'], ['Development', 'Development'],
    ['Education', 'Education'], ['HealthFitness', 'Health & Fitness'],
    ['Game', 'Games'], ['Graphics', 'Graphics'], ['Network', 'Internet'],
    ['Office', 'Office'], ['Science', 'Science'], ['Settings', 'Settings'],
    ['System', 'System'], ['Utility', 'Utilities'], ['Other', 'Other'],
].map(([id, name]) => ({id, name}));
const mainCategories = new Set(CATEGORIES.map(c => c.id));

export function categoryFor(categories, override) {
    if (override && mainCategories.has(override))
        return override;
    const entries = (categories ?? '').split(';').filter(Boolean)
        .map(c => c === 'Audio' || c === 'Video' ? 'AudioVideo' : c);
    return entries.find(c => mainCategories.has(c) && c !== 'Utility') ??
        (entries.includes('Utility') ? 'Utility' : 'Other');
}

export function pageLayout(width, height) {
    const columns = Math.max(1, Math.min(5, Math.floor((width - 48) / 248)));
    const rows = Math.max(1, Math.min(2, Math.floor((height - 40) / 256)));
    return {columns, rows, capacity: columns * rows};
}

export function previewPosition(index, count) {
    if (count <= 4 || index < 3) {
        const col = index % 2, row = Math.floor(index / 2);
        return {x: 16 + col * 96, y: 16 + row * 96, size: 80, visible: true};
    }
    const mini = Math.min(index - 3, 3);
    return {x: 116 + (mini % 2) * 40, y: 116 + Math.floor(mini / 2) * 40,
        size: 32, visible: index < 7};
}

export function sortButtonLayout(width, cards, gap=12) {
    const y=8,height=40,fullWidth=112,right=width-24,left=right-fullWidth;
    const compact=cards.some(card=>left<card.x+card.width+gap&&right>card.x-gap&&
        y<card.y+card.height+gap&&y+height>card.y-gap);
    const buttonWidth=compact?40:fullWidth;
    return {x:right-buttonWidth,y,width:buttonWidth,height,compact};
}
