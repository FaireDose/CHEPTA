# Testers' checklist: the new layout against the current one

Thank you for trying CHEPTA. The maintainer wants to know whether a **new layout** of the workbench is easier to use
than the current one, before it becomes the default ([proposal 0021](../../proposals/0021-interface-reorganization.md),
step 4). You do **five small tasks**, each in both layouts, and tell us what you noticed. It takes about 30 to 40
minutes. You need no knowledge of the code. There are no wrong answers: if you get stuck, that is what we want to
know.

The five tasks are the ones of [the review](2026-11-11-reorganization.md#2-presses-for-five-common-tasks); nothing
here is new.

## Where the two layouts are

| | Address |
|---|---|
| **Current layout** (what everybody gets today) | <https://cheptasim.org/> |
| **New layout** (preview) | <https://cheptasim.org/next.html> |

The website is at <https://cheptasim.org/>; the older address `fairedose.github.io/CHEPTA` redirects there.

Each page has a small link to the other at the top. Both open **empty**; you choose the components yourself.
Neither stores anything about you. Do the tasks in the **current** layout first on one setting, then in the **new**
one; if you test twice (computer and phone), swap the order the second time, so that practice does not favour one.

## Where to test

1. **A computer browser**: open the two addresses above.
2. **A phone**: open the same addresses in the phone's browser (portrait, as you hold it). Do not switch to a
   "desktop site".
3. **A chat artifact** (Claude or another assistant that can show an HTML page): paste the text below into the chat.
   It loads the **current** layout, as [ai/instructions/use-chepta.md](../../ai/instructions/use-chepta.md) says:

   > Read https://fairedose.github.io/CHEPTA/use.md and open the CHEPTA workbench as an artefact in this chat.

   For the **new** layout in a chat, ask for this instead. The released library (`chepta@0.6.2`, loaded from jsDelivr
   as [ai/instructions/use-chepta.md](../../ai/instructions/use-chepta.md) does) has the `layout` key:

   > Show an HTML artefact with exactly this page and nothing else:
   > `<div id="app"></div><script src="https://cdn.jsdelivr.net/npm/chepta@0.6.2/dist/chepta.js"></script><script>CHEPTA.app("#app", { components: [], layout: "next" });</script>`

   If the chat will not show the page (some block scripts from other addresses), write it down under "Stuck", and
   test the chat only in the current layout.

## The five tasks

For each task: do it in the **current** layout, then in the **new** one. Start from a freshly opened page.
Write down the **time** (a phone clock is enough), **where you got stuck**, and **what you looked for and could not
find**. Give up after 3 minutes; that is an answer too.

### Task 1: a T-x-y diagram of ethanol and water

Goal: the diagram, and the bubble temperature of a 50 % mixture.

- *Current:* open **Phase equilibrium**, choose **T-x-y**, then in **Examples** choose "Ethanol and water".
- *New:* the page opens on **Phase eq.** (rail at the left) with **T-x-y**; in **Examples** choose "Ethanol and
  water". On a phone, tap **Results** to see the answer, **Inputs** to go back.
- Note: where did you read the bubble temperature? Could you see the chart without scrolling?

### Task 2: a flash of the mixture

Goal: the vapour fraction of ethanol + water at a temperature and pressure of your choice (for example 80 °C,
101.3 kPa).

- *Current:* **Unit models**, **Flash** (the first tab); choose the components and fill in the feed.
- *New:* **Flash** in the rail (on a phone: the Calculations menu, then Flash); the steps 1. Components, 2. Feed,
  3. Flash are filled one after the other.
- Note: did it say what was still missing? Where did you read the vapour fraction?

### Task 3: a column from its example

Goal: a distillation column calculated from the built-in example.

- *Current:* **Unit models**, **Column**, then the example.
- *New:* **Column** in the rail, then the example.
- Note: could you tell the example from an empty column? What did you look at first when the result appeared?

### Task 4: a flowsheet with a recycle

Goal: the flowsheet with a recycle, and its mass balance. Building one by hand takes long; **open a project file
instead**: in **File** (current) or **Project** (new) choose Open, and use
[examples/flowsheet-recycle.chepta.json](../../examples/flowsheet-recycle.chepta.json) (download it from GitHub first:
open the file, then the download button).

- *Current:* the **Flowsheet** tab of Unit models.
- *New:* press **Flowsheet** in the switch [Flowsheet | Calculations] at the top left; **Calculations** takes you
  back to the last calculation.
- Note: could you find the flowsheet at once? Could you see the drawing without scrolling? Where were the balances?

(Building a flowsheet block by block is not changed by the new layout yet; do not judge that part.)

### Task 5: where does a number come from?

Goal: find the source of the NRTL parameters of ethanol + water (Task 1's mixture).

- *Current:* **Sources used here** at the top of Results, or Library and Sources in the top bar.
- *New:* the **Data** button at the top ("1 pair: 1 fitted"), or the Data menu.
- Note: how many presses did it take? Did you find it before you were told where it is?

## What to send back

Copy this into a message, and fill in what you can. Short answers are fine.

```
Who I am (student, engineer, other; how often I use process simulators):
Where I tested (computer / phone / chat artifact; browser):

Task 1 current: ___ min   new: ___ min   Stuck / could not find:
Task 2 current: ___ min   new: ___ min   Stuck / could not find:
Task 3 current: ___ min   new: ___ min   Stuck / could not find:
Task 4 current: ___ min   new: ___ min   Stuck / could not find:
Task 5 current: ___ min   new: ___ min   Stuck / could not find:

Which layout I would rather use, and why (one or two lines):
Which layout was better on the phone / in the chat:
Anything that looked wrong or broke (what I pressed, what happened):
```

How to send it:

- **A reply to the person who asked you to test**, if you have one.
- **A GitHub issue**, if you have a GitHub account: a general impression or an idea goes through the
  [Proposal form](https://github.com/FaireDose/CHEPTA/issues/new?template=model-or-feature.yml) (title:
  "Layout check, proposal 0021"); something that broke goes through the
  [Bug form](https://github.com/FaireDose/CHEPTA/issues/new?template=bug.yml).
- **The workbench's Feedback button** (Help menu in the new layout), if you do not want an account.

Do not put personal details in the text beyond what you wish to share; the issues are public.
