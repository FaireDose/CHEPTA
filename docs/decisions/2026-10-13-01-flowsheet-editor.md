# 2026-10-13: flowsheet editor

- **Asked:** two bugs: deleting a unit also deleted the streams connected to it; and a product stream was lost (not on
  the screen), so the flowsheet did not solve.
- **Decided by the maintainer:** deleting a unit keeps its streams. Now a stream that went into it leaves the flowsheet
  (a feed keeps its stream), and a stream that came out of it starts from a new feed in its place, still going where it
  went; the note says which.
- **Second bug, what was found (not the confirmed cause):** the canvas drew nothing for a stream whose block is
  missing (for example a stream to a Product block that is not in the document), and such a flowsheet does not solve.
  None of the editor's own edits leaves a document like that; a file written or changed outside the editor can. Such a
  stream is now drawn in red from the end that exists ("S3 → P2 is missing"); the flowsheet is not changed. The
  maintainer does not want the editor to repair or connect anything by itself (2026-10-13): an automatic completion
  tried first was removed. Also, two new Products of one unit were placed on the same spot (one hidden under the
  other); they now get separate spots (placement only).
  Open question for the maintainer: a stream that came out of a deleted unit now starts from a new, empty feed (the
  document needs a block at both ends of a stream); the alternative is to delete those outgoing streams as before.
  Pending: the maintainer's screenshots, if the lost stream happens again.
- **Reported on the preview (same day):** deleting one of those new feeds (F2, F3) made it again lower on the page;
  only deleting the stream from its end removed it. Fixed: deleting a feed deletes its stream too (and the Product the
  stream went to; a unit it went to only loses that inlet), the same as deleting a feed's stream already did. Also asked:
  rename streams. Done: a Name field in the stream panel; the name shows on the drawing, in the stream table, the CSV
  and the Excel workbook. The stream keeps its id (S1, S2 ...) underneath; an empty name shows the id again.
- **Asked next (same day):** names for the units and the feeds too, not only the streams. Done: the same Name field in
  the panel of a feed or a unit; the name shows on the drawing, in the panel and results, in the From/To rows of the
  stream table and in the Excel workbook. The end circle of a product stream takes no name (name its stream). The
  energy stream of a unit keeps its own name (Q-V1).
- **Asked next (same day):** a feed and its stream as one thing, as in most simulators, not an oval plus a stream.
  **Decided by the maintainer:** yes, in #106. Done on the drawing only:
  - **On the drawing:** a feed is a feed stream that starts at a small tab. The tab is dashed orange while the feed
    is not fully specified. You drag the tab to move the start; clicking it or the line opens the stream panel, which
    holds the flows, T, P and the name.
  - **Deleting:** deleting a feed stream deletes it whole, with its Product end. Before, the Product end stayed
    behind in the document.
  - **Deleting a unit:** its outgoing streams become feed streams to fill in.
  - **The file:** the document format is unchanged; the Feed block stays in the file underneath, so old projects, the
    solver and the Excel export work as before. A Feed block with no stream (only possible in a file written outside
    the editor) is still drawn as the oval, so it can be deleted.
  - **The open question above:** this answers it. A deleted unit's outgoing streams become feed streams, not new
    ovals.
