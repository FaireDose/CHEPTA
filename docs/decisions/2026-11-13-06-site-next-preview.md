# 2026-11-13-06: the new layout published as a preview (proposal 0021, step 4, preparation)

## What was asked

The maintainer (2026-11-13): make the check with two or three users easy, before step 4 makes the new layout the
default. The website showed only the classic layout; the new one was only in `examples/app-next.html`.

## What was done

| What | Where |
|---|---|
| The new layout on its own page, `CHEPTA.app("#app", { components: [], layout: "next" })`; the same `chepta.js?v=` cache-busting as the root | `site/next.html`; `.github/workflows/pages.yml` copies it and has the same `sed` and `grep` check |
| One quiet link each way ("Try the new layout (preview)", "Back to the current layout"; the preview page also links the checklist); nothing else of `site/index.html` changes | `site/index.html`, `site/next.html` |
| The testers' checklist: the five tasks of the review, both layouts, computer, phone and chat artifact, what to note, a form to send back | `docs/ui-review/TESTING-0021.md` |
| Screenshots of `next.html` at 375, 820 and 1280 px, light and dark, empty and with ethanol + water on the T-x-y (no sideways scroll at any width, no script error: measured) | `docs/ui-review/2026-11-13-site-next-preview/` |
| Links from the README ("Try it") and from proposal 0021, step 4; the open item of DECISIONS.md | those files |

`src/` is not changed. The address after the merge: <https://fairedose.github.io/CHEPTA/next.html>.

## Questions for the maintainer

1. **Chat artifacts and the new layout.** The released library (npm `chepta@0.6.1`, which `use.md` loads from jsDelivr)
   does not have the `layout` key, so the checklist has the tester load `https://fairedose.github.io/CHEPTA/chepta.js`
   (built from main) in the artifact for the new layout. Some chats may block scripts from that address. *Recommendation:*
   keep it, and if a chat blocks it, test the chat in the current layout only, and release 0.6.2 with the layout before
   step 4 so that the chat check is complete. Not tried here: no chat artifact was available in this environment.
2. **Where testers send answers.** The checklist offers a reply to you, an issue with the Proposal or Bug form, or the
   Feedback button. *Recommendation:* ask testers to reply to you, and use one issue ("Layout check, proposal 0021")
   to gather the results in public; say if you prefer another way.
   `docs/ui-review/` is added to `VERSION_EXEMPT` in `scripts/set-version.mjs` (the release workflow's version sync and
   `test/versions.test.js`): the checklist names the first release that has the `layout` key, 0.6.2, and must not be
   rewritten to another version at the next release. (main's `package.json` still reads 0.6.1 while 0.6.2 is on npm, so
   without the exemption the test failed.)
3. **The example for Task 4** is `examples/flowsheet-recycle.chepta.json`, which the tester downloads from GitHub and
   opens with File / Project; the Flowsheet has no example on its empty drawing until step 5. *Recommendation:* accept
   this for the check.

## Still pending

Step 4 itself waits for the user check (DECISIONS.md, open item "A reorganization of the workbench").

## Decided (the maintainer, 2026-11-13)

The maintainer agreed to all three recommendations:

1. **Chat artifacts and the new layout:** testers in a chat load the new layout. With 0.6.2 released, the released
   library has the `layout` key (checked: `chepta@0.6.2`, `dist/chepta.js` handles `layout === "next"`), so
   `docs/ui-review/TESTING-0021.md` loads `chepta@0.6.2` from jsDelivr, as `ai/instructions/use-chepta.md` does, instead
   of the website's `chepta.js`. The checklist also says that the website is at <https://cheptasim.org/>
   (`fairedose.github.io/CHEPTA` redirects there) and the preview at <https://cheptasim.org/next.html>.
2. **Where testers send answers:** testers reply to the maintainer, and one public issue, "Layout check, proposal 0021",
   gathers the results.
3. **The example for Task 4** is `examples/flowsheet-recycle.chepta.json`, opened through File > Project.
