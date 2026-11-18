# App Library

GNOME Shell50 extension: a paginated app library using XDG desktop-entry main
categories, with Other for unmatched applications. Each application belongs to
one category; right-click an app and choose **Move to category** to override it.
**Original category** restores the desktop-entry category. Overrides are user-scoped
GSettings data; desktop files and stock GNOME folder settings are preserved.

Category cards provide direct launch targets and one combined miniature-cluster
button. Expanded categories use4×4 pages, native page indicators, and circular
previous/next controls. Escape or clicking the full-view dimmed background closes
the category. Search and the underlying overview remain GNOME's own interfaces.

The same app actor, icon actor, and icon parent survive expansion, collapse,
paging, and moves between categories. Only geometry, opacity and transforms
change. No screenshot clones or replacement icons are used for the transition.
The original stock grid is restored when the extension is disabled.

## Interactive development

Run `python3 tools/preview.py launch` to start an isolated Mutter Development Kit
session. It copies app names, icons and categories into safe launcher fixtures;
clicking a fixture shows a notification rather than starting the real app.
The preview has private HOME/XDG directories and an isolated session bus.

Run `python3 tools/preview.py update` to hot-load a new module and stylesheet
into that same MDK window. `open Office`, `close`, `page1`, `capture`, and
`identity Utility` provide preview-only controls (use a space before numeric
arguments, e.g. `python3 tools/preview.py page 1`). Preview state and screenshots
live under `~/.private/State/app-library/devkit`.

Compile `schemas/` using `glib-compile-schemas` before installing manually.
Install this directory as `app-library@neg-zero.com` in a Shell extension path.
The development preview launcher compiles schemas automatically.

## Verification

`gjs -m tests/model.js` checks category fallback/overrides, preview bounds and
page capacity. `tests/native.js` runs inside an isolated GNOME Shell with the
preview library supplied as its argument. It verifies actor/texture/parent
identity,4×4 pages, paging, menus, category move/reset, circular arrows, full
viewport coverage and main-loop responsiveness. It restores preview overrides.

Tested on GNOME Shell50.4, GJS1.88.1 and Mutter50.4. Latest native run:68 apps,
40.5ms visible feedback and45.6ms maximum main-loop gap. Idle performance is
measured separately. Testing does not yet cover screen readers, high contrast,
200% text scaling, multi-monitor RTL, or physical touch/trackpad hardware.

Layout computation and styling must remain outside repeated allocation passes:
a cached allocation pass reapplies existing child boxes without restarting
transitions or changing styles. Layer actors deliberately bypass the default
fixed layout, because Library owns their child allocations.


## Grid controls and ordering

The Sort menu provides Alphabetical, Recently added, Recently used, and Custom
order. Sorting affects category cards and apps inside categories. Custom mode
supports app reordering and live category rearrangement with a complete category
preview. Dragging an app onto another category changes its assignment, including
empty custom categories; leaving an expanded folder while dragging exposes the
category grid, and hovering a grid edge changes the page.

New category opens an inline Shell dialog. App menus put Original category
inside Move to category. Recents is toggleable, records launches and app focus,
and is pinned first by default; Pin Recents first can be disabled. User settings,
custom order and usage timestamps use GSettings and survive normal sessions.
Recently added tracks first observation; existing apps have an alphabetical
baseline because installation history is not reconstructed.

MDK uses an isolated in-memory settings backend for interactive fixtures. Disk
persistence was separately verified using two independent D-Bus sessions and a
private dconf database. Blur My Shell v78 has been loaded and tested alongside
the extension in MDK. tests/features.js exercises sorting, category creation,
original-category reset, physical app/category drags and history controls;
tests/anchor.js samples physical click transition frames, checking source to
destination bounds rather than only final positions.


## Optional Blur My Shell integration

Expanded App Library categories and Dash Stacks popup contents use Blur My
Shell's app-folder pipeline and dialog tint when BMS is active. Changes to the
pipeline, color scheme and blur toggle apply live; disabling BMS restores the
normal surface and releases its effects. App Library keeps the renderer attached
while its original card and icons animate. Collapsed previews keep one rounded
hover highlight.

The adapter uses guarded private APIs from
[Blur My Shell v78](https://github.com/aunetx/blur-my-shell/tree/v78), tested in
GNOME Shell 50.4 / GJS 1.88.1 / Mutter 50.4. Other BMS versions are unverified.
This integrates each surface's blur and tint; BMS's separate full-screen
“blur behind folders” option is not implemented for these custom surfaces.

Collapsed category cards also follow the selected BMS folder tint (including
Light, Dark and automatic color-scheme selection). Each category retains its actual BMS renderer across
collapsed, opening, expanded and closing states, including reparenting.
The material regression checks compare computed RGBA values in collapsed,
opening, expanded, closing and returned states for both Light and Dark.

Outside touch taps dismiss expanded categories; swipes and cancelled touches do not.

## Installation

ZenPkgs provides `byCategories.desktops.gnome.extensions.app-library`. Enable
`desktops.gnome.extensions.app-library.enable = true` in a ZenOS host. Disable
Alphabetical App Grid when using App Library. Sorting and history remain
per-user settings in the library's Sort menu. Requires GNOME Shell 50.

Category reassignment settles any active morph before rebuilding categories.
Removing the last app from an expanded category returns the library to the
overview; overview exit also performs unconditional presentation cleanup.
`tests/lifecycle.js` checks those cases, interrupted animations and foreground
ordering. Folder page dots have 8px more bottom clearance. Sort collapses to
an icon when its label would leave less than 12px clearance to a category card;
the collapsed control and main-grid arrows share 24px side padding.
