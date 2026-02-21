# Add AGENTS.md Implementation Plan

**Goal:** Add a concise `AGENTS.md` at the repository root that documents project-specific handoff and workflow expectations so future automation can stay consistent.

**Architecture:** `handwriter-helper` is a React/Vite frontend + Cloudflare Worker backend. `AGENTS.md` will be a static project guidance file and will not affect runtime behavior.

**Tech Stack:** TypeScript, React 19, Vite, Cloudflare Workers.

---

## Task 1: Add project AGENTS guidance

**Files:**
- Create: `docs/plans/2026-02-21-add-agents-md.md` (this plan file)
- Create: `AGENTS.md` (project root)
- Modify: `STATE.md` if needed to include a pointer to this new maintainer contract (optional)

**Step 1: Write the plan**

- File already being created to capture exact implementation actions and review gates.

**Step 2: Validate current repo state before edit**

Run: 
```bash
cd /home/spin/apps/handwriter-helper
ls -la AGENTS.md
```
Expected: command returns `no such file or directory` (file currently absent).

**Step 3: Create AGENTS.md with explicit maintainer rules**

Create `AGENTS.md` with:
- repo ownership/context assumptions
- mandatory recon/read-before-edit reminders
- instructions to keep `STATE.md` updated after every commit
- quick verification commands
- any security/ops constraints relevant to this repo

**Step 4: Confirm file appears and is versioned**

Run:
```bash
cd /home/spin/apps/handwriter-helper
ls -la AGENTS.md
git status --short
```
Expected:
- `AGENTS.md` listed in root
- `AGENTS.md` shows as `?? AGENTS.md` before commit

**Step 5: Quick smoke checks**

Run:
```bash
cd /home/spin/apps/handwriter-helper
sed -n '1,220p' AGENTS.md
sed -n '1,260p' STATE.md
```
Expected: both files readable with new guidance visible; no runtime files changed.

**Step 6: Commit**

Run:
```bash
git add AGENTS.md STATE.md docs/plans/2026-02-21-add-agents-md.md

git commit -m "chore: add project AGENTS workflow guidance"
```
Expected: clean commit on current branch.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-02-21-add-agents-md.md`.

Two execution options:

1. **Subagent-Driven (this session)** – dispatch fresh subagent per task, review checkpoints between steps.
2. **Direct single-agent execution (this session)** – I implement the file now and commit immediately.

Which approach?
