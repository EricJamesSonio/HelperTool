# React Setup & Best Practices

## Project Initialization
- Use Vite for new projects: `npm create vite@latest -- --template react-ts`
- TypeScript is required for all new projects
- Use `npm` as package manager

## Folder Structure
src/
  components/    # Reusable UI components
  pages/         # Route-level components (if using react-router)
  hooks/         # Custom React hooks
  services/      # API calls, external integrations
  utils/         # Pure utility functions
  types/         # TypeScript type definitions
  context/       # React Context providers
  assets/        # Static assets (images, icons)

## Component Rules
- One component per file
- Use named exports, not default exports
- Prefer function declarations over arrow functions for components
- Keep components under 150 lines
- Extract repeated JSX into smaller components
- Use CSS modules or Tailwind, never plain global CSS

## State Management
- Local state: useState (component-scoped)
- Complex state: useReducer (when state has multiple sub-values)
- Shared state: React Context with useReducer
- Server state: React Query / TanStack Query
- No Redux unless legacy project

## Hooks Rules
- Custom hooks start with "use" prefix
- Each hook has ONE responsibility
- Return stable references (useCallback, useMemo)
- Place side effects in useEffect with proper cleanup
- Never call hooks inside conditions or loops

## API Patterns
- Create dedicated service modules per resource
- Use fetch or axios (be consistent)
- Handle loading, error, success states explicitly
- Use custom hooks for data fetching (useQuery-like pattern)

## Performance
- Lazy load route components with React.lazy
- Memoize expensive computations with useMemo
- Memoize callbacks passed to child components with useCallback
- Use React.memo only when profiling shows benefit
- Virtualize long lists with react-window

## Testing
- Vitest + React Testing Library
- Test behavior, not implementation
- Use data-testid attributes for element selection
- Write unit tests for hooks and utilities
- Write integration tests for page workflows
