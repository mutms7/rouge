# ARREARS

*Codename: Rouge. You are in the red.*

A roguelike deckbuilding dungeon crawler about carrying other people's debts down a hole.

---

## 1. The pitch

In the salt-mining city of **Kell Harrow**, debts are physical. Not metaphorically: a lie you told, a promise you broke, a year you stole off someone. They accrete. They have weight. You can cut one out of a person and swallow it, if you're licensed, and then you carry it until it's discharged.

You're a **debt-eater**. It's a trade, like tanning or gutting fish, and it's about as respectable. People pay you to eat what they can't carry. Everything you swallow becomes a card in your deck.

Below the city is the **Ledger**, a vertical seam where every unpaid debt in Kell Harrow's history has settled into strata, compressed under the weight of the ones above it. It isn't a dungeon. It's sediment. You go down because somewhere at the bottom is **your own debt**, taken off you the day you were apprenticed, and nobody has ever told you what it was.

You find out.

### The three things that make this not a Spire clone

1. **No energy. No turns.** Combat is a shared initiative track called **the Tally**. Cards cost *Weight* in beats. Whoever is furthest behind on the track acts next.
2. **Cards graduate into passives.** *Settling* a card deletes it forever and grants the **Mark** printed on it. Your deck shrinks all run while your character sheet grows. Deck bloat is punished directly by **Interest**.
3. **The map inverts.** Act 4 is the same map, climbed. The final boss's deck is built from your run log.

---

## 2. Core loop

```
Descend a node   ->   Fight / event / shop
      ^                       |
      |                       v
   Choose path   <-   Take a card, a Token, or Settle a card into a Mark
```

That's the standard skeleton, on purpose. All the novelty lives inside combat and inside the deck economy, not in the run structure. Someone should understand the map in four seconds and then get blindsided by the first fight.

**Target run length:** 30 to 40 minutes for the demo (Act 1). 90 minutes for a full 1.0 run.

---

## 3. Combat: the Tally

### 3.1 The track

Combat runs on a **24-beat track** that loops. One full loop is a **lap**.

Every combatant has a marker on the track. **The marker that is furthest behind acts next.** Ties resolve in favour of the player.

There is no "end turn" button. There is no hand discard at end of turn. Your hand persists across the entire fight.

### 3.2 Weight

Every card has a **Weight** from 0 to 5. Playing a card advances *your* marker by that many beats. That is the entire cost system.

- A Weight 1 card lets you act again almost immediately.
- A Weight 5 card hands the enemy three or four actions before you move again.

So a cheap card isn't cheap because it does less. It's cheap because it doesn't hand the enemy time. Damage per beat becomes the real currency, and a big slow nuke turns into an actual gamble instead of a mana check.

### 3.3 Guard

**Guard** is block. It decays **1 per beat elapsed**, not per turn.

This is the most important thing the Tally changes. Guard isn't a per-turn tax you pay and lose, it's a shield that's melting, so *when* you raise it matters more than how much. Twelve Guard raised eight beats before the enemy swings is four Guard by the time it lands. Four Guard raised one beat before is four Guard.

Players get this in fight two, and then they spend the rest of the game getting better at it. That's the skill ceiling.

### 3.4 Intents on the track

Enemies do not show "the thing they will do next turn." They show **the thing they will do, pinned to the beat where it fires**. You can read the entire visible 24-beat window. Planning is spatial, not turn-by-turn.

### 3.5 Strain

A small pressure valve. Weight-0 cards and track manipulation generate **Strain**. At 10 Strain you take 5 damage and reset to 0.

It exists so zero-Weight loops are a resource you spend, not an infinite you discover. It's meant to be unglamorous.

### 3.6 Keywords

| Keyword | Meaning |
|---|---|
| **Guard N** | Gain N Guard. Decays 1 per beat. |
| **Slip N** | Push an enemy's marker forward N beats. Delays them. |
| **Haste N** | Pull your own marker back N beats. |
| **Bleed N** | Target takes N damage when it acts. N drops by 1 each time. |
| **Perjury N** | Play at Weight 0. The effect resolves N beats later. If you take unblocked damage first, it fizzles. |
| **Echo** | On play, add a copy to your hand at Weight +1. |
| **Exhaust** | Removed from the deck for the rest of this combat. |
| **Lap** | One full 24-beat cycle of the Tally. |

**Perjury** is Wick's signature and it's the cleanest bit of fiction in the whole game. You say the thing now. It becomes true later, if nobody catches you.

---

## 4. Deck economy: Load, Interest, and Settling

This is the second pillar and the one that makes the game feel different over a whole run rather than inside a single fight.

### 4.1 Load

Every card in your deck has a **Load** value, usually equal to its Weight. Compound cards have Load 2. Your **deck Load** is the sum.

### 4.2 Interest

At the end of every lap, **Interest** fires. You shuffle **N Compound cards** into your draw pile, where N scales off your deck Load:

| Deck Load | Compounds per lap |
|---|---|
| 0 to 24 | 0 |
| 25 to 39 | 1 |
| 40 to 54 | 2 |
| 55+ | 3 |

Compounds are junk. Some are inert, some hurt. They're the mechanical version of the sentence *you're carrying too much*.

Every deckbuilder tells you to keep your deck thin. This one bills you for it, per lap, in the fights that run long. A bloated deck doesn't just dilute your draws, it manufactures garbage while you're trying to win.

### 4.3 Settling (the good part)

At **Reckoning** nodes, you may **Settle** one card.

Settling permanently removes the card from your deck and grants you the **Mark** printed on that card. A Mark is a passive trait on your character sheet.

> **Paper Cut** &nbsp;·&nbsp; Lie &nbsp;·&nbsp; Weight 1 &nbsp;·&nbsp; Attack
> Deal 5.
> *Mark: Whetted. All attacks deal +1.*

You start with **3 Mark slots** and can get to 8. So Settling isn't free power, it's a bidding war over a small board.

The arc that falls out of this is backwards from the genre norm. You start with a small bad deck and finish with a *smaller* deck and an enormous character sheet. By the end of a good run you're playing eight cards that hit like trucks, and they hit like trucks because of eleven passives you bought with cards you deleted.

It also gives every card two lives. A card that's mediocre to play might be worth drafting purely for what it Settles into, which makes the draft actually hard instead of "is the number big."

---

## 5. Run structure

### 5.1 Nodes

| Node | Symbol | What it is |
|---|---|---|
| **Debtor** | · | Normal fight. |
| **Collector** | ✚ | Elite. Harder, always drops a Token. |
| **Assay** | ⚖ | Shop. Pay in **Salt**, or pay in cards. |
| **Reckoning** | ▣ | Settle one card into a Mark. |
| **Wake** | ▲ | Rest. Heal 30%, or upgrade a card, or add a Mark slot for 60 Salt. |
| **Hollow** | ◇ | Event. |
| **Vault** | ✦ | Free Token plus Salt. |
| **Stratum Boss** | ✷ | End of act. |

**Currency is Salt**, mined out of the dead. It is also spendable as a substitute for HP in some events, which keeps it from being pure number-go-up.

### 5.2 Strata

**Act 1 · The Chalk Wards.** Petty debts. Dry, white, administrative. Chalk dust, receipt paper, filing. The visual key is *bone and paper*, almost no red. 12 nodes. Boss: **The Notary**.

**Act 2 · The Brine Choir.** Drowned promises. Flooded, echoing, half-submerged. Debts here are oaths, and oaths keep singing after the person who made them stops. Visual key: brine teal and black water. 16 nodes. Boss: **Mother Sixpence**.

**Act 3 · The Rendering Floor.** Grief and hunger, industrial. This is where debts are melted down and recast into new ones. Hot, brass, rendered fat. Visual key: brass and oxblood. 16 nodes. Boss: **The Assayer**.

**Act 4 · The Ascent.** See §7.

---

## 6. Bosses

### The Notary (Act 1)

A clerk with too many arms and one stamp. Not evil. Employed.

**Phase 1.** Every card you play, the Notary **countersigns** it, which writes a copy into your draw pile as a Compound. Play fast and you drown yourself. Play slow and it kills you. The fight states the game's whole tension in its first sentence.

**Phase 2.** At 50% HP it stops stamping cards and starts stamping your **Marks**, disabling one per lap.

**The out:** the stamp needs ink. There's a two-beat window each lap where it's re-inking. Damage in that window is tripled and cancels the countersign for the lap. It's a rhythm fight wearing a value fight's coat.

### Mother Sixpence (Act 2)

A drowned matron who holds what you promised. She takes cards **out of your deck** mid-fight and puts them in escrow. You reclaim them by hitting her on specific beats. Anything still in escrow when she dies is **gone from your deck permanently**.

Which gives the fight a real dilemma right at the end: rush the kill and eat the loss, or drag out a fight you're already winning to get your best card back.

### The Assayer (Act 3)

Melts debts into other debts. Every lap it **transforms your entire hand** into different cards. You can't plan a combo, you can only play what you're handed, well. Phase 2 starts transforming your **Marks**, which is the first time in the run that the thing at risk is your identity rather than your HP.

### The Compound (Act 4, final)

See §7.

### Elites (Collectors)

- **Bailiff Kesk & Ledger.** Two bodies. Killing one doubles the other's stats. There is no correct order, only a correct pace.
- **The Tithe-Wolf.** Steals Salt on every hit. The Salt is recoverable, but only from its corpse, and only what it has not yet digested (one stack decays per lap).
- **The Widow's Interest.** Does not attack much. Injects Compound cards straight into your hand.
- **The Undertow Bell** *(Act 2)*. Rings on beat 0 of each lap. Every card in your hand gains +1 Weight until you silence it.
- **Chalk Tallyman** *(Act 1)*. Counts your cards played. At 9, executes.

---

## 7. The Inversion (Act 4)

This is the story turn and the structural turn at the same time, and it's the reason the game exists.

At the bottom of the Rendering Floor you find your debt.

It isn't a sin. It's a **person**. A sibling you sold to pay for your apprenticeship, twenty years ago, when you were both children and one of you had to be the one who stayed. You don't remember doing it, because the memory of doing it was the first thing they made you swallow.

They've been down here compounding interest the whole time.

Act 4 isn't deeper. It's up.

The map you already cleared regenerates as an ascent, same topology, inverted, repopulated. Every node you walked past has something in it now, because you woke all of it on the way down. That `Nothing Here` event from Act 1 is not nothing on the way back.

Three mechanical consequences:

1. **The Sibling joins your deck** as four cards you can't remove, can't Settle, and can't upgrade. They get their own HP track next to yours. If they die the run ends, even at full health. Every fight is an escort now.
2. **Ascent enemies play your discards.** Enemy decks on the way up are seeded from the cards you trashed, Settled, or refused on the descent. The Marks you bought come back at you as attacks.
3. **The Compound** is the final boss, the accreted interest of your own descent. Three phases, one per stratum you came through. Its deck is built from your run log, and phase 3 mirrors your Marks back at you.

Store page line: *the final boss is everything you threw away.*

### On the ending

Two outcomes. Neither one is the good ending.

**Discharge.** You pay it. The sibling walks out free and doesn't know who you are. The Ledger closes. You keep nothing, no Marks, no deck, no memory of the descent. This is the "true" clear and it unlocks the Sibling as a playable character.

**Assume.** You keep the debt. The sibling stays down there, and you walk out with everything you built. The save file remembers. Every run after this one starts with an extra Compound in the deck, permanently, and the Notary greets you by name.

Assume isn't a punishment ending. For a lot of players it's the honest answer, and the game should never once editorialise about it.

---

## 8. Characters

Only **Wick** is in the demo. The other three are specced at concept level and must not be built yet.

### Wick, the Ninth Tongue (DEMO CHARACTER, BUILD THIS ONE)

Suit: **Lie**. Fast, low Weight, misdirection, delayed payoffs.

Signature: **Perjury**. Wick's power is saying a thing before it is true and then not getting caught.

Starting HP 68. Starting Mark slots 3.

**Starter deck (10 cards):** 4× Paper Cut, 3× Flinch, 1× Small Print, 1× Second Story, 1× Bald-Faced.

### Orsel Hark, the Salt Widow (concept only)

Suit: **Grief**. Heavy, Weight 3 to 4, retaliation, tanky.

Signature: **Keening**. Her Guard, when it expires, deals its remaining value as damage instead of vanishing. So she wants Guard to run out at exactly the right beat. She is a timing character disguised as a defensive one.

### Small Mercy (concept only)

Suit: **Hunger**. A child-shaped thing that eats its own hand.

Signature: **Swallow**. Exhaust a card from hand to make the next card cost 0 Weight. Swallowed cards return at end of combat as **Bile** variants: upgraded, with a drawback attached.

### The Sibling (concept only, unlockable)

Unlocked by the Discharge ending. Their entire deck is Compound cards. They are the only character who can play junk, and everything they do makes more of it. A "the trash is the build" character.

---

## 9. Card list (demo, 45 cards)

Format: **Name** · Suit · Weight · Type. Effect. *Mark it Settles into.*

Balance numbers here are first-pass. The sim harness (see the tech brief) is what actually tunes them.

### Wick, common (12)

1. **Paper Cut** · Lie · W1 · Attack. Deal 5. *Mark: Whetted. All attacks +1 damage.*
2. **Flinch** · Lie · W1 · Skill. Guard 5. *Mark: Braced. Start each combat with Guard 4.*
3. **Small Print** · Lie · W2 · Attack. Deal 4. Slip 2. *Mark: Fine Print. The first enemy action each lap is Slipped 1.*
4. **Second Story** · Lie · W2 · Skill. Draw 2. *Mark: Wellread. +1 hand cap, draw 1 extra at combat start.*
5. **Alibi** · Lie · W1 · Skill. Guard 3. Perjury 4: Guard 6. *Mark: Corroborated. The first Guard you gain each lap does not decay for 4 beats.*
6. **Sleight** · Theft · W1 · Attack. Deal 3. Gain 2 Salt. *Mark: Light Fingers. Gain 3 extra Salt per combat won.*
7. **Slip the Knot** · Lie · W0 · Skill. Strain 2. Haste 3. *Mark: Loose Weave. Once per lap your next card costs 1 less Weight.*
8. **Cold Read** · Lie · W1 · Skill. Reveal the enemy's next 2 intents. Draw 1. *Mark: Tell. All enemy intents are visible one lap further ahead.*
9. **Bad Faith** · Oath · W2 · Attack. Deal 7. Discard 1. *Mark: Faithless. When you discard a card, deal 2 to a random enemy.*
10. **Nick** · Theft · W1 · Attack. Deal 4. If this kills, Haste 4. *Mark: Cutpurse. Killing an enemy Hastes you 3.*
11. **Winded Excuse** · Lie · W2 · Skill. Guard 4. Draw 1. *Mark: Windbag. Draw 1 extra at the start of each lap.*
12. **Tally Mark** · Theft · W1 · Skill. Gain 4 Salt. Exhaust. *Mark: Bookkeeper. Assay prices reduced 20%.*

### Wick, uncommon (12)

13. **Ninth Tongue** · Lie · W3 · Attack. Deal 6. Echo. *Mark: Silvertongue. The first card you play each lap gains Echo.*
14. **Perjure** · Lie · W0 · Skill. Strain 3. Your next card this lap gains Perjury 6 and costs 0 Weight. *Mark: Sworn Falsely. Perjury effects resolve 2 beats sooner.*
15. **Long Con** · Lie · W2 · Skill. Perjury 12: Deal 30. *Mark: Patience. Resolved Perjury effects deal +50%.*
16. **Two Truths** · Lie · W2 · Attack. Deal 6. Deal 6 again at the start of your next action. *Mark: Doubled. Second hits deal +2.*
17. **Debt of Honour** · Oath · W3 · Skill. Guard 12. Next lap, take 6 damage. *Mark: Bond. Guard cards give +2 Guard. You take 1 damage per lap.*
18. **Sixpence Trick** · Theft · W1 · Attack. Deal 5. Steal 1 Guard per 5 Salt held, max 5. *Mark: Weighted Purse. +1 damage per 25 Salt held, max +4.*
19. **Recant** · Lie · W1 · Skill. Strain 2. Return your last played card to hand at Weight 0. *Mark: Unsaid. Once per combat, return a played card to hand free.*
20. **Hush Money** · Theft · W2 · Skill. Spend 10 Salt: Slip 6. *Mark: Bought Time. All Slip effects +1 beat.*
21. **Grifter's Cough** · Grief · W1 · Attack. Deal 3. Bleed 4. *Mark: Consumptive. All Bleed you apply +2.*
22. **Doubling Back** · Lie · W2 · Skill. Strain 1. Haste 5. Draw 1. *Mark: Quickstep. All Haste effects +1 beat.*
23. **The Long Silence** · Grief · W4 · Skill. Guard 16. All enemies Slip 3. *Mark: Stillness. If you play no card for 6 consecutive beats, gain Guard 8.*
24. **False Ledger** · Lie · W2 · Skill. Remove 1 Compound from your draw pile. Draw 1. *Mark: Cooked Books. Interest generates 1 fewer Compound per lap.*

### Wick, rare (6)

25. **The Ninth Lie** · Lie · W3 · Attack. Deal 10. Perjury 8: Deal 10. Perjury 16: Deal 10. *Mark: Threefold. Perjury effects trigger twice at half value.*
26. **Everything I Told You** · Lie · W5 · Attack. Deal 4 per card in your discard pile. Exhaust. *Mark: Accounted. Start each combat with 4 random cards already in your discard.*
27. **Unwritten** · Lie · W0 · Skill. Strain 5. This lap your cards cost 0 Weight. Exhaust. *Mark: Blank Page. Once per combat your next 2 cards cost 0 Weight.*
28. **Collector's Interest** · Theft · W3 · Skill. Gain 25 Salt. Add 2 Compounds to your draw pile. *Mark: Usury. Gain 15 Salt per lap. Interest is +1 Compound.*
29. **The Face You Made** · Grief · W3 · Attack. Deal damage equal to one third of your missing HP. *Mark: Scarred. +1 damage per 6 HP missing.*
30. **Nothing Owed** · Oath · W4 · Skill. Remove all Compounds from combat. Gain Guard equal to 5× the number removed. *Mark: Absolved. Compounds may be played as: Exhaust, gain Guard 3.*

### Neutral (8)

31. **Salt Ration** · W1 · Skill. Heal 6. Exhaust. *Mark: Provisioned. Heal 4 after each combat.*
32. **Pry Bar** · W2 · Attack. Deal 8, ignores Guard. *Mark: Leverage. Attacks ignore 3 Guard.*
33. **Lamp Oil** · W1 · Skill. Reveal the next 2 map nodes. Draw 1. *Mark: Lantern. The whole map layer is revealed.*
34. **Chalk Line** · W1 · Skill. Guard 4, which does not decay for 3 beats. *Mark: Drawn Line. Guard decays 1 slower.*
35. **Dead Man's Switch** · W2 · Skill. When you would die this combat, heal 15 and Exhaust this instead. *Mark: Deadman. Once per run, survive lethal at 1 HP.*
36. **Common Debt** · W1 · Attack. Deal 4. Costs 1 less Weight per Compound in your discard. *Mark: Familiar. Compounds cost 0 Weight to discard.*
37. **Hand Over Fist** · W3 · Skill. Strain 3. Draw 4. *Mark: Grasping. +2 hand cap.*
38. **Witness** · W2 · Skill. Copy the enemy's next intent into your hand at Weight 2. *Mark: Mimic. Start combat with a copy of the enemy's opening intent.*

### Compound (7), generated by Interest, never drafted

39. **Arrears** · W1. Unplayable. It just sits there.
40. **Accrual** · W1. Unplayable. Take 2 damage when drawn.
41. **Foreclosure** · W0. Unplayable. While in hand, enemies Haste 1 per lap.
42. **Chalk Dust** · W2. Playable: do nothing. Exhaust.
43. **Interest Owed** · W1. Unplayable. At end of combat, add another Interest Owed to your deck.
44. **The Notary's Countersign** · W1. Unplayable. Cannot be removed at Reckoning nodes.
45. **Grief, Unpaid** · W0. Unplayable. While in hand, you cannot gain Guard.

---

## 10. Tokens (demo, 20)

Relics. Fictionally these are objects taken as collateral, which is why they are all small and sad.

1. **A Child's Tooth.** First attack each combat deals +4.
2. **Nine Feet of Rope.** Slip and Haste effects +1 beat.
3. **Someone Else's Wedding Band.** Heal 6 whenever you Settle a card.
4. **A Jar of Teeth.** All Bleed +1.
5. **Unsent Letter.** Draw 1 extra at combat start.
6. **Salt-Rimed Spectacles.** See enemy intents one lap further.
7. **The Notary's Nib.** The first Compound generated each combat becomes a Salt Ration instead.
8. **A Widow's Thimble.** Guard does not decay during the first lap.
9. **Half a Locket.** Below 30% HP, gain Guard 20. Once per combat.
10. **Counterfeit Sixpence.** Assay prices reduced 25%. One purchase in six silently fails.
11. **Ledger Bone.** +1 Mark slot.
12. **Grave Dirt in a Handkerchief.** Heal 8 after each Collector.
13. **A Debt Collector's Whistle.** Enemies start combat Slipped 3.
14. **Milk Tooth Necklace.** Every third card each lap costs 0 Weight.
15. **The Rope You Kept.** Survive lethal once per run at 1 HP.
16. **A Bad Photograph.** See the full intent list of Collectors and bosses at combat start.
17. **Chalk Stub.** The first card each lap gains Echo.
18. **Interest Table.** Interest fires every 30 beats instead of 24.
19. **Borrowed Coat.** +15 max HP. +1 Load on every card in your deck.
20. **Your Own Handwriting.** Settling a card also grants 10 Salt and heals 5.

---

## 11. Act 1 enemies (demo)

### Normal (8)

1. **Chalk Debtor.** 24 HP. Slow, simple, one attack. The tutorial body.
2. **Tallyman's Apprentice.** 30 HP. Slips you. Teaches that the track can be moved.
3. **Dust Clerk.** 34 HP. Gains Guard on a fixed rhythm. Teaches burst timing.
4. **The Owed** (pair). 18 HP each. One buffs the other. Teaches target priority.
5. **Marginalia.** 3× 9 HP. Act on consecutive beats, so they flood the track.
6. **Receipt Wraith.** 30 HP. Its next intent is a copy of the last card you played.
7. **Chalk Hound.** 20 HP. Acts every 3 beats. Punishes heavy cards specifically.
8. **Fined.** 40 HP. A person under a pile of paperwork. Takes 70% reduced damage until the paperwork (12 HP, separate target) is destroyed.

### Collectors (2)

9. **Bailiff Kesk & Ledger.** 45 + 45 HP.
10. **The Tithe-Wolf.** 70 HP.

### Boss (1)

11. **The Notary.** 180 HP, two phases.

---

## 12. Hollows (demo events, 8)

1. **The Confessional Booth.** A stranger wants you to eat something. Take it (a rare card plus 2 Compounds) or refuse. *Refusals are logged. The Compound remembers.*
2. **A Man Selling His Own Name.** 40 Salt for a Mark slot, or take his name instead: gain a card, lose 10 max HP.
3. **The Weighing Room.** Remove any card for free. Its Mark is destroyed and can never be Settled this run.
4. **Chalk Children.** Three small things are hungry. Feed them HP for Salt, Salt for a card, or a card for a Token.
5. **Your Own Handwriting on a Wall.** Read it (see three nodes ahead and the boss's opening intent) or scrub it off (heal 20).
6. **The Ink Well.** Dip a card: it is upgraded, and gains +1 Load.
7. **A Door That Has Been Opened Before.** A free Token. The Compound gains an extra phase.
8. **Nothing Here.** There is nothing here. *(Act 4 disagrees.)*

---

## 13. Tone and writing rules

Anyone writing text for this game follows these.

- **Bureaucratic, not gothic.** The horror is procedural. Nobody cackles. The Notary is doing the paperwork correctly.
- **Short.** Card text under 12 words where you can manage it. Event text under 60.
- **No fantasy nouns.** No mana, no shadow, no eternal. The words this game owns: salt, chalk, ledger, owed, interest, tally, seam, escrow, arrears.
- **Second person, past tense, guilty.** "You told her it was fine." Not "the hero must choose."
- **Never explain the sibling before Act 4.** Foreshadow with absences instead: an extra bowl, a name half scratched out, a starter card whose flavour text is in somebody else's handwriting.
- **Don't editorialise the ending.** Assume and Discharge get identical weight.

---

## 14. Post-demo roadmap (sketch only, do not build)

Kept thin on purpose. All of this changes the moment real people play the demo, and anything I detailed now would just go stale.

- **Milestone B.** Act 2, the Brine Choir. Mother Sixpence. Escrow system. ~35 more cards.
- **Milestone C.** Act 3, the Rendering Floor. The Assayer. Card and Mark transformation systems.
- **Milestone D.** Orsel Hark (Keening) and Small Mercy (Swallow). Roughly 40 cards each.
- **Milestone E.** The Inversion. Run-log recording, map regeneration, the Sibling escort, the Compound.
- **Milestone F.** Ascension-style difficulty ladder, daily seeds, Steam achievements, localization.
- **Milestone G.** The Sibling as a playable unlock.

One thing is worth locking now: **run-log recording has to exist from day one** (see the tech brief). Every card removed, Settled, or exhausted, and every event choice refused, gets written to the run log during the demo even though nothing reads it yet. It costs almost nothing today. Retrofitting it once there are three acts of content is genuinely miserable.
