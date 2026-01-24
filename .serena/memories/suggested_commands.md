# Suggested Commands

## Development
```bash
npm run dev          # Start Vite dev server (hot reload)
npm run build        # TypeScript check + Vite build
npm run preview      # Preview production build locally
```

## Code Quality
```bash
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
```

## Testing
```bash
npm run test         # Run tests once
npm run test:watch   # Watch mode for TDD
npm run test:coverage # Run tests with coverage report
```

## Deployment
```bash
npx wrangler deploy  # Deploy to Cloudflare Workers/Pages
```

## System Utilities (Darwin/macOS)
```bash
git status           # Check repository state
git diff             # View changes
git log --oneline -5 # Recent commits
```

## Path Alias
The project uses `@/` as an alias for `./src/`:
```typescript
import { Button } from "@/components/ui/button";
```
