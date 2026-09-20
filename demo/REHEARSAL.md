# Rehearsal checklist

Two pre-generated, pre-verified artifacts are in this folder — open them
directly (double-click, no server, no internet) if the venue network or
the live deploy fails during the demo:

- `parallel-series-circuits.html` — Band B, class 9, the hand-verified
  reference artifact.
- `motion-graphs.html` — Band B, class 9, linked position–time and
  velocity–time graphs; generated and verified through the real pipeline
  (1 repair attempt, then a clean pass).

## Suggested run-through

1. **Open with the concept, not the tool.** State the problem once:
   teachers with textbook photos and no coding knowledge need verified,
   offline-safe interactive material fast.
2. **Show a pre-generated artifact first**, phone-sized. Walk the
   prediction → reveal → explanation flow as a student would. Toggle to
   projector width in the preview to show the same file adapting with no
   mode switch — that's the whole point of §2a.
3. **Then do exactly one live generation** in the builder UI, with a
   different goal than either pre-generated file, and let the checks list
   tick through live. This is the credibility beat — don't skip it, but
   don't do more than one, since it's a real (if fast) API call and you
   don't want to be at the mercy of the model's latency on stage.
4. **If the network or the live deploy fails**, open one of these two
   `.html` files locally and keep going — that's the entire reason they're
   pre-exported. Say so explicitly if it happens; it demonstrates the
   offline guarantee rather than undermining the demo.
5. **Name the cut list out loud** if asked "what about Band C / Tier 2
   numerical checks / the cache layer / etc." — it's honest scope
   discipline, not a gap you're hiding. See the README's "Specified but
   deliberately not built" section.

   Note: **correction by pointing is now built** (v2) and is no longer on
   the cut list. If you demo it, tap an element in the preview, say what's
   wrong in plain words, and let the checks re-run — the point is that a
   correction is re-verified before it replaces the current version, not
   just accepted. It only works within one live browser session; there's
   still no screen for reopening a past record.

## Before you go on stage

- [ ] Open the deployed URL a few minutes early regardless (Render free
      tier sleeps after ~15 min idle; cold start is slow).
- [ ] Confirm the uptime pinger is still hitting `/api/health`.
- [ ] Have both files in this folder open in browser tabs already, so you
      never live-generate as your fallback.
- [ ] Rehearse the single live generation at least once beforehand against
      a goal you're confident produces a clean Band B artifact quickly.
