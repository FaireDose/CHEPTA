# 2026-10-20: the AI chat panel (Open in Claude, ChatGPT, Gemini, HuggingChat, Ollama)

- **Asked:**
  - "for the ai chat panel we can go with route in claude first. should be for someone who has a claude.ai plan and do
    not wants to pay. still would be cool initially to have a button that connects you with claude.ai ... and there it
    inserts directly the workbench in the chat and starts writing something like an intro";
  - after trying it: "it works. but when i get to claude it shows me also a message with 'The CHEPTA workbench is
    published as a private artifact, using exactly the code you gave me. I didn't download or inspect the library, so I
    haven't seen whether it renders correctly.' ... Make that button not only Claude but AI Chat Connection and make
    buttons for Claude, ChatGPT, Gemini and Ollama.";
  - then: "can you check again that it can open in gemini with the message. i wonder why is not working. is there any
    web based open source model?"
- **Done:** an **AI chat** panel among the workbench's supporting tools.
  - **What the message asks:** the assistant builds the workbench as a live page, with the same one-line page as the
    start prompt "Load the workbench" (ai/START_PROMPTS.md), opened on the current components, model, pressure and
    diagram.
    - The wording per assistant: an artifact for Claude and HuggingChat; a canvas with a preview for ChatGPT; Canvas
      for Gemini.
    - It then says: "Do not check or describe the page or the library: I see the page myself. Right after it,
      introduce yourself ...". This answers the remark Claude made after building the page (`aiChatMessage` and
      `workbenchPage` in `src/ui/app-logic.js`).
  - **What each button does:**

    | Button | Opens | The message |
    |---|---|---|
    | Claude | `claude.ai/new?q=<message>` | in the link, and copied |
    | ChatGPT | `chatgpt.com/?q=<message>` | in the link, and copied |
    | Gemini | `gemini.google.com/app` | copied only: Gemini does not take a message from a link without a browser extension; the person pastes it |
    | HuggingChat | `huggingface.co/chat/?prompt=<message>` | in the link (the box is filled, the person presses send), and copied |
    | Ollama | nothing: it runs on the person's own computer and has no web address | its chats show no live pages, so the button downloads the workbench as `chepta-workbench.html` and copies a message for the chat (the assistant helps, the person runs the workbench) |

  - **The panel also shows** the message for any of the five, with "Copy the message" and "Download the page".
  - **The person's own account** does the work. Nothing is sent from the workbench. The person's own components (My
    data) are left out and named, because the new chat does not have the project's data.
- **Not verified from here:** none of the vendors documents the message-in-the-link format. Claude was tried by the
  maintainer and works; ChatGPT's canvas and Gemini's Canvas are not tested yet.
- **Gemini, checked again (2026-10-20):** Google documents no link that fills a Gemini message. The sources found are
  browser extensions that add one ("Gemini URL Prompt", "Send to Gemini") and requests to Google to add it (Hacker
  News, PopClip forum). So the Gemini button opens an empty chat and copies the message; the panel says to paste it
  with Ctrl+V. It could not be tried from here: the session's browser cannot open Google's pages, and Gemini needs a
  sign-in.
- **A web chat with open models:** HuggingChat (huggingface.co/chat), Hugging Face's chat on open-weight models, built
  on its open-source chat-ui (Apache 2.0). Its code (github.com/huggingface/chat-ui, read on 2026-10-20):
  `src/lib/utils/linkParams.ts` fills the box from `?prompt=` (`?q=` sends at once, after a confirmation);
  `src/lib/server/textGeneration/artifacts.ts` lets a model make HTML artifacts with a live preview, which may load
  scripts from a CDN; `chart/env/prod.yaml` turns artifacts on for its default model ("omni") and many others. It
  needs a free Hugging Face account. Not tried from here (sign-in).
- **Not added, for later:** Open WebUI, the open-source browser chat often used with Ollama, documents a `?q=` link
  that fills the box (docs.openwebui.com, URL parameters) and shows HTML artifacts; its address is the person's own
  (often localhost:3000 or localhost:8080), so a button would need an address field. Mistral's Le Chat (partly
  open-weight models) has no documented link format.
- **Later** (proposal 0011, G1): a CHEPTA connector (MCP), which needs a server at a public address.
- **Tested:**
  - `test/ai-chat.test.js`: the page, the five messages, the links, the person's own components;
  - `test/workbench-navigation.test.js`: the list of supporting tools gains "aichat", with a comment;
  - Chromium at 1440 and 390 px wide: the links, the download and the notes.
