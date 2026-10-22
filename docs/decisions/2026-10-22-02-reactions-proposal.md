# 2026-10-22: proposal 0010 (reactions and reactors) accepted

The maintainer accepted proposal 0010 with these answers (2026-10-22):

- Points 1 and 2 (the reaction description; the formation properties ΔfH° and ΔfG° from open sources): "ok".
- Equilibrium and Gibbs reactors: the difference was explained (the equilibrium reactor solves the listed reactions to
  their K; the Gibbs reactor minimizes the Gibbs energy over the species allowed, every reaction among them possible)
  and both stay.
- "at the reactors with kinetics i need first to write the kinetics during the definition of the reaction. this will
  be a block near components and Thermodynamic method. the kinetics can be 3-6 or even more types of kinetics. check
  the models thoroughly from zero order, 1 order, to heterogeneous type of kinetics like LHHW and similar": the
  proposal now has a Reactions setup block, and six rate forms (power law of any order, reversible power law, LHHW,
  Michaelis–Menten, Monod with inhibition, the Tessier, Moser, Contois and Blackman growth laws), each with Arrhenius
  rate constants, from Rawlings and Ekerdt, *Chemical Reactor Analysis and Design Fundamentals*, 2nd ed. (pages in
  the proposal). Eley–Rideal and Mars–van Krevelen were not found in an open source; they are searched for in step 2.
- "we leave one with custom blocks for later, but a button where you press and you get a text box and someone can code
  themselves a kinetics": step 9.
- Rawlings and Ekerdt's book is free to read on the authors' site but copyrighted: it is used for equation forms and
  worked examples, not for data (the maintainer agreed, 2026-10-22: "ok do this step then").

Next: step 1, the formation data.
