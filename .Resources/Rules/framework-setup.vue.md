# Vue Setup & Best Practices

## Project Initialization
- Use `npm create vue@latest` for new projects
- TypeScript is required
- Use Pinia for state management (not Vuex)

## Folder Structure
src/
  components/      # Reusable components
  views/           # Page/route components
  composables/     # Composition API hooks (useXxx)
  stores/          # Pinia stores
  services/        # API calls
  utils/           # Pure utility functions
  types/           # TypeScript types
  router/          # Vue Router config
  assets/          # Static assets

## Component Rules
- Use `<script setup>` syntax (Composition API)
- One component per file (.vue SFC)
- Template, script, style order in SFC
- Props defined with `defineProps` + TypeScript generics
- Emits defined with `defineEmits`
- Keep components under 200 lines

## Composition API
- Use composables (useXxx) for reusable stateful logic
- Composables return reactive refs/computed
- Composables can call other composables
- Use `ref` for primitives, `reactive` for objects
- Use `computed` for derived values
- Use `watch` sparingly, prefer computed

## State Management (Pinia)
- One store per domain entity
- Use setup stores (not options stores)
- Actions are async by default
- Keep store logic thin, delegate to services

## Routing
- Lazy load route components with dynamic import
- Use route guards for auth checks
- Keep route config in separate files

## Performance
- Use `v-memo` for static lists
- Lazy load components with `defineAsyncComponent`
- Use `shallowRef` for large objects that don't need deep reactivity

## Testing
- Vitest + @vue/test-utils
- Test component behavior via mount + interactions
- Test composables in isolation
- Use `vi.mock` for service mocking
