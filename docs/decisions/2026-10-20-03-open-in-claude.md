# 2026-10-20: Open in Claude

- **Asked:** "for the ai chat panel we can go with route in claude first. should be for someone who has a claude.ai plan
  and do not wants to pay. still would be cool initially to have a button that connects you with claude.ai ... and there
  it inserts directly the workbench in the chat and starts writing something like an intro."
- **Done:** a **Claude** panel among the workbench's supporting tools.
  - **What the message asks:** Claude builds the workbench as an artifact, with the same one-line page as the start
    prompt "Load the workbench" (ai/START_PROMPTS.md). It opens on the current components, model, pressure and diagram.
    Claude then introduces what can be done together and asks what to calculate (`claudeMessage` in
    `src/ui/app-logic.js`).
  - **How it is opened:** "Open in Claude" opens `https://claude.ai/new?q=<message>` in a new tab. "Copy the message"
    copies it for pasting. The panel shows the message.
  - **What is used:** the person's own claude.ai account, on any plan. Nothing is sent from the workbench: the link only
    opens claude.ai with the message typed in.
  - **The person's own components** (My data) are left out and named: the new chat does not have the project's data.
- **Not verified from here:** whether claude.ai sends a message given in the link by itself, or only fills the box.
  Sources disagree, and one report says the link format stopped working for a while. The panel says what to do in
  either case (press Send; or copy and paste). The maintainer should try it in a browser.
- **Later** (proposal 0011, G1): a CHEPTA connector (MCP) for claude.ai, which needs a server at a public address.
- **Tested:**
  - `test/claude-link.test.js`: the message, the link, the person's own components;
  - `test/workbench-navigation.test.js`: the list of supporting tools gains "claude", with a comment;
  - Chromium at 1440 and 390 px wide: the panel opens and the link is built (943 characters).
