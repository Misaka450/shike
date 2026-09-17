---
name: Intelligent Refrigerator & Culinary Assistant
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#b61722'
  on-tertiary: '#ffffff'
  tertiary-container: '#da3437'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.005em
  metric-headline:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.02em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-pill:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.005em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

The design system embodies the clinical precision of smart home sensing synthesized with the warmth of modern culinary care. Designed under strict Apple Human Interface Guidelines (HIG) standards, it communicates absolute clarity, hyper-freshness, and proactive intelligence. 

The aesthetic is light-only, clean, and disciplined:
- **Tone & Mood:** Reassuring, effortless, crisp, and scientifically organized. It replaces household kitchen anxiety (food spoilage, repetitive meal loops) with systematic ease and visual calm.
- **Design Philosophy:** Human-centric utility. Content and state lead; the chrome recedes. Information density is managed through structural hierarchy, hairline boundaries, and deliberate negative space rather than decorative visual elements.
- **Visual Stance:** Monochromatic structural foundations accented with semantic status signals (Fresh, Imminent Expiry, Past Due). Photography is treated as documentary evidence—clean, high-key, natural illumination. No decorative cartoon icons or visual clutter are permitted.

## Colors

The palette operates under a strict daylight canvas architecture with mathematically separated contrast tiers.

### Surface Canvas & Tiers
- **Base Canvas:** `#F8FAFC` (Slate 50) creates an optical foundation that eliminates eye fatigue while maintaining brightness.
- **Surface Level 1 (Card & Module):** `#FFFFFF` (Pure White).
- **Surface Level 2 (Sub-containers / Input Wells):** `#F1F5F9` (Slate 100).
- **Hairline Dividers & Outlines:** `rgba(226, 232, 240, 0.8)` (Slate 200 at 80% opacity) coupled with internal top-edge specularity.

### Semantic Status Palette
- **Freshness & Positive Actions (Emerald):**
  - Primary Base: `#059669` (Emerald 600) — Main CTAs, optimal temperature badges, fresh ingredient indicators.
  - Hover / Interactive: `#10B981` (Emerald 500).
  - Wash / Tint: `#ECFDF5` (Emerald 50) — Micro-surfaces, pill backgrounds.
  - Hairline Stroke: `rgba(5, 150, 105, 0.2)`.
- **Expiring Soon Alert (Amber):**
  - Primary Base: `#F59E0B` (Amber 500) — Warning states within 48h shelf life.
  - Wash / Tint: `#FEF3C7` (Amber 100).
  - Hairline Stroke: `rgba(245, 158, 11, 0.25)`.
- **Expired Alert (Coral Red):**
  - Primary Base: `#EF4444` (Red 500) — Critical spoiled alerts, disposal recommendations.
  - Wash / Tint: `#FEE2E2` (Red 100).
  - Hairline Stroke: `rgba(239, 68, 68, 0.25)`.

### Typographic Contrast Tiers
- **Primary Ink:** `#0F172A` (Slate 900) — Titles, ingredient names, critical data (WCAG AAA compliant).
- **Secondary / Supporting Ink:** `#64748B` (Slate 500) — Subheaders, category tags, macro nutrients.
- **Tertiary / Meta Ink:** `#94A3B8` (Slate 400) — Timestamps, sensor units, secondary metrics.

## Typography

The type system prioritizes legibility, typographic rhythm, and data scanning. It falls back smoothly across `SF Pro Display`, `SF Pro Text`, `Inter`, and `PingFang SC` for Chinese glyph support.

### Typographic Rules & Numerical Data
- **Tabular Figures:** All counts, weights (e.g., `450g`), days remaining (e.g., `02d 14h`), calorie values, and sensor readouts must use the OpenType feature `font-feature-settings: "tnum"` or the CSS utility `tabular-nums`. This prevents layout jitter during real-time tracking updates.
- **Hierarchy of Scale:** Headlines use tight negative tracking (`-0.01em` to `-0.025em`) to echo modern editorial interfaces, while small metadata (`label-caps`) leverages wider tracking (`0.04em`) with uppercase styling for scanning clarity.
- **Line Length:** Body text in culinary instructions or dietary notes is capped at a maximum measure of 65 characters per line to ensure effortless reading.

## Layout & Spacing

The layout is built on an ergonomic, screen-optimized multi-column canvas engineered specifically for high-density culinary and inventory tracking.

### Desktop Studio Architecture (1280px+)
Desktop displays use a fixed-to-fluid 3-column operational layout:
1. **Left Primary Rail (240px fixed):** Navigation anchors, zone selectors (Chiller, Deep Freeze, Pantry), device health gauges, and settings.
2. **Center Workspace (Fluid min 560px):** Dynamic inventory grid, shelf visualization, freshness timelines, and recipe synthesis views.
3. **Right Intelligence Sidebar (380px fixed):** Meal recommendation engine, active grocery consumption queue, and micro-nutrient tracking.

### Tablet (768px – 1279px)
The left rail collapses to an icon-only 72px dock. The right intelligence sidebar transforms into a slide-over floating panel triggered by an persistent status badge.

### Mobile Viewports (< 768px)
Single-column vertical stack. The left rail converts to an ultra-thin bottom navigation bar with frosted translucent backing. Critical alerts sit pinned to the top safe area.

### Grid & Padding Rhythm
- Spacing follows an 8px rhythmic baseline.
- Card padding scales contextually: `16px` for small sensor modules, `24px` for meal blueprint cards, and `32px` for primary summary overviews.

## Elevation & Depth

In alignment with Apple HIG standards, visual separation is achieved through tonal layering and micro-hairlines rather than heavy, drop shadows. The canvas feels physically engineered, pristine, and optical.

### The Pure Surface Stack
- **Layer 0 (Canvas Base):** Flat `#F8FAFC`.
- **Layer 1 (Cards & Standard Shelves):** Background `#FFFFFF`.
  - Border: `1px solid rgba(226, 232, 240, 0.8)`.
  - Edge Highlight: `box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.8)`.
  - Ambient Shadow: `0 1px 3px rgba(15, 23, 42, 0.03), 0 6px 16px rgba(15, 23, 42, 0.02)`.
- **Layer 2 (Floating Popovers, Flyouts & Modals):** Background `#FFFFFF`.
  - Border: `1px solid rgba(226, 232, 240, 0.9)`.
  - Ambient Shadow: `0 8px 24px -4px rgba(15, 23, 42, 0.06), 0 20px 48px -8px rgba(15, 23, 42, 0.04)`.
- **Layer 3 (Active Item Hover):** Translates `translateY(-1px)` with elevation shadow expanding to `0 4px 12px rgba(15, 23, 42, 0.05)`.

## Shapes

The interface balances soft industrial roundedness with crisp functional geometries, matching premium smart-device hardware.

### Corner Radius System
- **Container / Primary Cards:** `24px` (`rounded-3xl`) — Large modular panels, hero panels, and refrigerator compartment overviews.
- **Secondary Modules & Sub-wells:** `16px` (`rounded-2xl`) — Metric groupings, camera feed monitors, and recipe step lists.
- **Input Fields & Sub-cards:** `12px` (`rounded-xl`) — Form elements, item search bars, quantity adjusters, and nested ingredient rows.
- **Pills & Capsule Shapes:** `9999px` (`rounded-full`) — Status indicators, dynamic filter chips, tab switchers, and primary CTA buttons.

## Components

### Buttons & Interactive Controls
- **Primary CTA:** Capsule shape (`rounded-full`), height `44px` (touch-target compliant), background `#059669`, text `#FFFFFF`, typography `label-pill` with `font-weight: 600`. Hover state shifts to `#10B981`. Active state applies `transform: scale(0.98)`.
- **Secondary Button:** Capsule shape, height `44px`, background `#FFFFFF`, border `1px solid rgba(226, 232, 240, 0.8)`, text `#0F172A`. Hover: background `#F1F5F9`.
- **Destructive CTA:** Capsule shape, background `#FEE2E2`, text `#EF4444`, border `1px solid rgba(239, 68, 68, 0.2)`. Hover: background `#EF4444`, text `#FFFFFF`.

### Chips & Status Capsules
- **Structure:** Height `26px`, padding `0 10px`, inline-flex items-center, `rounded-full`.
- **Variants:**
  - *Fresh / Active:* `#ECFDF5` background, `#059669` text, `4px` solid `#059669` leading status dot.
  - *Expiring Soon (<= 48h):* `#FEF3C7` background, `#D97706` text, `4px` solid `#F59E0B` dot.
  - *Expired / Critical:* `#FEE2E2` background, `#DC2626` text, `4px` solid `#EF4444` dot.
  - *Tag / Filter:* `#F1F5F9` background, `#64748B` text, interactive toggle.

### Inventory List Rows
- Height `64px`, horizontal flexbox with tabular layout.
- Leading: `44x44px` squared ingredient preview with `8px` corner radius, subtle `rgba(0,0,0,0.03)` inner border.
- Center: Item title in `headline-sm`, subtitle with storage zone and entry date in `body-sm`.
- Trailing: Expiry countdown (e.g., `3 days left`) formatted in `tabular-nums` followed by an inline freshness capsule and context menu icon button.

### Form Inputs & Search Fields
- Height `44px`, `rounded-xl`, background `#F8FAFC`, border `1px solid rgba(226, 232, 240, 0.8)`.
- Focused state: background `#FFFFFF`, border `1px solid #059669`, box-shadow `0 0 0 3px rgba(5, 150, 105, 0.12)`.
- Integrated search: Monochromatic magnifying stroke icon (`18px`) left-aligned, trailing clear capsule button.

### Culinary Photography & Recipe Blueprint Cards
- Border radius `24px`, background `#FFFFFF`, border `1px solid rgba(226, 232, 240, 0.8)`.
- Ratio: 16:10 high-resolution food photography header with clean edge-to-edge bleed, rounded at the card's top corners.
- Overlay badges: Cooking time, estimated ingredient match percentage (e.g., `92% Fridge Match` in `#ECFDF5` pill), and macro summary (`tabular-nums`).

### Iconography Guidelines
- Strict vector outline stroke (`1.75px` stroke width, geometric linecaps `round`, linejoins `round`).
- Monochrome execution: `#0F172A` for primary navigational anchors, `#64748B` for auxiliary actions. Emojis and filled glyphs are not permitted.