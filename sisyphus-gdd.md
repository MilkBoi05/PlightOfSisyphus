Sisyphus Incremental
Game Design Document — Comprehensive Specification
Status: Living Document — Active Prototype PhaseCurrent Build: Prototype Phase. Core pixel art assets locked (96×96 Sisyphus push sprite & 128×128 spherical boulder). AI-assisted animation pipeline established.

1. Vision
An idle/incremental clicker built on the myth of Sisyphus, played for dark-comedy tone and satisfying numbers-go-up progression. v1 established the core loop (push boulder, hit summit, get mocked by Hades, prestige). The next iteration's goals are (a) engagement depth in the moment-to-moment loop, (b) a real visual identity via pixel art, and (c) a comedic identity distinct enough from Supergiant's Hades to stand on its own.
Tonal direction (locked, narrowed): Only the Hades–Sisyphus relationship carries the corporate flavor — Hades as a passive-aggressive middle manager delivering performance reviews at every summit. Everything else (Run Upgrades, Skill Tree, Spite, Underworld allies) keeps its mythic naming and voice; the joke stays sharp by staying contained to one relationship instead of diluting across every system.
2. Problem Statement
Player feedback: "Just clicking isn't engaging enough." The core loop is mechanically sound but has no skill expression — every click is identical, there's no reason to pay attention to the screen versus tabbing away, and there's no moment-to-moment decision-making.
3. Goals
Give active play a noticeably better payoff than passive/idle play, without making idle play feel punished.
Add at least one system that rewards timing/attention (catching weight-reducing ally spells mid-flight) and one that rewards sustained input (building and sustaining Momentum).
Keep the dark-comedy Greek-myth tone consistent in naming, flavor text, and visual treatment.
Preserve a real difficulty curve across a run (late mountain should feel harder) without ever taking progress away from the player.
Replace procedural placeholder graphics with real 2D pixel art at 96×96 base scale, utilizing an AI-assisted pipeline (RetroDiffusion) for smooth multi-frame animation.
4. Non-Goals
Not turning this into a reaction/rhythm game — bonus windows should be generous, not frame-perfect.
Not adding punishing fail-states, stamina lockout, or input blocking that make idle players feel like they're losing by not engaging.
Not building a large relic pool or deep synergy system at launch — starting small (6–10 relics) and expanding post-launch.
Not building the tiered (scrawny/athletic/titan) sprite system in the initial pixel-art pass — deferred to post-launch.
5. Target Player Experience
Player is idly clicking, then notices something light up on the path — a glowing levitation orb or feather launched by an ally — clicks or sweeps across it, gets a satisfying visual effect on the boulder, and feels good. Sustained clicking builds Momentum, making every click feel increasingly impactful (+10% base boost, scaling higher with upgrades). Over a session, a skilled/attentive player should meaningfully outperform a pure-idle player, but a pure-idle player should never feel like the game is unplayable without engagement.
6. Core Gameplay Loop
6.1 The Loop
1. The click (micro loop): Tap the boulder or push button for Defiance (currency) and Distance (progress toward 1000m summit). Rapid clicking builds Momentum, boosting efficiency up to 1.1x+ base. Passive upgrades add small amounts of both per second.
2. The run (0m → 1000m): Distance never decreases. Instead, each stretch of mountain requires more cumulative throughput, so early meters feel close to free and late meters visibly slow down without stat investment.
3. The summit (prestige beat): Hit 1000m, Hades appears and mocks the player, boulder rolls back to 0. Reward: Spite (currency scaled to run output) plus a choice between relics for the next run. Run Upgrades wipe.
4. The skill tree (meta loop): Spite is spent on a permanent Skill Tree that strengthens every future run across six independent stat branches.
5. The escape valve (endgame): On the 5th summit, a Victory cutscene replaces the mocking one — Sisyphus throws Hades down the mountain. Permanent +50% output bonus, shifting into endless New Game+.
6.2 Progression Stats & Bottlenecks
Difficulty scales via Grip Capacity (a soft ceiling on push conversion) and six distinct stat bottlenecks:
Stat
What it does
v1 Equivalent / Notes
Might
Raw Defiance/Distance generated per click
Calloused Hands' old job
Grip
The capacity ceiling soft-cap on push throughput
New stat, replaces drag function
Momentum
Active play multiplier — builds with active clicking (+10% base boost)
Replaces old stamina/Endurance concept; purely additive
Traction
Efficiency: Distance gained per unit of Might
What Spiked Sandals / Chalked Path become
Colony Throughput
Passive automation via Shades (other damned souls)
Renamed from v1's 'Trained Ants'
Profit Multiplier
Defiance earned per unit of Distance gained
New — Egg Inc 'egg value' equivalent

6.3 Run Upgrades & Skill Tree Structure
Upgrade Name
Target Stat
Notes
Calloused Hands
Might
Unchanged from v1
Spiked Sandals
Traction
Unchanged from v1
Shades
Colony Throughput
Renamed from Trained Ants
Chalked Grip
Grip
Renamed from Chalked Path
Steady Rhythm
Momentum
Upgrades active click boost cap, build rate, and decay buffer
Grudge Ledger
Profit Multiplier
Accumulated resentment makes each meter worth more Defiance

7. Art & Rendering Direction
7.1 Sprite Scale Standards (96×96 Grid)
Asset Class
Proposed Size
Design Notes
Sisyphus (Hero)
96 × 96 px
Bounding box; locked forward-pushing pose (sisyphus_push_base.png). 6-frame push cycle target.
The Boulder
128 × 128 px
Spherical granite rock with crack details (boulder.png). Center origin for rotation.
Ally Spells / Tools
32 × 32 px
High-contrast glowing shapes paired with bright procedural particle trails
Environment / Path
32px or 48px tile grid
Modular ground tiles; parallax mountain/sky background layers

7.2 AI-Assisted Art Pipeline
To overcome animation solo-dev constraints, production utilizes RetroDiffusion (Aseprite extension) for sprite generation, 6-frame push cycle generation, and multi-frame roll sheets. High-detail cutscenes (Hades) and parallax backgrounds are generated via AI and color-indexed to the game's palette.
8. Feature Spec: Momentum System
Rapid clicking fills a Momentum Bar (0% to 100%). At 100%, clicks receive a +10% base output boost. A decay delay buffer ensures taking a brief pause to catch ally spells does not drain momentum.
9. Feature Spec: Biome Hazard Zones & Ally Rescue Squad
As Sisyphus ascends through distinct biomes, a roster of mythic allies (fellow outcasts, sympathetic Titans, and master builders) throw weight-reducing spells, levitation orbs, and mechanical tools directly at the boulder to help him overcome Hades' rigged mountain physics.
Mechanical Framework: Every projectile physically alters the boulder's mass, friction, or gravity state. Catching a projectile mid-flight yields a massive active boost, while letting it land on the boulder still grants a passive base benefit (pure positive reinforcement, no punishing fail-states).
Ally
Spell / Tool Projectile
Boulder Effect / Catch Outcome
Passive Impact Outcome
Hermes(Speed & Trickery)
Hermetic Feathers & Zephyr Gusts(Golden plumes)
Density Cut: Boulder sprouts spectral wings. +2.0x Distance conversion & maxes Momentum.
+30% Traction boost for 5 seconds as the rock feels light.
Hephaestus(Master Craftsman)
Molten Lubricant & Chisels(Orange magma vials)
Friction Elimination: Clears resistance. +40% Grip Capacity for 8s + Defiance payout.
Oil splatters path: Smooth 4s Traction boost; rock glides effortlessly.
Prometheus(Titan of Hope)
Titan Embers & Updraft Cinders(Blazing embers)
Gravity Defiance: Boulder gets thermal updraft; 3x push distance per click for 4s.
Heats boulder: Freezes Momentum decay delay so active bonus stays maxed.
Hecate(Goddess of Magic)
Lunar Levitation Orbs(Violet/silver arcs)
Anti-Gravity Pulse: Drops Grip drag to 0 for 5s (early-slope speed on late mountain).
Energy wave pulse: Auto-completes 15 meters of Distance instantly.
Daedalus(Master Architect)
Pulleys & Lever Wedges(Wooden tools)
Mechanical Advantage: Permanent +10% Grip Capacity boost for current run.
Slips wedge behind rock: Prevents progress slowing; 2x Shades output.

10. Feature Spec: Relic & Artifact Draft System
Offered at each summit alongside Spite payout. Player chooses 1 of 2 offered relics for the next run only. Relics act as direct modifiers to the six core stats, featuring tradeoffs (e.g., Midas' Curse: +40% Profit Multiplier, -15% Grip). Initial pool: 6–10 relics.
11. Parked Ideas & Open Decisions
Larger relic pool & deep synergies deferred to post-launch updates.
Stamina lockout & input penalties permanently cut in favor of Momentum.
Tiered evolution sprites deferred from launch pass.
Open Decisions: Exact numerical formulas for Run Upgrades and 18 Skill Tree nodes, starting pool of 8 relics, and exact projectile trajectory parameters.
12. Tone & Business Plan
Tonal Framing: Only the Hades–Sisyphus relationship carries corporate satire (passive-aggressive performance reviews). All other gods and mythic allies retain classic mythic humor and rebellion dynamics.
Commercial Target: Modest $5,000 AUD financial goal at an $8 AUD (~$5.20 USD) price point on Steam (~890 units needed).
Scope Alignment: 96×96 hero sprite, procedural VFX, streamlined stat system, AI-assisted RetroDiffusion pipeline, and small relic pool ensure manageable scope for a solo/small developer.
