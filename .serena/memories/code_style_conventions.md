# Code Style and Conventions

## TypeScript
- Strict mode enabled (`"strict": true`)
- No unused locals or parameters (`noUnusedLocals`, `noUnusedParameters`)
- Target ES2022
- Use `type` for type aliases (not `interface` for simple types)
- Prefix unused parameters with `_` (e.g., `_unused`)

## React
- Functional components only
- React 19 (no need for `React.FC` type)
- Use custom hooks in `/src/hooks/`
- React Router v7 for routing

## File Organization
- Components use PascalCase: `ScoreCard.tsx`
- Hooks use camelCase with `use-` prefix: `use-theme.ts`
- Types are centralized in `/src/types/index.ts`
- Tests are colocated: `*.test.ts` next to source

## Naming Conventions
- Types: PascalCase (`AssignmentPayload`, `QualityGate`)
- Functions: camelCase (`runPipeline`, `verifyContent`)
- Constants: SCREAMING_SNAKE_CASE (`FINDING_CONFIDENCE_THRESHOLD`)
- Components: PascalCase (`ProgressStepper`)

## CSS
- Tailwind CSS 4 utility classes
- Custom styles in `src/index.css`
- Component variants via `class-variance-authority`
- Class merging with `tailwind-merge` and `clsx`

## ESLint Rules (Key)
- `no-console`: warn (allow `warn` and `error`)
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: error (ignore `^_` prefix)
- `prefer-const`: error
- `no-var`: error
- React hooks rules enforced

## Comments
- Keep comments minimal and necessary
- No documentation/README updates unless requested
- JSDoc only when needed for complex public APIs

## Imports
- Use `@/` path alias for src imports
- Group: external deps, then internal imports, then types
