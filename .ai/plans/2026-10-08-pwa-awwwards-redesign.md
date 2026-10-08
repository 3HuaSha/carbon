# Implementation Plan - MES PWA Awwwards-Level Design & Interactive Overhaul

Transform the MES PWA frontend into an Awwwards/FWA-caliber digital interactive experience with avant-garde industrial cyber-brutalism aesthetics, generative ambient canvas, experimental typography, and kinetic micro-interactions.

## User Requirements & Scope
- **Design Target**: Awwwards / FWA / CSS Design Awards "Site of the Day" caliber.
- **Visual Style**: Avant-Garde Industrial Cybernetic OS, experimental typography, kinetic physics, generative canvas background, futuristic shop floor HUD.
- **Pages in Scope**:
  1. Main Shop Overview (`/shop` - Layout, Header, MachineGrid, MachineTile, TabNav)
  2. Machine Detail Page (`/shop/:workCenterId` - MachineDetailPage)
  3. Repair Crew Page (`/shop/repair` - ShopCrewPage)
  4. Mold Crew Page (`/shop/mold` - ShopCrewPage)
  *(PWA install sheet/welcome excluded as specified)*

## Architecture & Implementation Steps

### Step 1: Design Tokens & Generative Canvas Component
- Create `CyberCanvas.tsx`: Lightweight, ultra-performant 60fps interactive particle matrix and laser grid backdrop with fluid dampening to pointer movement.
- Upgrade `apps/mes/app/styles/shop-ios.css` (or new cybernetic theme stylesheet):
  - Deep obsidian dark background (`#08090d`, `#0f131a`)
  - Acid neon status accents: Hyper-green (Run), Plasma-red (Down), Electric-amber (Standby/Awaiting), Cyan/Cobalt (Break/Repair)
  - Holographic glassmorphism, glowing borders, scanline patterns, hazard warning stripes, and kinetic spring-press transitions.
- Update `shopIos.ts` classes to leverage modern cyber-industrial utilities.

### Step 2: Global Shop Layout & Floating Dock Nav
- Upgrade `apps/mes/app/routes/shop+/_layout.tsx`:
  - Mount background generative `CyberCanvas`.
  - Apply futuristic HUD frame and immersive viewport padding.
- Upgrade `ShopTabNav.tsx`:
  - Replace plain blocks with a futuristic floating tactical dock.
  - Glowing status pills, neon active state, experimental micro-labels.

### Step 3: Main Shop Overview Page
- Upgrade `ShopHeader.tsx`:
  - Command Center header with experimental high-impact typography.
  - Large tabular running status telemetry, animated pulse gauges.
  - Tactical segmented filter strip with micro-meters and laser under-glow.
- Upgrade `MachineGrid.tsx` & `MachineTile.tsx`:
  - Reactor-style machine tiles with HUD crosshair accents, pulsating crystal status cores, laser badges, and sleek typography.
  - Aisle divider transformed into high-tech factory sector delimiter lines.

### Step 4: Machine Detail Page
- Upgrade `MachineDetailPage.tsx`:
  - Holographic command header with glowing status pillar and machine identity banner.
  - Work order card transformed into a high-precision telemetry readout with laser etched typography.
  - Problem reporting & dispatch actions redesigned with tactical control pads, glowing glass cards, and smooth modal forms.

### Step 5: Repair & Mold Crew Command Pages
- Upgrade `ShopCrewPage.tsx`:
  - Tactical engineering operative roster with neon status badges.
  - Mission assignment status chips and high-tech dossier list view.

### Step 6: Verification & Polish
- Run TypeScript typecheck: `pnpm exec turbo run typecheck --filter=@carbon/mes`.
- Verify responsive layout, touch interactions, performance, and dark/light mode elegance.
