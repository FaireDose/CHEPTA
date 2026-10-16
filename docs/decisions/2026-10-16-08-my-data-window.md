# 2026-10-16: proposal 0012, step 4 — My data in a window of its own

- **Asked:** "ok, you can go to the next step" (after merging step 3); for step 5: "the coefficients side by side, the
  ones from the database and the empty table where i can add mine. for unifac also side by side the parameters and
  the selection of the groups" (written into proposal 0012, step 5).
- **Done:**
  - `src/ui/my-data-window.js`: "Open in a new window" in the My data panel. The main window opens an empty window
    and builds the panel into it with its own code and styles (no second file, so it works offline and from a file on
    disk). The main window keeps the data; the window edits through it, and changes in either appear in both. In the
    workbench, My data then says the panel is in its own window, with "Show the window" and "Back into the
    workbench"; the window has "Back into the workbench" too, and closing it docks the panel again.
  - Not offered on phones (narrow screens). Where the page or the browser refuses a window (pages inside AI chats,
    pop-up blockers), the panel stays docked with a note saying why and how to allow it.
  - `injectStyles` now checks each document for its styles (it kept one flag per page, so a second document stayed
    unstyled).
- **Tested:** `test/my-data-window.test.js` (where a window is offered; a refused window, three ways, leaves the panel
  docked with the reason). In Chromium: the window opens with its title; a property fitted and added in the window
  reaches the workbench; a component added in the workbench appears in the window; "Back into the workbench" and
  closing the window both dock the panel; with window.open refused the note appears; no button at 375 px.
- **Next:** step 5, pair parameters and Modified UNIFAC 2.0 groups, side by side with the databank's.
