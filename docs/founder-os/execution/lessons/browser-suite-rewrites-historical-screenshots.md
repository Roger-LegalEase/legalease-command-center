# `npm run test:browser` rewrites 117 historical screenshot files

**Why it mattered:** the Founder OS charter says of `docs/ux-vnext/`: "Do not edit those
files. They stay as history." A single local browser-suite run left 117 modified PNGs under
`docs/ux-vnext/screenshots/` staged for commit, which would have silently rewritten the
historical record and bloated every release diff.

The visual harnesses (`scripts/capture-vnext-partners-train.mjs`,
`scripts/partners-visual-harness.mjs`) regenerate baseline screenshots as a side effect of
the suite. Rendering is not byte-deterministic across machines, so the files change even
when nothing about the product did.

**How to apply:** after any local `npm run test:browser`, before staging anything, run

```
git checkout -- docs/ux-vnext/screenshots/
```

and confirm with `git status --porcelain` that no path under `docs/ux-vnext/` remains
modified. CI is unaffected because it never commits its working tree.
