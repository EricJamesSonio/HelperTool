# Angular Setup & Best Practices

## Project Initialization
- Use Angular CLI: `ng new project-name --standalone --routing`
- Standalone components preferred over NgModules
- TypeScript is mandatory

## Folder Structure
src/
  app/
    core/           # Singleton services, guards, interceptors
    shared/         # Shared components, directives, pipes
    features/       # Feature modules (lazy loaded)
    layouts/        # Layout components
  assets/
  environments/

## Component Rules
- One component per file
- Use standalone components with `standalone: true`
- `OnPush` change detection on all components
- Template must be under 100 lines
- Extract complex logic into services
- Use signals for state, not plain properties

## Services & DI
- One responsibility per service
- Use `providedIn: 'root'` for singletons
- Feature-scoped services use `providedIn` at feature level
- Use `HttpClient` via service layer, never directly in components

## RxJS Patterns
- Use `AsyncPipe` in templates (never subscribe manually)
- Use `takeUntilDestroyed` or `takeUntil` with destroy subject
- Prefer `switchMap` over nested subscribes
- Use `combineLatest` only when all sources must emit

## State Management
- Use Angular Signals for local state
- Use NgRx or SignalStore for global state only when needed
- Prefer services with BehaviorSubject + AsyncPipe for medium apps

## Routing
- Lazy load all feature routes
- Use route guards for auth and data preloading
- Use resolvers for required data before navigation

## Performance
- TrackBy function on all ngFor
- Use `@defer` for heavy components (Angular 17+)
- Lazy load images
- Avoid subscriptions in templates without AsyncPipe

## Testing
- Jasmine + Karma or Jest
- TestBed for component integration tests
- Isolated tests for services and pipes
- Use `provideMock` for dependency mocking
