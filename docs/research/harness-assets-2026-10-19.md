# Harness visual assets — 2026-10-19

Art direction: AI Evolution Polska's dark ink, cyan and violet palette; a distinct violet sidebar, quiet technical typography and tactile abstract objects. These images are decorative concepts, not photos of a product or a claim about hardware. No brand logo was regenerated.

## Generated illustrations

Created with the built-in OpenAI image generation tool (`image_gen.imagegen`), without reference images; opaque backgrounds. The project-local originals are used directly, without local text overlays.

| Final file | Generation brief |
| --- | --- |
| `src/renderer/assets/evolution-orbit.png` | Wide 16:9 abstract premium SaaS illustration. Black glass monolith in the right third, a cyan luminous core, restrained violet rim lighting and two thin orbital arcs. Ink-navy negative space across the left 65 percent for UI copy; tactile studio materials, subtle reflections. No text, logo, UI mockup, robots or people. |
| `src/renderer/assets/shared-archive.png` | Wide 16:9 conceptual shared-memory archive. Five suspended smoked-glass lamellae on the right, joined by fine cyan threads with restrained violet reflections. Calm ink-blue left 65 percent; premium studio lighting, dimensional glass and soft shadows. No text, logo, UI, robots or people. |

These briefs document the production intent; the application supplies accessible text and controls separately. CSS uses gradients for text legibility and a reduced-motion fallback.

## Font and icons

- **Sora variable:** downloaded from the official [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/sora). Local file `src/renderer/fonts/Sora-Variable.ttf`; SIL Open Font License retained in `Sora-OFL.txt` and included in packaging. No runtime font request is made.
- **Lucide React 1.59.0:** pinned npm dependency for interface icons. [Upstream license](https://lucide.dev/license); its installed license text is collected by `npm run notices` and shipped with third-party notices. Lucide is not used to imply endorsement by model vendors.
- The existing Agenting OS app mark and provider treatments remain part of the original interface. Inter's existing OFL notice remains in the distribution.

Actual Electron captures and measured contrast results: [harness evidence](../evidence/harness-08/README.md).
