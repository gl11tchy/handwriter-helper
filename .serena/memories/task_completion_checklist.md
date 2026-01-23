# Task Completion Checklist

Before considering a task complete, verify:

## 1. Type Safety
```bash
npm run build  # Runs tsc -b first, then vite build
```
Fix any TypeScript errors before proceeding.

## 2. Linting
```bash
npm run lint
```
Fix any ESLint errors. Warnings can be acceptable but review them.

## 3. Testing
```bash
npm run test
```
All tests must pass. Add tests for new functionality when appropriate.

## 4. Manual Verification
- If UI changes, verify visually with `npm run dev`
- If API changes, test the endpoints

## 5. Security Check
Before any git commit:
- Review changes for exposed secrets, API keys, or sensitive data
- Check config files, logs, and environment files
- Do NOT commit `.env` files (only `.env.example`)

## Summary
Run this sequence for full verification:
```bash
npm run lint && npm run build && npm run test
```
