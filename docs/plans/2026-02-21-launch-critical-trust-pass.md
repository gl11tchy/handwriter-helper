# Launch-Critical Trust Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align product and documentation trust messaging with real data handling before launch, and make privacy details easy to discover.

**Architecture:** Add a dedicated frontend privacy route, link it from shared navigation, and update in-app trust copy where uploads and report links are generated. Keep backend behavior unchanged; this is a transparency and discoverability pass.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Workers

---

### Task 1: Add Discoverable Privacy Surface

**Files:**
- Create: `src/routes/Privacy.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/layout/footer.tsx`

### Task 2: Align In-App Trust Messaging

**Files:**
- Modify: `src/routes/About.tsx`
- Modify: `src/routes/Home.tsx`
- Modify: `src/routes/AssignmentRunner.tsx`
- Modify: `src/components/progress-stepper.tsx`

### Task 3: Align Repo-Facing Docs

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
