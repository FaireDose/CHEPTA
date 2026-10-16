# 2026-10-16: proposal 0012, the user's own data

- **Asked:** after batch 4, "continue with add your own data. think to implement with this also opening additional tabs
  that appear as separate windows to make it leaner on the main screen. is it possible?"; earlier (2026-10-14) the
  user's own Modified UNIFAC 2.0 groups were set for this same work.
- **Answer:** yes, where the browser allows a new window: the main window opens an empty window and builds the panel
  into it with its own code, so it works offline and from a file on disk. Inside AI chats (artifacts) and on phones
  new windows are usually blocked; there the panel opens docked in the page, as Library and Sources do today.
- **Drafted:** proposals/0012-user-data.md (status Draft). New interfaces and file formats need an accepted proposal
  first (AGENTS.md, "Kinds of contribution"), so no code yet. In short: property records, components, pair parameters
  and Modified UNIFAC 2.0 groups of the user's own, tier "user", always shown as such, stored in the project file
  (format 3, `user_data`), used through an overlay passed per call, never written into the databank; an export to a
  contribution package for sharing.
- **Waiting for the maintainer:** accept or change the proposal, and its two questions.
