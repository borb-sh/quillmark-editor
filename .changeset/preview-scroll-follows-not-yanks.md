---
'@quillmark/svelte': patch
---

The preview's follow-the-caret scroll moves the pane only when the caret has left the fold, and moves its own scrollport when it does. `focusPosition` is the continuous hop (one call per keystroke and per arrow key), so centring on every call took the pane back from the user on all of them, and re-centred a preview click on a point that click already had on screen; the change-guard now mirrors the correlation bloom's. `scrollToField` stays unguarded: a discrete "show me this field" centres every time.

The scroll is written as `container.scrollTop` rather than `scrollIntoView`, which walks every scrollable ancestor: a host whose document scrolls had the whole page dragged to the preview by a keystroke in the editor, taking the editor off screen.

`refresh` re-locates the last followed caret. `session.locate` answers against the last compiled layout while a consumer debounces `update`, so a caret typed past that layout is off-content for the whole burst and the pane sits still until some later caret event asks again.
