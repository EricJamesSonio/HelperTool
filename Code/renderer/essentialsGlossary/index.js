/* ── Data ──────────────────────────────────────────── */

const CATEGORIES = [
  {
    name: 'Core Programming Concepts',
    desc: 'Fundamental building blocks shared across all programming languages',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="4,7 8,11 4,15"/><line x1="12" y1="14" x2="16" y2="14"/>' +
      '</svg>',
    items: [
      {
        name: 'Variables & Data Types',
        desc: 'Variables are named memory locations that store data values. Every variable has a type (integer, string, boolean, etc.) that determines what kind of data it can hold and what operations are allowed. Strongly-typed languages enforce type rules at compile time; weakly-typed languages perform implicit coercion at runtime, which can lead to subtle bugs.',
        tags: ['fundamentals', 'types', 'memory'],
      },
      {
        name: 'Functions & Methods',
        desc: 'A function is a reusable block of code that takes inputs (parameters), performs a task, and returns an output. Methods are functions attached to objects or classes. Pure functions—those with no side effects and deterministic output—are easier to test, reason about, and compose into larger programs.',
        tags: ['fundamentals', 'abstraction', 'modularity'],
      },
      {
        name: 'Control Flow',
        desc: 'Control flow structures (if/else, switch, loops) determine the order in which statements execute. Conditionals branch execution based on boolean expressions; loops (for, while) repeat a block until a condition is met. Understanding control flow is essential for implementing any non-trivial logic.',
        tags: ['fundamentals', 'logic', 'branching'],
      },
      {
        name: 'Error Handling',
        desc: 'Error handling is the practice of anticipating and responding to exceptional conditions. Modern languages use try/catch/finally blocks to separate normal logic from error-recovery code. Defensive programming—checking preconditions, validating inputs, and failing fast—catches bugs early and prevents corrupted state.',
        tags: ['fundamentals', 'resilience', 'debugging'],
      },
      {
        name: 'Scope & Closures',
        desc: 'Scope defines where variables are accessible in a program. Global scope is visible everywhere; local scope is confined to a function or block. A closure is a function that retains access to variables from its enclosing scope even after that scope has exited. Closures enable data privacy, partial application, and callback patterns.',
        tags: ['fundamentals', 'closures', 'memory'],
      },
      {
        name: 'Recursion',
        desc: 'Recursion is a technique where a function calls itself to solve a problem by breaking it into smaller, identical subproblems. Every recursive function requires a base case (to stop) and a recursive case (to continue). While elegant for tree traversal and divide-and-conquer algorithms, recursion can cause stack overflow if the depth is too high.',
        tags: ['fundamentals', 'algorithms', 'stack'],
      },
    ],
  },
  {
    name: 'Object-Oriented Programming',
    desc: 'Paradigm based on objects bundling data and behavior together',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/>' +
        '<rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>' +
      '</svg>',
    items: [
      {
        name: 'Classes & Objects',
        desc: 'A class is a blueprint that defines the structure (fields) and behavior (methods) of objects. An object is a concrete instance of a class, with its own state. Classes enable code reuse through instantiation and provide a template for creating many similar objects with consistent interfaces.',
        tags: ['oop', 'blueprint', 'instance'],
      },
      {
        name: 'Inheritance',
        desc: 'Inheritance allows a class (child) to derive properties and methods from another class (parent), establishing an IS-A relationship. It promotes code reuse and creates a hierarchical taxonomy of types. Deep inheritance chains can become brittle; prefer composition over inheritance for flexible designs.',
        tags: ['oop', 'reuse', 'hierarchy'],
      },
      {
        name: 'Polymorphism',
        desc: 'Polymorphism means "many forms"—the ability for different classes to respond to the same method call in their own way. Achieved through method overriding (inheritance) or interface implementation, polymorphism lets you write generic code that works with any type that satisfies a contract.',
        tags: ['oop', 'flexibility', 'interfaces'],
      },
      {
        name: 'Encapsulation',
        desc: 'Encapsulation hides the internal state of an object behind a public interface, exposing only what is necessary. By marking fields as private and providing controlled access through getters/setters, you prevent external code from putting the object into an invalid state.',
        tags: ['oop', 'data-hiding', 'modularity'],
      },
      {
        name: 'Abstraction',
        desc: 'Abstraction simplifies complexity by exposing only the essential features of an entity while hiding implementation details. Abstract classes and interfaces define contracts that concrete classes fulfill. Good abstraction lets you change internals without affecting consumers.',
        tags: ['oop', 'design', 'simplicity'],
      },
      {
        name: 'Composition over Inheritance',
        desc: 'Composition (HAS-A) builds objects by assembling smaller, focused components rather than inheriting behavior from a parent class. It produces more flexible, loosely-coupled designs because you can swap components at runtime. Favor composition when the relationship is behavioral rather than hierarchical.',
        tags: ['oop', 'design', 'flexibility'],
      },
      {
        name: 'Interfaces & Abstract Classes',
        desc: 'An interface declares a contract of methods that implementing classes must provide, with no implementation of its own. An abstract class is a partially-implemented class that subclasses extend. Interfaces define capabilities (what); abstract classes define shared structure (how).',
        tags: ['oop', 'contracts', 'design'],
      },
    ],
  },
  {
    name: 'Data Structures',
    desc: 'Ways to organize and store data for efficient access and modification',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="7" cy="5" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="10" cy="12" r="2"/>' +
        '<line x1="7" y1="7" x2="10" y2="10"/><line x1="14" y1="7" x2="10" y2="10"/>' +
      '</svg>',
    items: [
      {
        name: 'Arrays & Dynamic Lists',
        desc: 'An array is a contiguous block of memory holding elements of the same type, indexed by position. Arrays offer O(1) random access but O(n) insertion/deletion. Dynamic arrays (like ArrayList or Python lists) automatically resize when full, amortizing the cost of growth to O(1) per append.',
        tags: ['dsa', 'collections', 'performance'],
      },
      {
        name: 'Hash Tables / Maps',
        desc: 'A hash table stores key-value pairs and uses a hash function to compute an index into an array of buckets. Ideal hash tables offer O(1) average lookup, insertion, and deletion. Collisions—when two keys hash to the same bucket—are resolved via chaining or open addressing.',
        tags: ['dsa', 'lookup', 'performance'],
      },
      {
        name: 'Stacks & Queues',
        desc: 'A stack follows Last-In-First-Out (LIFO) order—like a pile of plates. Push adds to the top, pop removes from the top. A queue follows First-In-First-Out (FIFO) order—like a line at a register. Enqueue adds to the back, dequeue removes from the front. Both are fundamental for scheduling, parsing, and graph traversal.',
        tags: ['dsa', 'order', 'linear'],
      },
      {
        name: 'Linked Lists',
        desc: 'A linked list is a sequence of nodes where each node points to the next (singly) or both next and previous (doubly). Unlike arrays, linked lists allow O(1) insertion/deletion at known positions but require O(n) traversal for random access. They are the foundation for more complex structures like graphs and adjacency lists.',
        tags: ['dsa', 'pointers', 'dynamic'],
      },
      {
        name: 'Trees',
        desc: 'A tree is a hierarchical structure with a root node and child nodes forming parent-child relationships. Binary trees restrict each node to two children; Binary Search Trees maintain the invariant that left descendants are smaller and right descendants are larger, enabling O(log n) search in balanced trees.',
        tags: ['dsa', 'hierarchy', 'search'],
      },
      {
        name: 'Graphs',
        desc: 'A graph consists of vertices (nodes) and edges (connections) that can be directed or undirected, weighted or unweighted. Graphs model real-world networks—social connections, route maps, dependency chains. Common algorithms include BFS (shortest path in unweighted graphs), DFS (topological sort), and Dijkstra (shortest weighted path).',
        tags: ['dsa', 'networks', 'traversal'],
      },
    ],
  },
  {
    name: 'Algorithms & Complexity',
    desc: 'Systematic methods for solving problems and analyzing efficiency',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="1,17 5,12 9,14 13,7 17,10 19,2"/>' +
        '<line x1="1" y1="17" x2="19" y2="17"/>' +
      '</svg>',
    items: [
      {
        name: 'Big O Notation',
        desc: 'Big O describes how runtime or memory usage grows relative to input size (n). O(1) is constant, O(log n) is logarithmic, O(n) is linear, O(n log n) is linearithmic, O(n^2) is quadratic, and O(2^n) is exponential. It ignores constants and lower-order terms to focus on the dominant growth factor.',
        tags: ['complexity', 'performance', 'analysis'],
      },
      {
        name: 'Sorting Algorithms',
        desc: 'Sorting arranges elements in a defined order. Quicksort (O(n log n) average) uses partitioning; Merge Sort (O(n log n)) uses divide-and-conquer; Insertion Sort (O(n^2)) is fast on nearly-sorted data. Choosing the right sort depends on data size, stability requirements, and memory constraints.',
        tags: ['algorithms', 'ordering', 'performance'],
      },
      {
        name: 'Searching Algorithms',
        desc: 'Linear search scans every element (O(n)). Binary search repeatedly halves a sorted range (O(log n)) and is exponentially faster for large datasets. Search is often the bottleneck in applications; using the right data structure (hash table, BST, index) can reduce search from O(n) to O(1) or O(log n).',
        tags: ['algorithms', 'search', 'performance'],
      },
      {
        name: 'Dynamic Programming',
        desc: 'Dynamic Programming (DP) solves complex problems by breaking them into overlapping subproblems and storing their results (memoization or tabulation) to avoid redundant computation. It is applicable when a problem has optimal substructure and overlapping subproblems—classic examples include Fibonacci, knapsack, and shortest paths.',
        tags: ['algorithms', 'optimization', 'memoization'],
      },
      {
        name: 'Space-Time Tradeoff',
        desc: 'Many algorithms let you trade memory for speed or vice versa. Caching (storing computed results) uses more memory to avoid recomputation. Compression reduces memory at the cost of CPU cycles. Understanding this tradeoff is key to designing systems that fit their resource constraints.',
        tags: ['complexity', 'optimization', 'design'],
      },
    ],
  },
  {
    name: 'Design Principles',
    desc: 'Proven guidelines for writing maintainable, flexible, and understandable code',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 3h3l1 4-2 1a5 5 0 0 0 4 4l1-2 4 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>' +
      '</svg>',
    items: [
      {
        name: 'SOLID Principles',
        desc: 'SOLID is an acronym for five design principles: Single Responsibility (a class should have one reason to change); Open-Closed (open for extension, closed for modification); Liskov Substitution (subtypes must be substitutable for their base types); Interface Segregation (clients should not depend on methods they don\'t use); Dependency Inversion (depend on abstractions, not concretions). Together they produce loosely-coupled, testable code.',
        tags: ['design', 'oop', 'maintainability'],
      },
      {
        name: 'DRY — Don\'t Repeat Yourself',
        desc: 'DRY states that every piece of knowledge should have a single, unambiguous representation in a system. Duplication increases maintenance cost—a bug in duplicated code must be fixed in every copy. Extract repeated logic into functions, classes, or modules. But avoid premature abstraction; wait for the third occurrence before refactoring.',
        tags: ['design', 'simplicity', 'maintainability'],
      },
      {
        name: 'KISS — Keep It Simple',
        desc: 'KISS advocates for simplicity over complexity. Simple code is easier to understand, test, debug, and modify. Resist the temptation to over-engineer with patterns, abstractions, or configurations that are not yet needed. The simplest working solution is often the best.',
        tags: ['design', 'simplicity', 'pragmatism'],
      },
      {
        name: 'YAGNI — You Ain\'t Gonna Need It',
        desc: 'YAGNI warns against building functionality that is not currently required. Features guessed to be needed in the future often go unused, add complexity, and constrain later design decisions. Build only what the requirements demand today; refactor when new needs emerge.',
        tags: ['design', 'simplicity', 'agile'],
      },
      {
        name: 'Separation of Concerns',
        desc: 'Separation of Concerns decomposes a system into distinct sections where each section addresses a separate concern. Layers (presentation, business logic, data access) are a common application. This reduces interdependency, making it possible to modify one concern without affecting others.',
        tags: ['design', 'modularity', 'architecture'],
      },
      {
        name: 'Dependency Injection',
        desc: 'Dependency Injection (DI) is a technique where an object receives its dependencies from an external source rather than creating them itself. This decouples the object from concrete implementations, making it easier to test with mocks and swap implementations without changing the consuming code.',
        tags: ['design', 'testing', 'decoupling'],
      },
    ],
  },
  {
    name: 'Design Patterns',
    desc: 'Reusable solutions to common software design problems',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/>' +
        '<rect x="7" y="11" width="6" height="6" rx="1"/>' +
      '</svg>',
    items: [
      {
        name: 'Singleton',
        desc: 'Singleton ensures a class has exactly one instance and provides a global access point to it. Useful for shared resources like configuration managers, connection pools, or logging services. However, singletons introduce global state and hidden dependencies, making testing harder. Use sparingly.',
        tags: ['patterns', 'creational', 'state'],
      },
      {
        name: 'Factory Method',
        desc: 'Factory Method defines an interface for creating an object but lets subclasses decide which concrete class to instantiate. It moves object creation logic out of the consumer, enabling the system to introduce new types without modifying existing code. This is the most common creational pattern.',
        tags: ['patterns', 'creational', 'flexibility'],
      },
      {
        name: 'Observer (Pub/Sub)',
        desc: 'Observer defines a one-to-many dependency where one object (subject) notifies all dependents (observers) of state changes automatically. This decouples the subject from its observers and is widely used in event systems, UI frameworks, and reactive programming.',
        tags: ['patterns', 'behavioral', 'events'],
      },
      {
        name: 'Strategy',
        desc: 'Strategy defines a family of interchangeable algorithms, encapsulates each one, and makes them swappable at runtime. The client delegates to a strategy object rather than implementing the algorithm directly. This follows the Open-Closed principle and eliminates conditional chains.',
        tags: ['patterns', 'behavioral', 'algorithms'],
      },
      {
        name: 'Adapter',
        desc: 'Adapter converts the interface of a class into another interface that a client expects. It allows incompatible classes to work together without modifying their source code. Commonly used to wrap legacy code, third-party libraries, or to bridge different system boundaries.',
        tags: ['patterns', 'structural', 'compatibility'],
      },
      {
        name: 'Decorator',
        desc: 'Decorator dynamically attaches additional responsibilities to an object without altering its class. It wraps the original object in a new layer that adds behavior before or after delegating to the wrapped object. This is more flexible than static inheritance for adding cross-cutting concerns like logging, caching, or validation.',
        tags: ['patterns', 'structural', 'extensibility'],
      },
      {
        name: 'MVC — Model-View-Controller',
        desc: 'MVC separates an application into three components: Model (data and business logic), View (UI presentation), and Controller (handles input and coordinates Model and View). This separation enables parallel development, independent testing, and replacing the UI without affecting business logic.',
        tags: ['patterns', 'architectural', 'ui'],
      },
    ],
  },
  {
    name: 'Web & API Fundamentals',
    desc: 'Core concepts of how browsers, servers, and APIs communicate',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="10" cy="10" r="3"/><line x1="10" y1="1" x2="10" y2="4"/>' +
        '<line x1="10" y1="16" x2="10" y2="19"/><line x1="1" y1="10" x2="4" y2="10"/>' +
        '<line x1="16" y1="10" x2="19" y2="10"/>' +
      '</svg>',
    items: [
      {
        name: 'HTTP — Methods & Status Codes',
        desc: 'HTTP defines request methods (GET, POST, PUT, DELETE, PATCH) that map to CRUD operations, and status codes grouped by class: 2xx (success), 3xx (redirection), 4xx (client error), 5xx (server error). Common codes include 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 404 Not Found, and 500 Internal Server Error.',
        tags: ['web', 'http', 'protocol'],
      },
      {
        name: 'REST API Design',
        desc: 'REST (Representational State Transfer) is an architectural style where resources are identified by URLs and manipulated via HTTP methods. Key principles: use nouns for resource paths (/users, /orders/123), stateless operations, consistent error responses, and versioning via URL prefix or headers. A well-designed REST API is intuitive and self-documenting.',
        tags: ['web', 'api', 'design'],
      },
      {
        name: 'Client-Server Architecture',
        desc: 'The client-server model separates the system into service providers (servers) and service requesters (clients). Clients initiate requests; servers respond. This separation allows each to scale independently, centralizes data and security controls on the server, and enables multiple client types (web, mobile, desktop) to share the same backend.',
        tags: ['web', 'architecture', 'networking'],
      },
      {
        name: 'JSON & Data Interchange',
        desc: 'JSON (JavaScript Object Notation) is a lightweight, human-readable format for transmitting structured data between systems. It uses key-value pairs and arrays, and is language-agnostic. JSON has become the standard data format for REST APIs, configuration files, and data storage due to its simplicity and ubiquitous support.',
        tags: ['web', 'data', 'serialization'],
      },
      {
        name: 'Request-Response Cycle',
        desc: 'The request-response cycle is the fundamental interaction pattern of the web: a client sends an HTTP request to a server, the server processes it (routing, business logic, database queries), and returns an HTTP response. Middleware functions intercept and process the request/response at various stages for cross-cutting concerns like authentication, logging, and CORS.',
        tags: ['web', 'http', 'middleware'],
      },
      {
        name: 'Middleware Concept',
        desc: 'Middleware is software that sits between the client and server logic, processing requests and responses in a pipeline. Each middleware function can inspect, modify, or short-circuit the request/response. Common middleware handles authentication, rate limiting, request logging, CORS headers, error handling, and body parsing.',
        tags: ['web', 'middleware', 'pipeline'],
      },
    ],
  },
  {
    name: 'Database Fundamentals',
    desc: 'Essential concepts for storing, querying, and managing data',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<ellipse cx="10" cy="4" rx="7" ry="2"/><path d="M3 4v6c0 1.1 3.13 2 7 2s7-.9 7-2V4"/>' +
        '<path d="M3 10v6c0 1.1 3.13 2 7 2s7-.9 7-2v-6"/>' +
      '</svg>',
    items: [
      {
        name: 'SQL vs NoSQL',
        desc: 'SQL databases (PostgreSQL, MySQL) store data in structured tables with predefined schemas and support powerful joins and ACID transactions. NoSQL databases (MongoDB, Redis, Cassandra) offer flexible schemas, horizontal scaling, and specialized data models (document, key-value, columnar, graph). Choose SQL for data integrity and complex queries; NoSQL for scalability and flexible schemas.',
        tags: ['database', 'storage', 'comparison'],
      },
      {
        name: 'ACID Transactions',
        desc: 'ACID guarantees that database transactions are Atomic (all-or-nothing), Consistent (preserving all rules), Isolated (concurrent transactions don\'t interfere), and Durable (committed data survives failures). These guarantees are essential for financial systems, inventory management, and any application where data integrity is critical.',
        tags: ['database', 'transactions', 'reliability'],
      },
      {
        name: 'Indexes',
        desc: 'A database index is a data structure (usually a B-tree or hash table) that speeds up data retrieval at the cost of slower writes and increased storage. Indexes make SELECT queries with WHERE clauses dramatically faster by avoiding full table scans. Over-indexing wastes space and degrades write performance; under-indexing causes slow queries.',
        tags: ['database', 'performance', 'optimization'],
      },
      {
        name: 'Normalization',
        desc: 'Normalization organizes database tables to reduce data redundancy and improve integrity. First Normal Form (1NF) eliminates duplicate columns; Second Normal Form (2NF) removes partial dependencies; Third Normal Form (3NF) removes transitive dependencies. While normalization prevents anomalies, denormalization (storing redundant data) can improve read performance in read-heavy systems.',
        tags: ['database', 'design', 'redundancy'],
      },
      {
        name: 'ORM — Object-Relational Mapping',
        desc: 'ORM is a technique that maps database tables to objects in code, allowing developers to interact with the database using the programming language\'s native syntax instead of raw SQL. ORMs (like Sequelize, TypeORM, Prisma) improve productivity and reduce boilerplate but can generate inefficient queries if used carelessly.',
        tags: ['database', 'abstraction', 'productivity'],
      },
    ],
  },
  {
    name: 'Software Architecture',
    desc: 'High-level structure and organization of software systems',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="2" y="2" width="16" height="4" rx="1"/><rect x="2" y="8" width="16" height="4" rx="1"/>' +
        '<rect x="2" y="14" width="16" height="4" rx="1"/>' +
      '</svg>',
    items: [
      {
        name: 'Layered Architecture',
        desc: 'Layered architecture organizes code into horizontal layers, typically Presentation (UI), Business Logic (services), and Data Access (repositories). Each layer depends only on the layer below it, creating a unidirectional flow. This separation improves testability, maintainability, and allows teams to work on different layers independently.',
        tags: ['architecture', 'layers', 'modularity'],
      },
      {
        name: 'Monolith vs Microservices',
        desc: 'A monolith is a single deployable unit containing all functionality—simple to develop and deploy initially but hard to scale and maintain as it grows. Microservices decompose the system into small, independently-deployable services that communicate over a network, enabling independent scaling, technology diversity, and team autonomy at the cost of operational complexity.',
        tags: ['architecture', 'scalability', 'tradeoffs'],
      },
      {
        name: 'Event-Driven Architecture',
        desc: 'Event-driven architecture uses events (notifications of state changes) to trigger and communicate between decoupled services. Producers emit events to a message broker (Kafka, RabbitMQ); consumers react asynchronously. This enables loose coupling, scalability, and extensibility—new consumers can be added without modifying producers.',
        tags: ['architecture', 'events', 'async'],
      },
      {
        name: 'CQRS — Command Query Responsibility Segregation',
        desc: 'CQRS separates read operations (queries) from write operations (commands), often using different models and even different databases for each. Commands change state (return void); queries return data (do not mutate). This pattern optimizes for scenarios where reads and writes have vastly different performance or scaling requirements.',
        tags: ['architecture', 'cqrs', 'scalability'],
      },
      {
        name: 'Clean / Hexagonal Architecture',
        desc: 'Clean Architecture (Robert C. Martin) and Hexagonal Architecture (Alistair Cockburn) both aim to isolate business logic from external concerns. The core domain is surrounded by layers of adapters that translate between the core and the outside world (databases, APIs, UI). Dependencies point inward—the core knows nothing about frameworks or infrastructure.',
        tags: ['architecture', 'clean', 'ddd'],
      },
    ],
  },
  {
    name: 'Development Best Practices',
    desc: 'Proven workflows and habits that improve code quality and team velocity',
    icon:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/>' +
        '<circle cx="10" cy="9" r="1.5"/><circle cx="6" cy="9" r="1.5"/><circle cx="14" cy="9" r="1.5"/>' +
      '</svg>',
    items: [
      {
        name: 'Version Control with Git',
        desc: 'Git tracks changes to files over time, enabling collaboration, experimentation through branches, and recovery from mistakes. A healthy Git workflow uses small, atomic commits with descriptive messages, frequent pushes, short-lived branches, and pull requests for peer review. Master/main should always be deployable.',
        tags: ['git', 'collaboration', 'workflow'],
      },
      {
        name: 'Unit Testing',
        desc: 'Unit tests verify the behavior of individual units of code (functions, methods, classes) in isolation. Good unit tests are fast, deterministic, and test one thing. They serve as executable documentation and provide a safety net for refactoring. Aim for high coverage on business logic; lower coverage on glue code is acceptable.',
        tags: ['testing', 'quality', 'automation'],
      },
      {
        name: 'Integration Testing',
        desc: 'Integration tests verify that multiple modules or services work together correctly. They catch interface mismatches, configuration errors, and incorrect assumptions about component behavior. Unlike unit tests, integration tests may touch the real database, file system, or external APIs. Balance speed and realism in your integration test suite.',
        tags: ['testing', 'integration', 'reliability'],
      },
      {
        name: 'Test-Driven Development (TDD)',
        desc: 'TDD is a discipline where you write a failing test first, then write the minimal code to make it pass, then refactor. The cycle (Red-Green-Refactor) ensures every line of code is justified by a test, produces high coverage, and drives clean, testable design. TDD shines for complex business logic and bug fixes.',
        tags: ['testing', 'tdd', 'process'],
      },
      {
        name: 'Code Review',
        desc: 'Code review is the practice of having peers review each change before it reaches production. Reviewers check for correctness, design quality, test coverage, naming, and adherence to conventions. Reviews catch bugs early, spread knowledge across the team, and raise overall code quality. Keep reviews small and focused for maximum effectiveness.',
        tags: ['process', 'quality', 'collaboration'],
      },
      {
        name: 'Refactoring',
        desc: 'Refactoring improves the internal structure of code without changing its external behavior. It reduces technical debt, improves readability, and makes future changes easier. Common refactorings include extracting methods, renaming variables, simplifying conditionals, and replacing magic numbers with named constants. Always refactor with the safety net of a passing test suite.',
        tags: ['quality', 'maintainability', 'process'],
      },
      {
        name: 'Documentation',
        desc: 'Good documentation explains why code exists, not just what it does. At the project level, a README covers setup, architecture decisions, and contribution guidelines. At the code level, docstrings explain the intent behind non-obvious logic. Keep documentation close to the code and treat it as a first-class artifact that evolves alongside the system.',
        tags: ['documentation', 'quality', 'communication'],
      },
    ],
  },
];

/* ── State ─────────────────────────────────────────── */

let _panel = null;
let _open = false;
let _activeCat = 0;
let _detailModal = null;

/* ── Helpers ───────────────────────────────────────── */

function _el(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'innerHTML') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  if (children) for (const c of [].concat(children)) el.appendChild(c);
  return el;
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Public API ────────────────────────────────────── */

export function isOpen() { return _open; }

export function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
}

export function close() {
  if (!_open) return;
  _closeDetailModal();
  _panel.classList.remove('open');
  _open = false;
}

/* ── Build panel ───────────────────────────────────── */

function _buildPanel() {
  _panel = document.createElement('div');
  _panel.id = 'egPanel';
  _panel.className = 'eg-overlay';
  _panel.innerHTML = `
    <div class="eg-container">
      <div class="eg-header">
        <h2>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
            <path d="M12 2L2 7l10 5 10-5L12 2z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          Software Engineering Essentials
        </h2>
        <div class="eg-header-right">
          <button class="eg-btn-close" id="egCloseBtn">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>
          </button>
        </div>
      </div>
      <div class="eg-body">
        <div class="eg-cat-sidebar" id="egCatSidebar"></div>
        <div class="eg-items-area" id="egItemsArea"></div>
      </div>
    </div>
  `;
  document.body.appendChild(_panel);

  _panel.querySelector('#egCloseBtn').addEventListener('click', close);

  _buildCategories();
  _selectCategory(0);

  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e) {
  if (e.key === 'Escape') {
    if (_detailModal) { _closeDetailModal(); return; }
    if (_open) close();
  }
}

/* ── Categories sidebar ────────────────────────────── */

function _buildCategories() {
  const sidebar = _panel.querySelector('#egCatSidebar');
  sidebar.innerHTML = '';
  CATEGORIES.forEach((cat, i) => {
    const btn = _el('div', {
      className: 'eg-cat-btn' + (i === _activeCat ? ' active' : ''),
      dataset: { idx: i },
    });
    btn.innerHTML =
      '<span class="eg-cat-icon">' + cat.icon + '</span>' +
      '<span class="eg-cat-name">' + _esc(cat.name) + '</span>' +
      '<span class="eg-cat-count">' + cat.items.length + '</span>';
    btn.addEventListener('click', () => _selectCategory(i));
    sidebar.appendChild(btn);
  });
}

function _selectCategory(idx) {
  _activeCat = idx;
  _panel.querySelectorAll('.eg-cat-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  _renderItems(idx);
}

/* ── Items grid ────────────────────────────────────── */

function _renderItems(idx) {
  const area = _panel.querySelector('#egItemsArea');
  const cat = CATEGORIES[idx];
  if (!cat) return;

  area.innerHTML = '';
  const header = _el('div', { className: 'eg-items-header' });
  header.innerHTML =
    '<h3>' + _esc(cat.name) + '</h3>' +
    '<p>' + _esc(cat.desc) + '</p>';
  area.appendChild(header);

  const grid = _el('div', { className: 'eg-items-grid' });
  cat.items.forEach((item) => {
    const card = _el('div', { className: 'eg-term-card' });
    const tagsHtml = item.tags.length
      ? '<div class="eg-term-card-tags">' + item.tags.map(t => '<span class="eg-term-tag">' + _esc(t) + '</span>').join('') + '</div>'
      : '';
    card.innerHTML =
      '<div class="eg-term-card-name">' + _esc(item.name) + '</div>' +
      '<div class="eg-term-card-desc">' + _esc(item.desc) + '</div>' +
      tagsHtml;
    card.addEventListener('click', () => _showDetail(item));
    grid.appendChild(card);
  });
  area.appendChild(grid);
}

/* ── Detail modal ──────────────────────────────────── */

function _showDetail(item) {
  _closeDetailModal();
  const modal = _el('div', { className: 'eg-detail-modal' });
  const tagsHtml = item.tags.length
    ? '<div class="eg-detail-tags">' + item.tags.map(t => '<span class="eg-detail-tag">' + _esc(t) + '</span>').join('') + '</div>'
    : '';
  modal.innerHTML = `
    <div class="eg-detail-box">
      <div class="eg-detail-header">
        <span class="eg-detail-title">${_esc(item.name)}</span>
        <button class="eg-detail-close" id="egDetailClose">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5l10 10M15 5l-10 10"/></svg>
        </button>
      </div>
      <div class="eg-detail-body">
        <div class="eg-detail-desc">${_esc(item.desc)}</div>
        ${tagsHtml}
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => { if (e.target === modal) _closeDetailModal(); });
  modal.querySelector('#egDetailClose').addEventListener('click', _closeDetailModal);
  document.body.appendChild(modal);
  _detailModal = modal;
}

function _closeDetailModal() {
  if (!_detailModal) return;
  _detailModal.remove();
  _detailModal = null;
}
