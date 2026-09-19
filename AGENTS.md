<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Slate agent instructions

[`SPEC.md`](SPEC.md) is authoritative. Follow its §6 build order one step at a time; the 6.5-hour table supersedes the roadmap below it.

- Do not build the §6 cut list or any §7 out-of-scope feature.
- Do not add dependencies, substitute the fixed §5a stack, or use a headless browser in the deployed service.
- Every generated artifact is one self-contained HTML file with no external runtime references.
- Manjari is builder-UI only; generated artifacts use a system Malayalam font stack.
- Verification runs client-side in a sandboxed `iframe` via `srcdoc`, never on the server.
- The §2d artifact DOM contract is mandatory and is checked before all other verification.

