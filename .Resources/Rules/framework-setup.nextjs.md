# Next.js Setup & Best Practices

## Project Initialization
- Use `create-next-app` with TypeScript, App Router, ESLint, Tailwind
- `npx create-next-app@latest project-name --typescript --app --tailwind`

## Folder Structure
src/
  app/              # App Router pages and layouts
    (marketing)/    # Route groups for organization
    (dashboard)/
    api/            # API routes
    layout.tsx      # Root layout
    page.tsx        # Home page
  components/       # Reusable UI components
    ui/             # Base UI primitives
    forms/          # Form-specific components
    layout/         # Layout components
  lib/              # Utilities, helpers, config
  hooks/            # Custom React hooks
  services/         # Server actions and API calls
  types/            # TypeScript types
  styles/           # Global styles

## App Router Patterns
- Use Server Components by default (no "use client")
- Add "use client" only when needing: hooks, events, browser APIs
- Pages are Server Components that compose client islands
- Layouts are shared across child routes (do NOT re-mount)
- Loading.tsx for streaming Suspense boundaries
- Error.tsx for error boundaries per route segment

## Data Fetching
- Server Components: fetch directly (async component)
- Client Components: use SWR or TanStack Query
- Use `cache()` for deduplication of server fetches
- Use `revalidatePath` / `revalidateTag` for ISR
- Server Actions for form mutations (avoid API routes when possible)

## Server Actions
- Defined with `"use server"` directive
- Use for form submissions and data mutations
- Always validate input (zod) inside the action
- Return typed responses: `{ success, data?, error? }`
- Use `useActionState` for form state management

## SEO & Metadata
- Export `metadata` object from all pages
- Use `generateMetadata` for dynamic metadata
- Add Open Graph images and descriptions
- Use sitemap.ts and robots.ts for indexing

## Performance
- Image component (next/image) for all images
- Use `next/link` for client-side navigation
- Lazy load heavy components with dynamic imports
- streaming with loading.tsx and Suspense
- Optimize fonts with next/font

## API Routes
- Route handlers in `app/api/` for external integrations
- Use Web API Request/Response standards
- Middleware for auth checks, redirects, header modifications

## Testing
- Vitest + React Testing Library
- Playwright or Cypress for E2E tests
- Test server actions with mocked database
- Test components in isolation
