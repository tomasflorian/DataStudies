Open `index.html` directly in a browser. No install, server, storage, or backend is needed. Refreshing starts a fresh diagram. Export JSON to copy and save your work; Import JSON restores it by pasting, including shared labels, orientations, stacking order, and the character limit. Import replaces the current canvas only after validation succeeds.

Click a slot to edit all three labels with `a,b,c` or `a b c`. Commas and whitespace both separate labels; use `a,,c` for an empty middle slot. Use its + button to add a block and choose horizontal or vertical. Its labels are compared with all three slots of the block you clicked: exactly one matching pair aligns those positions and shares their label; no matches starts a separate stack; multiple matching pairs show an error. Empty labels do not count as matches. Matching uses the trimmed, truncated labels. Attached blocks default to perpendicular and the latest block appears on top, with drawn side faces and diagonal box edges.

The character limit applies to each slot globally (default 10); reducing it permanently cuts existing labels. Deleting a block also deletes blocks attached through it. Deleting the initial block creates a new empty one.

Run interaction and JSON validation checks with `node diagrams/app.test.cjs` from the repository root.
