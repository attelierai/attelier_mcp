# @attelier/motion

Motion-design toolkit for agents. A **format** is a tested Remotion composition
whose props are a JSON spec; agents fill the spec instead of writing motion
code. The Node side analyses media and music, validates specs, stages local
media and renders stills, previews and mastered 1080p videos.

- `remotion/kit/` — shared vocabulary: springs, blur-in type, cards, clips, the Attelier Create UI demo.
- `remotion/formats/<id>/` — one composition per format; timing is authored in beats.
- `src/formats/<id>.ts` — the format's spec, timeline, validation and example (no React).
- `assets/` — brand fonts and logo, curated SFX (`assets/sfx/manifest.json`).

Exposed to agents through `attelier-mcp` (`motion_formats`, `motion_render`,
`analyze_music`, `probe_media`, `contact_sheet`, `sfx_library`). Needs FFmpeg;
Remotion downloads its headless Chrome on first render.
