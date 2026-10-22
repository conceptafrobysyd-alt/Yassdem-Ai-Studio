<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project workflow

The user requests a commit and a GitHub push at every validated development stage, then continuation to the next phase. Keep secrets, local databases, media and dependency/build caches excluded. Use normal non-forced pushes. If GitHub denies write access, preserve the commits locally, report the exact blocker and continue independent development; retry the push after a meaningful access change. Do not treat a subscription upgrade as a repository permission grant.

The current checkout is the task workspace. Do not create worktrees unless explicitly requested. Keep generated local animations, moodboards, editorial AI generation and virtual try-on clearly distinguished. Never make a paid generation without activation, a sufficient budget and explicit confirmation.

## Resume after an interruption

The user requests continuation whenever service availability permits. At the start of a resumed turn, read `docs/REPRISE.md`, inspect the current Git status and history, and continue authorized unfinished work without asking for the same permission again. Preserve uncommitted user work and do not redo completed stages. Update the checkpoint after a meaningful stage. A repository instruction cannot schedule a new agent turn: do not promise background execution or automatic restart after a quota reset.
