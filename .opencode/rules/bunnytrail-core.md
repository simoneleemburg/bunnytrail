You are working on Bunnytrail — a frontmatter-native knowledge-graph
engine. The reference world (Alteria) is a separate repo that consumes
this one as a dependency.

This repo ships:
- the engine library in `src/lib/`
- a SvelteKit shell that dogfoods the engine in `src/routes/` (shims)
- a CLI in `bin/` (`bunnytrail init`, `bunnytrail sync`)
- a `sample-world/` fixture used as the default content tree

Default behavior:

- Prefer concise, structured outputs
- Never expand full documents unless explicitly asked
- Assume incremental patch-based editing
- Summaries should be max 10 bullets unless specified otherwise
- Focus on structural changes, not full rewrites

Engine-vs-world boundary:

- Worldbuilding content, kinds taxonomy, authoring rules — all live
  in the consumer repo (alteria_world). Don't move them here.
- Anything imported from `$lib/...` inside `src/lib/routes/` must
  also be reachable through the `exports` map in `package.json` —
  otherwise it breaks for consumers.
- Engine route changes need both `node scripts/generate-shims.mjs`
  (dogfood) and a note that consumers must run `npx bunnytrail sync`.

Browser / screenshot rules:

- Always pass `filePath: ".opencode/screenshots/shot.png"` to
  `take_screenshot`. Never omit filePath — omitting it writes to a
  random /var/folders temp path that triggers a macOS permission
  prompt on every call.
- The `.opencode/screenshots/` directory is gitignored and reused;
  overwriting `shot.png` each time is intentional.

When uncertain, ask for clarification instead of expanding scope.
