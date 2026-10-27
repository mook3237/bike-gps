# Racing start, replay and display corrections

Requirements: the user's five requirements in this conversation, including A/F/G,
turnaround persistence (E), GPS waiting, and departure marker removal.

1. `racing-foundation.js`: prepare a race route whose first coordinate is the
   accepted start GPS position. Remove the already passed outbound prefix;
   adjust checkpoint distances. New round trips returning to their origin also
   end at the actual shared start GPS; explicitly different destinations and
   saved-course endpoints remain selected. For saved
   targets, trim/rebase their historical distance and moving time on a temporary
   copy. Expose a pure target-position/heading lookup for visual interpolation.
2. `app.js`: countdown -> GPS waiting -> active. Recheck cached GPS freshness at
   the actual start, use one accepted position/time, and never fall back to a
   course coordinate. Preserve the saved-course start eligibility check.
   A race-only Ride capture consumes the same GPS callbacks from the actual
   start and reuses the existing motion/time calibration; the general Ride
   recorder and its samples remain intact. Exclude older measurements.
3. Persist the actual turnaround point and index in that race capture. Reload
   the indexed prefix distance; use a valid interior projection for old records
   with a known turnaround, and reject ambiguous missing metadata.
4. Remove only departure markers on actual activation and subsequent redraws.
   Smooth the Ghost between confirmed snapshots along the same route/history;
   never advance authoritative progress from animation. Cancel animation on
   pause, stop, reroute and teardown. Preserve arrow colors/directions and units.
5. Focused tests: GPS absent/stale/recovered/cancelled; same start coordinates and
   zero gaps; pre-start samples excluded while general Ride survives; saved
   turnaround round trip; full 2 km win/loss; corner-following animation with
   pause/reroute/stop; marker types and existing unit boundaries.

No dependency, deployment, commit or unrelated UI change is required. Phone
driving/stopping/restarting remains a separate real-device verification.

Implemented in this workspace. Verification and reviewer handoff:
`docs/racing-review-2026-10-27.md`.
