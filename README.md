# Sisyphus Incremental

Playable v1 prototype — push the boulder, climb 0→1000m, collect Defiance, summit for Spite, invest in the permanent Skill Tree.

## Run

```bash
cd C:\Users\Brad\Documents\PlightOfSisyphus
npm install
npm run dev
```

Opens at **http://localhost:5188** (or the next free port Vite prints).

## Controls

- Click the **boulder / canvas** or **PUSH** button (Space / E also work)
- Rapid clicks build **Momentum** (+10% base boost at full bar, 1.2s decay buffer)
- Buy **Run Upgrades** with Defiance (reset on summit)
- Spend **Spite** on the **Skill Tree** (permanent)

## What's in v1

| System | Behavior |
|--------|----------|
| Grip soft-cap | Distance conversion slows near capacity / late mountain; never reverses |
| Momentum | Build on click → boost scales 1.0→1.10+; 1.2s buffer then decay |
| 6 Run Upgrades | Might, Traction, Shades, Grip, Momentum, Profit |
| Summit | Hades corporate review → Spite → wipe run upgrades |
| Skill Tree | 6 branches × 3 nodes, paid with Spite |
| Victory | 5th summit unlocks NG+ (+50% output) |

## Assets

Pixel art in `/assets` (Vite `publicDir`):

- `background.png` — scenic underworld valley backdrop
- `hill.png` — climbable slope (drawn flipped for right→left ascent)
- `sisyphus.png` — hero push sprite
- `boulder.png` — spherical boulder (rotates on push)
