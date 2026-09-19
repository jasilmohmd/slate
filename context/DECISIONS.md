# Decisions

## Step 1 — artifact base CSS

- Light "paper/ink" palette for generated artifacts, not the builder's dark
  stone/chalk theme. §5c's stone/chalk palette is scoped to "the Slate
  builder" UI; a light background reads better under §2a's "assume a dim
  bulb and a daylit room" — dark backgrounds wash out under ambient light on
  a projector, light backgrounds don't.
- Axis 1 (size) and axis 2 (aspect) are implemented as two independent media
  queries — `(min-width: 900px)` for type scale/stroke, `(orientation:
  landscape)` for scene/chrome layout — so they can never collapse into one
  breakpoint by accident, per §2a's explicit warning.
- The base CSS supplies tokens and the scene/chrome flex containers only. It
  deliberately does not implement the scene reframe/pan algorithm or the
  in-scene label HTML-overlay technique — both are content-specific and
  belong to each artifact's own markup/JS (starting with the step 2
  reference artifact).
- Accent colours were picked conservatively dark against the light paper
  background to keep margin above the 4.5:1 text contrast floor; exact
  contrast ratios are validated by Tier 1 iframe verification in step 4, not
  hand-computed here.

