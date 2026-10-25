---
name: Tangle Anamorphic Studio
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#38393a'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#292a2a'
  surface-container-highest: '#333535'
  on-surface: '#e3e2e2'
  on-surface-variant: '#c0c8c8'
  inverse-surface: '#e3e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#8a9292'
  outline-variant: '#414848'
  surface-tint: '#a5ced0'
  primary: '#f5ffff'
  on-primary: '#0b3638'
  primary-container: '#bfe8ea'
  on-primary-container: '#43696b'
  inverse-primary: '#3e6567'
  secondary: '#bacac9'
  on-secondary: '#253333'
  secondary-container: '#3d4c4c'
  on-secondary-container: '#acbbbb'
  tertiary: '#fffcff'
  on-tertiary: '#352c47'
  tertiary-container: '#e9dafe'
  on-tertiary-container: '#695e7c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c1eaec'
  primary-fixed-dim: '#a5ced0'
  on-primary-fixed: '#002021'
  on-primary-fixed-variant: '#264d4f'
  secondary-fixed: '#d6e6e5'
  secondary-fixed-dim: '#bacac9'
  on-secondary-fixed: '#101e1e'
  on-secondary-fixed-variant: '#3b494a'
  tertiary-fixed: '#ebdcff'
  tertiary-fixed-dim: '#cfc0e3'
  on-tertiary-fixed: '#201731'
  on-tertiary-fixed-variant: '#4c425f'
  background: '#121414'
  on-background: '#e3e2e2'
  surface-variant: '#333535'
typography:
  display-hero:
    fontFamily: Geist
    fontSize: 96px
    fontWeight: '600'
    lineHeight: 100px
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-xl:
    fontFamily: Geist
    fontSize: 56px
    fontWeight: '600'
    lineHeight: 62px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 42px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 19px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 25px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system embodies the ethos of computational optics and cinematic precision. Engineered specifically for simulating, verifying, and deploying forced-perspective 3D anamorphic displays, the interface operates like an optical engineering workstation masked within an Apple-caliber luxury product showcase. The emotional response is one of surgical authority, absolute fidelity, and modern cinematic drama.

The visual direction marries high-end **Minimalism** with controlled **Dark-Mode Optical Skeuomorphism**:
- **Pure Canvas:** Deep obsidian tones (`#131314`) mimic the ambient context of urban skylines at night, allowing 3D anamorphic assets to break the display plane organically.
- **Atmospheric Depth:** Multi-tiered obsidian slabs, optical refraction planes, and 20px frosted backdrop blurs (`backdrop-filter: blur(20px)`).
- **Engineered Restraint:** Monolithic, tight-tracked grotesque typography paired with hairline grid lines (`rgba(255, 255, 255, 0.08)`). Visual weight is maintained through precision and negative space rather than decorative clutter.
- **Hyper-Focused Luminescence:** Color is deployed strictly as optical feedback. A content-driven primary laser hue cuts through the darkness to indicate convergence points, street-level vantage cones, and computational verification.

## Colors

The palette is anchored in a balanced content-driven nocturnal spectrum where deep surfaces eliminate panel edges and focus attention purely on the spatial 3D volume.

### Surface Hierarchy
- **Canvas Base:** `#131314` — Deep void; grounds the viewport and mimics unlit urban night space.
- **Surface Tier 1 (Base Cards / Sidebars):** `#767777` — Subtle structural separation from the canvas.
- **Surface Tier 2 (Elevated Panels / Modals):** `#3a393a` — Foreground interaction planes.
- **Glass Tint Layer:** `rgba(58, 57, 58, 0.72)` combined with 20px blur for non-blocking contextual overlays.

### Monochromatic Text & Borders
- **Text Primary:** `#e5e2e3` — High-legibility off-white, preventing harsh eye fatigue while maintaining contrast.
- **Text Secondary:** `#6b7a7a` — Precision secondary typography for technical labels, dimensional parameters, and inactive metadata.
- **Text Tertiary:** `#3b494a` — Disabled values, grid indicators, and unit markers.
- **Hairline Border:** `rgba(255, 255, 255, 0.08)` — Single-pixel precision rules outlining viewport volumes and surface perimeters.

### Accents & Optical Cues
- **Primary Accent:** `#bfe8ea` — Primary optical accent. Reserved strictly for convergence points, active camera cones, perspective alignment lines, and primary callouts.
- **Accent Glow Fill:** `rgba(191, 232, 234, 0.12)` for state changes and volumetric field highlights.

### Billboard Street-View Verification Statuses
- **PASS:** `#30D158` (Apple Matrix Green) — Optical sweet-spot aligned, zero street distortion.
- **FAIL:** `#FF453A` (Laser Crimson) — Perspective collapse or occluded street vantage.
- **WARNING:** `#FFD60A` (Amber Warning) — Edge distortion or marginal viewing angle.
- **NOT RUN:** `#636366` (Muted Graphite) — Verification engine idle.

## Typography

The typographic engine uses **Geist** for display, headings, and body, exploiting its surgical neo-grotesque geometry and neutral presence. Optical metrics and viewport telemetry leverage **JetBrains Mono** to reinforce the computational simulation environment.

### Typographic Rules
- **Negative Letter Spacing:** All headlines utilize tight negative tracking (ranging from `-0.015em` to `-0.04em`) to establish visual density similar to luxury hardware product architecture.
- **Editorial Hierarchy:** Display headlines must never compete with live 3D viewports. Restrict `display-hero` exclusively to marketing moments, launch states, or top-level canvas hero modules.
- **The 17px Standard:** Body copy anchors firmly at `17px` (`body-lg`) to mirror modern high-density hardware guidelines, preserving comfortable long-form scanning of optical distortion parameters.
- **Telemetry Data:** All coordinate transformations, anamorphic ratios (e.g., `16:9 Corner Wrap 90°`), viewing angles, and status timestamps render strictly in `label-code` using tabular figures.

## Layout & Spacing

Layouts follow an uncompromising baseline rhythm across an engineered 12-column grid system, prioritizing a **Desktop First 1440px** standard viewing viewport for complex 3D simulation tools.

### Layout Mechanics
- **Primary Grid:** 12-column fluid grid locked inside a max-width container of `1440px` with fixed `24px` (`1.5rem`) gutters and `32px` (`2rem`) screen margins.
- **Simulation Viewport Rule:** The primary 3D simulation viewport takes an unbroken 8 or 9-column span, while telemetry and optical validation inspectors occupy a pinned 3 or 4-column glass container.
- **Adaptive Breakpoints:**
  - **Desktop (1440px+):** Full multi-pane dual-viewport layout (Perspective View + Street-Level Simulation side-by-side).
  - **Laptop / Tablet Landscape (1024px – 1439px):** Inspector docks to collapsible overlay panels; gutters compress to `16px`.
  - **Tablet Portrait / Mobile (< 1023px):** Reflows to single-column vertical stack with perspective switcher tabs.
- **Persistent Provenance Anchor:** A fixed-height `48px` bar spans the lower viewport window edge (`bottom: 0`, full width, `z-index: 100`), containing real-time street vantage coordinates, cryptographic asset hash, and live test validation status.

## Elevation & Depth

Visual hierarchy does not use soft diffuse drop-shadows typical of light interfaces. Depth is communicated via **translucent surface stacking, glassmorphic refraction, and laser-precise borders**.

### Stratified Surface Layers
1. **Z-0 (Base Void):** `#131314` canvas background. Hosts infinite viewport coordinates and camera grid floors.
2. **Z-10 (Docked Surfaces & Structural Panes):** `#767777` with a `1px` perimeter border of `rgba(255, 255, 255, 0.08)`.
3. **Z-20 (Floating Panels & Inspector Trays):** `rgba(58, 57, 58, 0.72)` with hardware-accelerated `backdrop-filter: blur(20px)` and an inner hairline specular highlight: `inset 0 1px 0 0 rgba(255, 255, 255, 0.12)`.
4. **Z-30 (Modals, Lens Dialogs & Popovers):** `#3a393a` elevated with an ultra-deep atmospheric shadow: `0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.12)`.

### Optical Glow & Active Highlights
When elements achieve focus or verification passes:
- **Active Verification Glow:** `0 0 24px rgba(191, 232, 234, 0.25)` cast around the verified bounding box.
- **Pass Status State:** `box-shadow: 0 0 16px rgba(48, 209, 88, 0.2)`.

## Shapes

The interface embraces an intentional contrast between generous architectural container curves and compact, functional internal controls.

### Curvature Geometry
- **Primary Surfaces & Viewport Cards:** Pinned precisely to standard container scale to convey an Apple-engineered hardware panel aesthetic.
- **Interactive Controls (Buttons, Inputs, Selectors):** Standardized to communicate surgical instrument utility.
- **Status Pills & Micro Indicators:** Full continuous pill radius (`9999px`) for optical tags, status confirmations, and angle flags.
- **Provenance Bar:** Zero corner radius; fused directly into the browser floor with a continuous `1px` top hairline border.

## Components

### Buttons
- **Primary Optical Action:** Surface `#bfe8ea` text `#131314`, font `Geist Medium 15px`, border `none`, corner radius standard. Hover: brightness `1.08`, box-shadow `0 0 18px rgba(191, 232, 234, 0.4)`.
- **Secondary Surface:** Background `rgba(255, 255, 255, 0.06)`, text `#e5e2e3`, border `1px solid rgba(255, 255, 255, 0.08)`, corner radius standard. Hover: background `rgba(255, 255, 255, 0.1)`.
- **Ghost Action:** Background transparent, text `#6b7a7a`, hover text `#e5e2e3`.

### Cards & 3D Stage Viewports
- Outer wrapper crafted with structural corner radius, `#767777` background, and `1px solid rgba(255, 255, 255, 0.08)`.
- Internal camera viewports incorporate a subtle inset shadow (`inset 0 0 32px rgba(0, 0, 0, 0.6)`) to visually set back the simulated scene into the billboard chassis.

### Chips & Status Badges
- Engineered capsules featuring `JetBrains Mono 11px` uppercase typography, height `24px`, padding `0 10px`, border radius `9999px`.
- **PASS:** Background `rgba(48, 209, 88, 0.12)`, text `#30D158`, border `1px solid rgba(48, 209, 88, 0.25)`.
- **FAIL:** Background `rgba(255, 69, 58, 0.12)`, text `#FF453A`, border `1px solid rgba(255, 69, 58, 0.25)`.
- **WARNING:** Background `rgba(255, 214, 10, 0.12)`, text `#FFD60A`, border `1px solid rgba(255, 214, 10, 0.25)`.
- **NOT RUN:** Background `rgba(99, 99, 102, 0.12)`, text `#6b7a7a`, border `1px solid rgba(99, 99, 102, 0.25)`.

### Form Inputs & Coordinate Sliders
- **Input Fields:** Height `40px`, background `#3a393a`, border `1px solid rgba(255, 255, 255, 0.08)`, corner radius standard, text `#e5e2e3` (`15px`), placeholder `#3b494a`. Active focus ring: `1px solid #bfe8ea` with a cyan ambient halo `0 0 8px rgba(191, 232, 234, 0.3)`.
- **Anamorphic Warp Sliders:** Track height `4px`, background `rgba(255, 255, 255, 0.12)`, active progress fill `#bfe8ea`. Thumb size `16px`, solid `#e5e2e3`, shadow `0 2px 8px rgba(0,0,0,0.8)`.

### Selection Controls (Radio & Checkbox)
- Custom elements sized to `18px`.
- Inactive state: Border `1px solid rgba(255, 255, 255, 0.2)`, background `transparent`.
- Checked state: Fill `#bfe8ea`, icon/dot `#131314`.

### Provenance Bar (Persistent Bottom Anchor)
- Positioned fixed at `bottom: 0`, `left: 0`, width `100%`, height `48px`.
- Background: `rgba(11, 11, 12, 0.85)` with `backdrop-filter: blur(20px)`.
- Border-top: `1px solid rgba(255, 255, 255, 0.08)`.
- Contents: Flex layout with space-between alignment:
  - Left: Pedestrian focal coordinates `X, Y, Z` in `JetBrains Mono 12px` (`#6b7a7a`).
  - Center: Verification engine pulse dot (`#bfe8ea` or `#30D158`) with live verdict label.
  - Right: Cryptographic hardware simulation hash & resolution output (`e.g., 8192×4320 @ 60fps`).