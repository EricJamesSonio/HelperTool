const { def } = require('./helpers.js');

const RELATED = [
    'utility-helpers',
    'backend-folder-structure',
    'frontend-folder-structure',
    'component-build-standards',
    'unified-component-standard',
];

const guide = def('code-style-guide', 'Code Style & Approach Guide', 'A suggested approach for each kind of code (modular, functional, class-based), with the folder layout, so new code is never written blindly.', 'Shared', 'Standards', ['code-style', 'modular', 'oop', 'functional', 'structure'], [], RELATED, [
    ['a', 'm', 'Follow the project first', 'Inspect the code already in the project and follow its style, naming and folder layout. The approaches below are suggestions for new code and for projects that have no convention yet. Never mix two styles inside one file.'],
    ['a', 'm', 'Pick the approach by kind of code', 'Pure helpers, formatters, validators, mappers, selectors and the debounce algorithm: functional style. Stateful things with a lifecycle (clients, connections, caches, loggers, event buses, registries): classes. Features and business flows: modular layers (entry, controller or handler, service, repository). UI: function components with hooks, with logic in hooks. Config, constants and types: plain data modules.'],
    ['a', 'm', 'Modular first', 'Every feature is a self-contained module with one public entry file and its own tests. A module never imports the internals of another module. Dependencies point one way: pages use features, features use shared layers, shared layers use config and types.'],
    ['a', 's', 'Where each kind of code lives', 'Functional helpers go in utils. Classes with a lifecycle go in lib, one folder per concern. Features go in modules (server side) or feature (client side). Global constants and types go in constants and types. Values shared by two sides of the app go in one shared folder.'],
    ['f', 's', 'Functional core, imperative shell', 'Keep decisions in pure functions. Keep side effects (network, database, files, time, randomness) at the edges, in services and adapters, and pass them in as parameters so the core stays testable.'],
    ['a', 's', 'Composition over inheritance', 'Prefer small interfaces and composition. Use inheritance only for a stable base such as the base error type. Classes depend on interfaces that are injected through the constructor, never on hidden globals.'],
    ['a', 's', 'One composition root', 'Create and connect classes and services in one place at startup (the bootstrap), not inside modules. Modules receive what they need.'],
    ['f', 's', 'Strict typing', 'Use the strongest typing the language offers. In TypeScript never use any (use unknown and narrow), and type every exported function, class member and value.'],
    ['f', 's', 'Naming and size', 'Name files by purpose, keep one main export per file, keep functions short with one job and early returns, and leave no magic values, dead code or commented-out code.'],
    ['t', 's', 'Tests follow the style', 'Functional helpers: table-driven unit tests without mocks. Classes: test through the public interface with fake dependencies. Modules: integration tests through the route or IPC handler.'],
    ['e', 'd', 'Ask before assuming', 'If the existing style cannot be seen, ask for a sample file or the folder tree instead of choosing a style silently.'],
    ['a', 'x', 'Automated enforcement', 'Enforce import boundaries, file naming and the no-any rule with lint rules, and check for circular dependencies in CI.'],
    ['c', 'm', 'Verified', 'New code matches the existing style (or the suggested one when none exists), each file has an obvious place by these rules, and no module reaches into another module internals.'],
]);

guide.requirements = guide.requirements.concat([
    {
        group: 'Architecture Requirements',
        level: 'standard',
        title: 'Folder structure (Web app)',
        description: 'Split into frontend and backend. Frontend src: app (thin pages), feature (one folder per feature with components, hooks, api, store, types and an index), components, hooks, lib (cache, realtime, config), utils (functional helpers), api, context, store, styles, constants, types and __TEST__. Backend src: bootstrap, config, routes, pipeline, modules (one folder per feature), lib (classes), utils (functional helpers), errors, constants, types, jobs and __TEST__.',
        types: ['web'],
    },
    {
        group: 'Architecture Requirements',
        level: 'standard',
        title: 'Folder structure (Desktop app)',
        description: 'Split by process. main: entry and bootstrap, ipc (thin handlers, one file per feature), services, lib (classes such as windows, database and logger), utils (functional helpers). preload: one narrow bridge file per feature. renderer: feature folders, components, hooks, utils and styles. shared: channel names, schemas and types used by both sides. worker or tasks folder for heavy work. __TEST__ mirrors each side. The renderer never imports from main.',
        types: ['desktop'],
    },
    {
        group: 'Architecture Requirements',
        level: 'standard',
        title: 'Folder structure (Mobile app)',
        description: 'screens (thin, they only compose features), features (components, hooks and services per feature), components, hooks, data (api client, local database, sync), native (platform specific code), theme (tokens), utils (functional helpers), constants, types and __TEST__. Screens hold no business logic.',
        types: ['mobile'],
    },
]);

const functionalUtils = def('functional-utils-style', 'Functional Style for Utilities', 'Pure, typed, composable helper functions grouped by purpose, with a clear folder layout and no hidden side effects.', 'Shared', 'Utils', ['utils', 'functional', 'pure', 'helpers'], [], ['code-style-guide', 'utility-helpers', 'search-bar', 'frontend-sanitizer'], [
    ['a', 'm', 'Functional style for helpers', 'Write helpers as plain functions, not classes. Each function does one thing, takes its inputs as parameters and returns a value. Use named exports and no default export.'],
    ['f', 'm', 'Pure by default', 'The same input gives the same output. No global state, no hidden network, file or storage access, and no changes to the arguments. Return new values instead of mutating.'],
    ['a', 'm', 'Folder layout', 'utils holds files grouped by purpose, for example date, money, text, collection, validation and async (debounce, throttle, retry, abort). One purpose per file, a small index for re-exports, and a __TEST__ folder that mirrors the files. No single catch-all file.'],
    ['f', 's', 'Inject the impure parts', 'Anything that depends on time or randomness takes a clock or random function as a parameter with a default, so tests can control it.'],
    ['f', 's', 'Debounce as a function', 'Build debounce as a factory that returns the debounced function with cancel and flush. It uses a trailing timer that restarts on each call, runs with the latest arguments only and clears its timer on cleanup. The framework hook wraps this function and holds no logic of its own.'],
    ['s', 's', 'Sanitizers as pure functions', 'Write sanitizers and validators as pure functions that return a cleaned value or a clear failure result. They never log the input and never depend on the page or the server.'],
    ['f', 's', 'Typed in and out', 'Give every helper explicit input and output types and a one-line description. In TypeScript never use any, and use generics instead of loose types.'],
    ['e', 's', 'Predictable failures', 'Return a result value for expected failures (invalid input) and throw a typed error only for programmer mistakes. Never swallow errors silently.'],
    ['a', 'd', 'Composition', 'Combine small helpers with composition or a short pipeline instead of long functions with flags. Use currying or partial application only where it makes the call site clearer.'],
    ['t', 's', 'Table-driven tests', 'Test each helper with a table of inputs and expected outputs, including empty values, boundaries, invalid input and hostile input. No mocks are needed for pure functions.'],
    ['c', 'm', 'Verified', 'Every helper is pure, typed and tested, no helper holds state, and callers import them from the shared utils location.'],
]);

const oopInfra = def('oop-infrastructure-style', 'Class-Based Style for Infrastructure (OOP)', 'Classes with a clear lifecycle for stateful infrastructure such as clients, caches, loggers and event buses, with interfaces, injection and a lib folder layout.', 'Shared', 'Standards', ['oop', 'classes', 'infrastructure', 'lifecycle'], [], ['code-style-guide', 'sse-client', 'websocket-client', 'cache-invalidation-registry', 'backend-error-logging'], [
    ['a', 'm', 'Classes only where state and lifecycle exist', 'Use a class for things that hold state, own a resource or have start and stop behavior: connections, clients, caches, loggers, event buses, registries and strategies. Everything else stays functional.'],
    ['a', 'm', 'Folder layout', 'lib holds one folder per concern. Example: lib/realtime (SseClient, SocketClient, EventBus, index), lib/cache (CacheClient, rules, index), lib/logger (Logger, index). One class per file, the file named after the class, and one index per folder as the public entry.'],
    ['a', 'm', 'Interface first', 'Define a small interface for each class. Callers depend on the interface, and the concrete class is chosen in the composition root.'],
    ['a', 'm', 'Constructor injection', 'A class receives its dependencies and config through the constructor. It never reads environment variables, never imports a global instance and never creates its own collaborators.'],
    ['f', 's', 'Explicit lifecycle', 'Provide clear start, stop and dispose methods that are safe to call twice. Clean up timers, listeners, connections and subscriptions on dispose.'],
    ['f', 's', 'Encapsulation', 'Keep state private and expose behavior, not fields. Return copies or read-only views of internal data and keep the public surface small.'],
    ['a', 's', 'Single instance through the root', 'When only one instance may exist (for example one realtime connection), create it once in the composition root and pass it to consumers. Never use a module-level singleton that can leak between users or requests.'],
    ['a', 's', 'Strategy and registry pattern', 'For behavior that varies by type, define an interface, one class per variant and a registry that picks the variant. Adding a variant adds a file and changes nothing else.'],
    ['e', 's', 'Typed errors', 'Throw error classes that extend the shared base error and carry a code. Never throw plain strings.'],
    ['a', 'd', 'Composition over inheritance', 'Share behavior through small collaborators. Allow inheritance only from a stable base class that has no behavior that subclasses must override.'],
    ['t', 's', 'Tests through the public interface', 'Test each class through its public methods with fake dependencies. Cover the lifecycle, failure paths and cleanup.'],
    ['c', 'm', 'Verified', 'Each class has an interface, injected dependencies and a clean dispose, nothing depends on a hidden global, and the folder layout matches these rules.'],
]);

const modularFeature = def('modular-feature-style', 'Modular Feature Layout', 'How one feature is laid out as a module with one public entry and a one-way flow, for each application type.', 'Shared', 'Structure', ['modular', 'feature', 'layers', 'structure'], [], ['code-style-guide', 'backend-folder-structure', 'frontend-folder-structure', 'unified-component-standard'], [
    ['a', 'm', 'One folder per feature', 'A feature owns everything it needs in one folder and exposes one public entry file. Other code imports only that entry file.'],
    ['a', 'm', 'Server module layout', 'modules/<feature> holds routes, controller, service, repository, dto, mappers, strategies, constants, errors, types, utils, an index and a __TEST__ folder. Add only the files the feature needs.'],
    ['a', 'm', 'Client feature layout', 'feature/<name> holds components, hooks, api, store, context, utils, types, assets and an index. Pages in app only compose feature pieces.'],
    ['a', 'm', 'One-way flow', 'Route or handler calls controller, controller calls service, service calls repository. Each layer knows only the layer below. Jobs and other modules call services only.'],
    ['f', 's', 'Thin edges, rich service', 'Controllers and handlers translate the request and the response only. Business rules live in the service. Repositories do data access only and contain no rules.'],
    ['s', 's', 'Validate at the edge', 'Validate and clean input in the edge layer with a schema (dto) before it reaches the service, and map dto to domain data with a mapper so internal models never leak out.'],
    ['a', 's', 'Cross-feature access', 'A feature uses another feature only through that feature entry file or through a composing module. No imports from internal folders.'],
    ['a', 's', 'Desktop equivalent', 'For desktop apps the edge layer is a thin IPC handler in the main process. The flow is handler, service, repository, and the renderer reaches it only through the preload bridge.'],
    ['a', 's', 'Mobile equivalent', 'For mobile apps the flow is screen, hook, service, data source (api client or local database). Screens hold no business logic.'],
    ['a', 'd', 'Versioning only when needed', 'Add a new version of a controller and dto only when the contract changes, and keep the old one working until its end date.'],
    ['t', 's', 'Tests in the feature', 'Keep unit tests next to the feature in its __TEST__ folder, and keep tests that cross several features in the shared test folder.'],
    ['c', 'm', 'Verified', 'Each feature can be understood from its own folder, the flow is one-way, and no feature imports the internals of another feature.'],
]);

module.exports = [guide, functionalUtils, oopInfra, modularFeature];