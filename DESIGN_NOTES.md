# Kinetic Optics Redesign Notes

This redesign turns Nova TV from a conventional static IPTV browser into a visual-material prototype inspired by research into Aqua, Aero, iOS translucency, Material elevation, Fluent Acrylic/Mica, visionOS glass, Apple's Liquid Glass, and real-time rendering techniques.

The objective is not to copy Liquid Glass. The objective is to create a distinct web-native interface material language that uses optical behaviour only where it improves hierarchy, legibility, and interaction feedback.

## Core principle

> Do not make the app transparent everywhere. Use selective optical responsiveness.

The UI should become more material, more opaque, or more stable when content is busy or when a decision matters. It should become lighter and more expressive only where the user benefits from it.

## Techniques applied

### 1. Adaptive edge lensing

Used on:

- hero card
- topbar
- player overlay
- channel cards
- command palette

The centre of each surface stays readable. The optical energy lives mostly at the rim through layered borders, prismatic gradients, pointer highlights, and subtle inner lighting.

### 2. Context fog

Used on:

- hero text area
- player overlay
- sticky topbar
- modal/picker backgrounds

Instead of putting text directly over video or noisy gradients, the design adds local darkness/frost behind important copy. This follows the rule that glass should clarify hierarchy, not reduce contrast.

### 3. Pressure-style controls

Used on:

- buttons
- nav items
- cards
- player controls
- command controls

Controls compress on interaction and produce a localized light pulse. The visual metaphor is not a plastic button; it is a responsive optical material reacting to contact.

### 4. Contact-light propagation

Implemented in `assets/js/app.js` through pointer-based radial ripples appended to the interacted surface. This gives buttons, cards, nav items, and panels a touch-energy response.

### 5. Living highlight field

The app tracks pointer position and writes `--mx` / `--my` CSS variables to active optical elements. CSS then uses those variables to move highlights, gradients, and rim energy.

### 6. Holo tilt

Channel cards and bento tiles rotate subtly based on pointer location. This suggests optical depth without needing heavy WebGL.

### 7. Signal Wall

The old multiview feature was reframed as **Signal Wall**. It keeps the advanced viewing idea but presents it as a controlled public-stream wall with muted tiles by default.

### 8. Magnetic focus halo

Keyboard focus uses a strong white outline plus cyan/violet outer fields. The glow is decorative; the real outline is still present for accessibility.

### 9. Reduced motion and transparency fallbacks

The CSS includes fallbacks for:

- `prefers-reduced-motion`
- `prefers-reduced-transparency`
- `prefers-contrast: more`
- missing `backdrop-filter` support

In these modes, the interface becomes more solid and less animated rather than broken.

## Safety/content decisions

The redesign intentionally removed the exposed adult-content toggle and filters NSFW channels in JavaScript before rendering. It also avoids adding new questionable IPTV sources. The app should stay focused on public, legal, safe-by-default channel browsing.

## Future upgrades

The current build is CSS/vanilla JS only. A future advanced version could add:

- WebGL screen-space refraction for true edge lensing
- a canvas-based backdrop complexity sampler for automatic context fog
- WebGPU caustic shadows on flagship browsers
- real source-health scoring
- EPG schedule overlays from legal public metadata
- a PWA install manifest
- offline shell caching for the UI only
