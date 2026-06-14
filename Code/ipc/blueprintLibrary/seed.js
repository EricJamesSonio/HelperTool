// ── Seed data ──────────────────────────────────────────────────────────

const SEED_CATEGORIES = [
  { name: 'Authentication',             type: 'code' },
  { name: 'CRUD',                       type: 'code' },
  { name: 'Error Handling',             type: 'code' },
  { name: 'Events & Queues',            type: 'code' },
  { name: 'API Design',                 type: 'code' },
  { name: 'Real-time',                  type: 'code' },
  { name: 'Database',                   type: 'code' },
  { name: 'Web App',                    type: 'structure' },
  { name: 'Backend',                    type: 'structure' },
  { name: 'Monorepo',                   type: 'structure' },
  { name: 'Mobile',                     type: 'structure' },
  { name: 'Express.js',                 type: 'setup-steps' },
  { name: 'React (Vite)',               type: 'setup-steps' },
  { name: 'Next.js',                    type: 'setup-steps' },
  { name: 'Vue.js (Vite)',              type: 'setup-steps' },
  { name: 'Nuxt.js',                    type: 'setup-steps' },
  { name: 'Angular',                    type: 'setup-steps' },
  { name: 'Svelte (Vite)',              type: 'setup-steps' },
  { name: 'SvelteKit',                  type: 'setup-steps' },
  { name: 'NestJS',                     type: 'setup-steps' },
  { name: 'Remix',                      type: 'setup-steps' },
  { name: 'Astro',                      type: 'setup-steps' },
  { name: 'Solid.js (Vite)',            type: 'setup-steps' },
  { name: 'Django',                     type: 'setup-steps' },
  { name: 'Flask',                      type: 'setup-steps' },
  { name: 'FastAPI',                    type: 'setup-steps' },
  { name: 'Laravel',                    type: 'setup-steps' },
  { name: 'Ruby on Rails',              type: 'setup-steps' },
  { name: 'Go (Gin)',                   type: 'setup-steps' },
  { name: 'Rust (Axum)',                type: 'setup-steps' },
  { name: 'Spring Boot',                type: 'setup-steps' },
  { name: 'ASP.NET Core',               type: 'setup-steps' },
];

const SEED_BLUEPRINTS = {};

function _bp(categoryName, name, description, pseudoCode, tags) {
  if (!SEED_BLUEPRINTS[categoryName]) SEED_BLUEPRINTS[categoryName] = [];
  SEED_BLUEPRINTS[categoryName].push({ name, description, pseudo_code: pseudoCode, tags });
}

// ── Code Blueprints ──

// Authentication
_bp('Authentication', 'Auth Controller',
  'Defines the structure of an auth controller: login, register, logout, refresh token endpoints.',
`CONTROLLER AuthController
  DEPENDS ON AuthService

  ENDPOINT POST /login
    INPUT  { email, password }
    VALIDATE email format, password not empty
    CALL   AuthService.login(email, password)
    IF     success → RETURN { token, user }
    IF     fail    → THROW UnauthorizedException

  ENDPOINT POST /register
    INPUT  { email, password, name }
    VALIDATE input fields not empty, password min length
    CALL   AuthService.register(input)
    RETURN created user

  ENDPOINT POST /logout
    REQUIRE authenticated
    CALL   AuthService.logout(userId)
    RETURN { message: "Logged out" }

  ENDPOINT POST /refresh
    INPUT  refreshToken from cookie or header
    CALL   AuthService.refreshToken(token)
    RETURN { accessToken }`,
  'auth,controller,rest,api');

_bp('Authentication', 'Auth Service',
  'Business logic for authentication: password hashing, token generation, user lookup.',
`SERVICE AuthService
  DEPENDS ON UserRepository, TokenProvider, Hasher

  FUNCTION login(email, password)
    user ← UserRepository.findByEmail(email)
    IF user is null → THROW UserNotFoundException
    IF NOT Hasher.verify(password, user.passwordHash) → THROW InvalidCredentialsException
    tokens ← TokenProvider.generatePair(user.id, user.role)
    RETURN tokens

  FUNCTION register(input)
    existing ← UserRepository.findByEmail(input.email)
    IF existing → THROW EmailAlreadyExistsException
    hash ← Hasher.hash(input.password)
    user ← UserRepository.create({ ...input, passwordHash: hash })
    RETURN user

  FUNCTION logout(userId)
    TokenProvider.revokeAll(userId)

  FUNCTION refreshToken(token)
    payload ← TokenProvider.verifyRefresh(token)
    IF payload is null → THROW InvalidTokenException
    tokens ← TokenProvider.generatePair(payload.userId, payload.role)
    RETURN tokens`,
  'auth,service,business-logic');

_bp('Authentication', 'JWT Middleware',
  'Middleware that validates JWT tokens, extracts user info, and attaches to request context.',
`MIDDLEWARE JwtAuth
  CONFIG
    secret:       from env
    algorithms:   [HS256, RS256]
    excludePaths: [/login, /register, /health]

  ON_REQUEST(ctx)
    IF ctx.path in excludePaths → SKIP
    header ← ctx.headers["Authorization"]
    IF header is null or not starts with "Bearer " → THROW UnauthorizedException
    token ← header.substring(7)
    TRY
      payload ← jwt.verify(token, secret, algorithms)
      ctx.user ← { id: payload.sub, role: payload.role, email: payload.email }
    CATCH JwtExpired
      THROW TokenExpiredException
    CATCH any
      THROW InvalidTokenException

  USAGE
    router.use(JwtAuth)`,
  'auth,middleware,jwt,token');

_bp('Authentication', 'Session Handler',
  'Server-side session management with in-memory or Redis-backed storage.',
`SESSION_MANAGER SessionHandler
  CONFIG
    store:    redis (default) | in-memory
    ttl:      3600 seconds
    keyPrefix: "sess:"

  FUNCTION create(userId, data)
    sessionId ← generateUUID()
    session ← { id: sessionId, userId, data, createdAt: now(), expiresAt: now() + ttl }
    store.set(keyPrefix + sessionId, session, ttl)
    RETURN sessionId

  FUNCTION get(sessionId)
    session ← store.get(keyPrefix + sessionId)
    IF session is null → RETURN null
    IF session.expiresAt < now() → DELETE this; RETURN null
    RETURN session

  FUNCTION update(sessionId, data)
    session ← get(sessionId)
    IF session is null → THROW SessionNotFoundException
    session.data ← merge(session.data, data)
    store.set(keyPrefix + sessionId, session, ttl)

  FUNCTION destroy(sessionId)
    store.delete(keyPrefix + sessionId)

  FUNCTION cleanExpired()
    store.scan(keyPrefix + "*") each key
      session ← store.get(key)
      IF session.expiresAt < now() → store.delete(key)`,
  'auth,session,redis');

_bp('Authentication', 'OAuth Flow',
  'Complete OAuth 2.0 authorization code flow handler.',
`SERVICE OAuthFlow
  CONFIG
    providers: {
      google:  { clientId, clientSecret, redirectUri, scopes },
      github:  { clientId, clientSecret, redirectUri, scopes },
    }

  FUNCTION getAuthorizationUrl(provider, state)
    config ← providers[provider]
    params ← {
      client_id:     config.clientId,
      redirect_uri:  config.redirectUri,
      scope:         config.scopes.join(" "),
      state:         state,
      response_type: "code",
    }
    RETURN buildUrl(config.authEndpoint, params)

  FUNCTION handleCallback(provider, code, state)
    config ← providers[provider]
    tokens ← POST config.tokenEndpoint {
      code, client_id, client_secret, redirect_uri,
      grant_type: "authorization_code"
    }
    userInfo ← GET config.userInfoEndpoint
      headers: { Authorization: "Bearer " + tokens.access_token }
    existing ← UserRepository.findByOAuth(provider, userInfo.id)
    IF existing → RETURN existing
    user ← UserRepository.createFromOAuth(provider, userInfo)
    RETURN user

  FUNCTION refreshToken(provider, refreshToken)
    config ← providers[provider]
    tokens ← POST config.tokenEndpoint {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }
    RETURN tokens`,
  'auth,oauth,sso');

// CRUD
_bp('CRUD', 'Basic CRUD Controller',
  'Standard CRUD controller with list, get, create, update, delete endpoints.',
`CONTROLLER CrudController
  DEPENDS ON CrudService
  CONFIG
    resourceName: "items"
    allowedFilters: [search, status, sortBy, page, limit]

  ENDPOINT GET /:resourceName
    QUERY  filters
    CALL   CrudService.list(filters)
    RETURN { data, total, page, limit }

  ENDPOINT GET /:resourceName/:id
    CALL   CrudService.getById(id)
    RETURN data

  ENDPOINT POST /:resourceName
    BODY   data
    VALIDATE schema
    CALL   CrudService.create(data)
    STATUS 201
    RETURN created

  ENDPOINT PUT /:resourceName/:id
    BODY   data
    VALIDATE schema partial
    CALL   CrudService.update(id, data)
    RETURN updated

  ENDPOINT DELETE /:resourceName/:id
    CALL   CrudService.delete(id)
    STATUS 204`,
  'crud,controller,rest,api');

_bp('CRUD', 'CRUD Service',
  'Business logic layer for CRUD operations with validation and error handling.',
`SERVICE CrudService
  DEPENDS ON Repository, EventEmitter

  FUNCTION list(filters)
    query ← QueryBuilder.from(filters)
      .where(filters.search ? "name ILIKE %search%" : null)
      .sort(filters.sortBy || "createdAt")
      .paginate(filters.page || 1, filters.limit || 20)
    items ← Repository.findMany(query)
    total ← Repository.count(query.withoutPagination())
    RETURN { items, total, page: query.page, limit: query.limit }

  FUNCTION getById(id)
    item ← Repository.findById(id)
    IF item is null → THROW NotFoundException
    RETURN item

  FUNCTION create(data)
    validated ← validateSchema(data)
    item ← Repository.create(validated)
    EventEmitter.emit(resourceName + ":created", item)
    RETURN item

  FUNCTION update(id, data)
    existing ← Repository.findById(id)
    IF existing is null → THROW NotFoundException
    validated ← validateSchemaPartial(data)
    item ← Repository.update(id, validated)
    EventEmitter.emit(resourceName + ":updated", { before: existing, after: item })
    RETURN item

  FUNCTION delete(id)
    existing ← Repository.findById(id)
    IF existing is null → THROW NotFoundException
    Repository.delete(id)
    EventEmitter.emit(resourceName + ":deleted", existing)`,
  'crud,service,business-logic');

_bp('CRUD', 'Repository Pattern',
  'Data access abstraction layer that isolates the business logic from the data source.',
`REPOSITORY Repository
  CONFIG
    model:       EntityClass
    primaryKey:  "id"
    softDelete:  true

  FUNCTION findMany(query)
    qb ← QueryBuilder()
      .select(query.fields || "*")
      .where(query.where || {})
      .where({ deletedAt: null }) if softDelete
      .orderBy(query.sortBy || "createdAt", query.sortDir || "DESC")
      .limit(query.limit).offset(query.offset)
    RETURN db.query(qb.build())

  FUNCTION findById(id)
    qb ← QueryBuilder().select("*").where({ [primaryKey]: id })
      .where({ deletedAt: null }) if softDelete
      .limit(1)
    row ← db.query(qb.build())
    RETURN row ? mapToEntity(row) : null

  FUNCTION create(data)
    now ← now()
    record ← { ...data, createdAt: now, updatedAt: now }
    id ← db.insert(model.tableName, record)
    RETURN findById(id)

  FUNCTION update(id, data)
    record ← { ...data, updatedAt: now() }
    db.update(model.tableName, record, { [primaryKey]: id })
    RETURN findById(id)

  FUNCTION delete(id)
    if softDelete
      db.update(model.tableName, { deletedAt: now() }, { [primaryKey]: id })
    else
      db.delete(model.tableName, { [primaryKey]: id })

  FUNCTION count(where)
    qb ← QueryBuilder().select("COUNT(*) as total").where(where || {})
      .where({ deletedAt: null }) if softDelete
    result ← db.query(qb.build())
    RETURN result[0].total`,
  'crud,repository,data-access');

_bp('CRUD', 'Paginated List Query',
  'Reusable pagination + filtering + sorting query handler for list endpoints.',
`QUERY_HANDLER PaginatedListQuery
  DEPENDS ON Repository

  FUNCTION execute(params)
    page     ← max(1, int(params.page  || 1))
    limit    ← clamp(int(params.limit || 20), 1, 100)
    offset   ← (page - 1) * limit
    sortBy   ← params.sortBy  || "createdAt"
    sortDir  ← (params.sortDir || "desc").upper() == "ASC" ? "ASC" : "DESC"
    search   ← params.search  || null
    filters  ← extractFilters(params, allowedFilterKeys)

    where ← { ...filters }
    if search → where.OR ← [
      { name:   { ILIKE: "%" + search + "%" } },
      { email:  { ILIKE: "%" + search + "%" } },
    ]

    items ← Repository.findMany({ where, sortBy, sortDir, limit, offset })
    total ← Repository.count(where)

    RETURN {
      data:      items,
      pagination: {
        page, limit, total,
        totalPages:  ceil(total / limit),
        hasNext:     page * limit < total,
        hasPrev:     page > 1,
      }
    }

  FUNCTION extractFilters(params, keys)
    filters ← {}
    FOR key in keys
      IF params[key] != null → filters[key] ← params[key]
    RETURN filters`,
  'crud,pagination,query,list');

// Error Handling
_bp('Error Handling', 'Global Error Handler',
  'Central error handler middleware that catches all exceptions and returns consistent error responses.',
`MIDDLEWARE GlobalErrorHandler
  CONFIG
    showStackTrace: false (true in dev)

  ON_ERROR(err, ctx)
    status  ← err.status  || 500
    code    ← err.code    || "INTERNAL_ERROR"
    message ← err.message || "An unexpected error occurred"
    details ← err.details || null

    LOG {
      level:    status >= 500 ? "ERROR" : "WARN",
      path:     ctx.path,
      method:   ctx.method,
      status,
      code,
      message,
      stack:    err.stack if showStackTrace,
      userId:   ctx.user?.id,
    }

    ctx.response.status(status).json({
      error: {
        code, message,
        details: details,
        requestId: ctx.requestId,
      }
    })

  REGISTRATION
    app.use(GlobalErrorHandler) // must be LAST middleware`,
  'error,handling,middleware');

_bp('Error Handling', 'Domain Exception',
  'Base exception class for domain-level errors with HTTP status, error code, and structured details.',
`CLASS DomainException extends Error
  PROPERTIES
    status:  500
    code:    "DOMAIN_ERROR"
    details: null

  CONSTRUCTOR(message, status, code, details)
    super(message)
    this.name ← "DomainException"
    this.status  ← status  || 500
    this.code    ← code    || "DOMAIN_ERROR"
    this.details ← details || null
    Error.captureStackTrace(this, this.constructor) if available

// ── Concrete exceptions ──

CLASS NotFoundException extends DomainException
  CONSTRUCTOR(message, details)
    super(message || "Resource not found", 404, "NOT_FOUND", details)

CLASS ValidationException extends DomainException
  CONSTRUCTOR(errors)
    super("Validation failed", 422, "VALIDATION_ERROR", errors)

CLASS UnauthorizedException extends DomainException
  CONSTRUCTOR(message)
    super(message || "Unauthorized", 401, "UNAUTHORIZED")

CLASS ForbiddenException extends DomainException
  CONSTRUCTOR(message)
    super(message || "Forbidden", 403, "FORBIDDEN")

CLASS ConflictException extends DomainException
  CONSTRUCTOR(message, details)
    super(message || "Conflict", 409, "CONFLICT", details)`,
  'error,exception,domain');

_bp('Error Handling', 'Validation Error Response',
  'Standard structure for validation error responses with per-field error messages.',
`STRUCTURE ValidationErrorResponse
  STATUS: 422
  CODE:   "VALIDATION_ERROR"

  BODY
    error: {
      code:    "VALIDATION_ERROR",
      message: "Validation failed",
      details: [
        {
          field:    "email",
          message:  "Email is required",
          code:     "REQUIRED",
          value:    null,
        },
        {
          field:    "password",
          message:  "Password must be at least 8 characters",
          code:     "MIN_LENGTH",
          value:    "abc",
        },
      ],
    }

  USAGE
    THROW ValidationException([
      { field: "email",    message: "...", code: "REQUIRED",  value: input.email },
      { field: "password", message: "...", code: "MIN_LENGTH", value: input.password },
    ])`,
  'error,validation,response');

// Events & Queues
_bp('Events & Queues', 'Event Emitter Pattern',
  'Typed event emitter implementation with subscribe/publish pattern and middleware support.',
`CLASS EventEmitter
  CONFIG
    maxListeners: 100
    async:        true

  PROPERTIES
    listeners:   Map<eventType, Set<Handler>>
    middleware:  List<EventMiddleware>

  FUNCTION on(eventType, handler, options)
    options ← options || { once: false, priority: 0 }
    wrapped ← { handler, options }
    IF NOT listeners.has(eventType)
      listeners.set(eventType, new Set())
    listeners.get(eventType).add(wrapped)
    IF options.once → RETURN unsubscribe function

  FUNCTION once(eventType, handler)
    RETURN on(eventType, handler, { once: true })

  FUNCTION off(eventType, handler)
    IF listeners.has(eventType)
      listeners.get(eventType).deleteWhere(h → h.handler == handler)

  FUNCTION emit(eventType, payload)
    event ← { type: eventType, payload, timestamp: now(), id: generateId() }
    chain ← buildMiddlewareChain(event)
    chain.next(() → {
      IF listeners.has(eventType)
        FOR each wrapped in listeners.get(eventType)
          IF async → schedule(wrapped.handler, event)
          ELSE     → wrapped.handler(event)
          IF wrapped.options.once → listeners.get(eventType).delete(wrapped)
    })

  FUNCTION buildMiddlewareChain(event)
    stack ← [...middleware]
    RETURN {
      next: function run(index = 0)
        IF index < stack.length
          stack[index](event, () → run(index + 1))
    }

  FUNCTION schedule(handler, event)
    queueMicrotask(() → {
      TRY handler(event)
      CATCH err → GlobalErrorHandler.report(err)
    })`,
  'events,emitter,pub-sub');

_bp('Events & Queues', 'Queue Worker',
  'Background job processor with retry, dead-letter queue, and concurrency control.',
`WORKER QueueWorker
  CONFIG
    queueName:       "default"
    concurrency:     5
    pollInterval:    1000 ms
    maxRetries:      3
    deadLetterQueue: "default-dlq"

  STATE
    running:    false
    activeJobs: 0

  FUNCTION start()
    running ← true
    LOOP while running
      IF activeJobs < concurrency
        job ← queue.dequeue(queueName)
        IF job
          activeJobs++
          processJob(job).finally(() → activeJobs--)
        ELSE
          WAIT(pollInterval)

  FUNCTION stop()
    running ← false

  FUNCTION processJob(job)
    TRY
      handler ← registry.get(job.type)
      IF handler is null → THROW "No handler for type: " + job.type
      result ← handler(job.data)
      queue.ack(job.id)
      LOG "Job completed", { jobId: job.id, type: job.type }
      RETURN result
    CATCH err
      job.attempts ← (job.attempts || 0) + 1
      IF job.attempts < maxRetries
        job.nextRetry ← now() + backoff(job.attempts)
        queue.requeue(job)
        LOG "Job retrying", { jobId: job.id, attempt: job.attempts }
      ELSE
        queue.sendToDlq(job)
        LOG "Job sent to DLQ", { jobId: job.id, error: err.message }

  FUNCTION backoff(attempt)
    RETURN min(2^attempt * 1000, 30000) // exponential backoff capped at 30s`,
  'queue,worker,jobs,background');

_bp('Events & Queues', 'Pub/Sub Handler',
  'Publish-subscribe messaging pattern for decoupled service communication.',
`CLASS PubSub
  CONFIG
    transport: redis | in-memory | rabbitmq
    prefix:    "ps:"

  FUNCTION subscribe(channel, handler)
    transport.subscribe(prefix + channel, (message) →
      TRY
        parsed ← JSON.parse(message)
        handler(parsed)
      CATCH err
        LOG "PubSub handler error", { channel, error: err.message }
    )
    RETURN unsubscribe function

  FUNCTION publish(channel, data)
    message ← JSON.stringify({
      channel,
      data,
      timestamp: now(),
      id: generateId(),
    })
    transport.publish(prefix + channel, message)

  FUNCTION unsubscribeAll(channel)
    transport.unsubscribe(prefix + channel)

  // ── Pattern subscriptions (wildcard support) ──
  FUNCTION subscribePattern(pattern, handler)
    transport.psubscribe(prefix + pattern, handler)

// ── Event constants (shared between publisher and subscriber) ──
ENUM DomainEvents
  USER_CREATED   = "user.created"
  USER_UPDATED   = "user.updated"
  USER_DELETED   = "user.deleted"
  ORDER_PLACED   = "order.placed"
  PAYMENT_FAILED = "payment.failed"`,
  'pubsub,events,messaging');

// API Design
_bp('API Design', 'REST Controller Structure',
  'Standard structure for a RESTful controller with request handling, validation, and response formatting.',
`STRUCTURE RestController
  NAMING: [Resource]Controller
  PATH:   /api/v1/[resources]

  LAYERS
    ├── Controller          ← HTTP handling, no business logic
    │   └── calls Service
    ├── Service             ← Business logic, validation
    │   └── calls Repository
    ├── Repository          ← Data access
    └── Domain/Entity       ← Data models

  CONVENTION
    GET    /resource        → index()    → list all
    GET    /resource/:id    → show()     → get one
    POST   /resource        → store()    → create
    PUT    /resource/:id    → update()   → replace
    PATCH  /resource/:id    → partial()  → partial update
    DELETE /resource/:id    → destroy()  → delete

  RESPONSE FORMAT
    Success: { data, meta? }
    List:    { data: [], meta: { total, page, limit } }
    Error:   { error: { code, message, details? } }

  STATUS CODES
    200 OK          → GET, PUT, PATCH
    201 Created     → POST
    204 No Content  → DELETE
    400 Bad Request → validation error
    401 Unauthorized
    403 Forbidden
    404 Not Found   → resource not found
    409 Conflict    → duplicate, state conflict
    422 Unprocessable
    500 Server Error`,
  'api,rest,controller,structure');

_bp('API Design', 'Request/Response DTO',
  'Data Transfer Object pattern for API contracts — separates external interface from internal models.',
`PATTERN DataTransferObject
  PURPOSE
    Decouple external API contracts from internal domain models.
    DTOs define what the API sends and receives.

  REQUEST DTO
    CLASS CreateUserRequest
      PROPERTIES
        @required @email    email:    String
        @required @min(8)   password: String
        @required           name:     String
        @optional           role:     UserRole = "user"

      FUNCTION toDomain()
        RETURN {
          email:    this.email.trim().lower(),
          password: this.password,      // hashed later in service
          name:     this.name.trim(),
          role:     this.role,
        }

    CLASS UpdateUserRequest
      PROPERTIES
        @optional @email    email:    String
        @optional           name:     String
        @optional           role:     UserRole

  RESPONSE DTO
    CLASS UserResponse
      PROPERTIES
        id:        String
        email:     String
        name:      String
        role:      String
        createdAt: DateTime

      STATIC FUNCTION fromDomain(user)
        RETURN new UserResponse({
          id:        user.id,
          email:     user.email,
          name:      user.name,
          role:      user.role,
          createdAt: user.createdAt,
        })

  USAGE
    // Controller
    FUNCTION store(req)
      dto ← new CreateUserRequest(req.body)
      dto.validate()
      user ← AuthService.register(dto.toDomain())
      RETURN UserResponse.fromDomain(user)`,
  'api,dto,contract,validation');

_bp('API Design', 'API Versioning Structure',
  'Strategies for API versioning — URL path, header, or query parameter approaches.',
`STRUCTURE ApiVersioning
  STRATEGIES

  1. URL Path Versioning
    PATH: /api/v1/users, /api/v2/users
    ROUTER:
      router.mount("/api/v1", v1Routes)
      router.mount("/api/v2", v2Routes)
    PROS: Explicit, cache-friendly, easy to route
    CONS: URL pollution, harder to maintain multiple versions

  2. Header Versioning
    HEADER: Accept: application/vnd.api+json;version=2
    MIDDLEWARE:
      FUNCTION versionMiddleware(req, res, next)
        version ← parseVersion(req.headers["accept"])
        req.apiVersion ← version || latest
        next()
    PROS: Clean URLs, proper content negotiation
    CONS: Harder to test, less discoverable

  3. Query Parameter Versioning
    QUERY: /api/users?version=2
    PROS: Simple, easy to test
    CONS: Pollutes query params, can be cached incorrectly

  RECOMMENDATION
    Use URL path versioning for major breaking changes.
    Use header versioning for minor, backward-compatible changes.
    Maintain at most 2 major versions simultaneously.
    Deprecate old versions with Sunset header.

  DEPRECATION HEADER
    Sunset: Sat, 01 Jan 2027 00:00:00 GMT
    Deprecation: true
    Link: </api/v2/users>; rel="successor"`,
  'api,versioning,structure');

// Real-time
_bp('Real-time', 'WebSocket Handler',
  'WebSocket connection manager with event routing, rooms, and authentication.',
`HANDLER WebSocketHandler
  CONFIG
    path:     "/ws"
    maxPayload: 1 MB
    heartbeatInterval: 30000 ms

  STATE
    connections: Set<Socket>
    rooms:       Map<roomName, Set<Socket>>

  ON_CONNECTION(socket)
    socket.id ← generateId()
    socket.connectedAt ← now()
    connections.add(socket)
    LOG "Client connected", { id: socket.id }

    socket.on("message", (raw) →
      TRY
        msg ← JSON.parse(raw)
        route(socket, msg)
      CATCH err
        socket.send({ type: "error", payload: { message: "Invalid message" } })
    )

    socket.on("close", () →
      connections.delete(socket)
      FOR each [room, members] in rooms
        members.delete(socket)
      LOG "Client disconnected", { id: socket.id }
    )

    socket.on("error", (err) →
      LOG "Socket error", { id: socket.id, error: err.message }
    )

    // Heartbeat
    interval ← setInterval(() →
      if socket.readyState == OPEN → socket.ping()
    , heartbeatInterval)
    socket.on("close", () → clearInterval(interval))

  FUNCTION route(socket, msg)
    SWITCH msg.type
      CASE "subscribe"   → joinRoom(socket, msg.payload.room)
      CASE "unsubscribe" → leaveRoom(socket, msg.payload.room)
      CASE "broadcast"   → broadcastToRoom(msg.payload.room, msg.payload.event, socket)
      CASE "auth"        → authenticate(socket, msg.payload.token)

  FUNCTION authenticate(socket, token)
    TRY
      payload ← jwt.verify(token)
      socket.user ← payload
      socket.send({ type: "authenticated", payload: { userId: payload.sub } })
    CATCH
      socket.send({ type: "error", payload: { message: "Invalid token" } })

  FUNCTION broadcastToRoom(room, event, sender)
    IF rooms.has(room)
      FOR each socket in rooms.get(room)
        IF socket != sender
          socket.send({ type: "event", room, payload: event })`,
  'websocket,realtime,events');

_bp('Real-time', 'Room/Channel Manager',
  'Manages named rooms/channels for WebSocket or pub/sub — join, leave, broadcast, membership tracking.',
`MANAGER RoomChannelManager
  DEPENDS ON WebSocketHandler (optional, can work standalone)

  STATE
    rooms: Map<roomName, Set<Member>>
    memberMetadata: Map<memberId, Object>

  FUNCTION createRoom(name, options)
    options ← options || { persistent: false, maxMembers: 0 }
    IF rooms.has(name) → THROW RoomAlreadyExistsException
    rooms.set(name, { members: new Set(), options, createdAt: now() })
    LOG "Room created", { name }

  FUNCTION joinRoom(roomName, member)
    room ← getRoom(roomName)
    IF room.options.maxMembers > 0 AND room.members.size >= room.options.maxMembers
      → THROW RoomFullException
    room.members.add(member)
    memberMetadata.set(member.id, { joinedAt: now(), ...member.meta })
    broadcastToRoom(roomName, { type: "user.joined", userId: member.id })

  FUNCTION leaveRoom(roomName, memberId)
    room ← getRoom(roomName)
    room.members.deleteWhere(m → m.id == memberId)
    memberMetadata.delete(memberId)
    broadcastToRoom(roomName, { type: "user.left", userId: memberId })
    IF room.members.size == 0 AND NOT room.options.persistent
      rooms.delete(roomName)

  FUNCTION broadcast(roomName, event, excludeMemberId)
    room ← getRoom(roomName)
    FOR each member in room.members
      IF member.id != excludeMemberId
        member.send(event)  // or publish to member's socket/channel

  FUNCTION getRoom(roomName)
    IF NOT rooms.has(roomName) → THROW RoomNotFoundException
    RETURN rooms.get(roomName)

  FUNCTION listMembers(roomName)
    room ← getRoom(roomName)
    RETURN Array.from(room.members).map(m → ({
      id:   m.id,
      meta: memberMetadata.get(m.id),
    }))

  FUNCTION listRooms()
    RETURN Array.from(rooms.entries()).map(([name, room]) → ({
      name,
      memberCount: room.members.size,
      createdAt:   room.createdAt,
    }))`,
  'websocket,room,channel,realtime');

// Database
_bp('Database', 'Migration Structure',
  'Database migration pattern with up/down methods, version tracking, and sequential execution.',
`STRUCTURE Migration
  NAMING: YYYYMMDD_HHMMSS_description.js

  INTERFACE
    FUNCTION up(db)
      // Apply migration
      db.run("CREATE TABLE users (id INT PRIMARY KEY, name TEXT)")

    FUNCTION down(db)
      // Rollback
      db.run("DROP TABLE IF EXISTS users")

  RUNNER MigrationRunner
    STATE
      executed: Set<version>
      pending:  List<Migration>

    FUNCTION runAll()
      sort pending by version ascending
      FOR each migration in pending
        IF NOT executed.has(migration.version)
          TRY
            db.transaction(() →
              migration.up(db)
              recordExecution(migration.version)
            )
            LOG "Migration applied", { version: migration.version }
          CATCH err
            LOG "Migration failed", { version: migration.version, error: err.message }
            THROW err

    FUNCTION rollback(count)
      executed ← getExecutedOrderedByVersionDesc()
      FOR i from 0 to min(count, executed.length) - 1
        migration ← findMigration(executed[i].version)
        TRY
          db.transaction(() →
            migration.down(db)
            removeExecution(executed[i].version)
          )
          LOG "Migration rolled back", { version: migration.version }
        CATCH err
          LOG "Rollback failed", { version: migration.version, error: err.message }
          THROW err

  VERSION TABLE
    CREATE TABLE _migrations (
      version   TEXT PRIMARY KEY,
      name      TEXT,
      appliedAt TEXT DEFAULT (datetime('now'))
    )`,
  'database,migration,schema');

_bp('Database', 'Seeder Structure',
  'Database seeder pattern for populating development/test data with factories.',
`STRUCTURE Seeder
  INTERFACE
    FUNCTION run(db)
      // Insert seed data
      db.insert("users", { name: "Admin", email: "admin@test.com" })
      db.insert("users", { name: "User",  email: "user@test.com" })

  RUNNER SeederRunner
    FUNCTION seedAll(seeders)
      FOR each seeder in seeders
        TRY
          db.transaction(() → seeder.run(db))
          LOG "Seed complete", { seeder: seeder.constructor.name }
        CATCH err
          LOG "Seed failed", { seeder: seeder.constructor.name, error: err.message }

    FUNCTION seedOne(seeder)
      db.transaction(() → seeder.run(db))

  FACTORY UserFactory
    FUNCTION make(overrides)
      RETURN {
        name:     faker.name(),
        email:    faker.email(),
        password: hash("password"),
        role:     overrides.role || "user",
        ...overrides,
      }

    FUNCTION makeMany(count, overrides)
      RETURN Array(count).fill(null).map(() → make(overrides))

  USAGE
    CLASS UserSeeder extends Seeder
      FUNCTION run(db)
        users ← UserFactory.makeMany(10)
        FOR each user in users
          db.insert("users", user)`,
  'database,seeder,testing');

_bp('Database', 'Query Builder Wrapper',
  'Fluent query builder that wraps raw SQL with a chainable, type-safe API.',
`CLASS QueryBuilder
  STATE
    table:      null
    selects:    ["*"]
    joins:      []
    wheres:     []
    groups:     []
    havings:    []
    orders:     []
    limit:      null
    offset:     null
    bindings:   []

  FUNCTION from(table)
    this.table ← table
    RETURN this

  FUNCTION select(fields)
    this.selects ← Array.isArray(fields) ? fields : [fields]
    RETURN this

  FUNCTION where(column, operator, value)
    IF value is undefined → value ← operator; operator ← "="
    this.wheres.push({ boolean: "AND", column, operator, value })
    this.bindings.push(value)
    RETURN this

  FUNCTION orWhere(column, operator, value)
    IF value is undefined → value ← operator; operator ← "="
    this.wheres.push({ boolean: "OR", column, operator, value })
    this.bindings.push(value)
    RETURN this

  FUNCTION whereIn(column, values)
    this.wheres.push({ boolean: "AND", column, operator: "IN", value: values })
    this.bindings.push(...values)
    RETURN this

  FUNCTION join(table, first, operator, second)
    this.joins.push({ type: "INNER", table, first, operator, second })
    RETURN this

  FUNCTION leftJoin(table, first, operator, second)
    this.joins.push({ type: "LEFT", table, first, operator, second })
    RETURN this

  FUNCTION groupBy(columns)
    this.groups ← Array.isArray(columns) ? columns : [columns]
    RETURN this

  FUNCTION orderBy(column, direction)
    this.orders.push({ column, direction: (direction || "ASC").toUpperCase() })
    RETURN this

  FUNCTION take(limit)
    this.limit ← limit
    RETURN this

  FUNCTION skip(offset)
    this.offset ← offset
    RETURN this

  FUNCTION toSql()
    parts ← ["SELECT", selects.join(", "), "FROM", table]
    IF joins.length   → parts.push(joins.map(formatJoin).join(" "))
    IF wheres.length  → parts.push("WHERE", formatWheres(wheres))
    IF groups.length  → parts.push("GROUP BY", groups.join(", "))
    IF havings.length → parts.push("HAVING", formatHavings(havings))
    IF orders.length  → parts.push("ORDER BY", orders.map(o → o.column + " " + o.direction).join(", "))
    IF limit != null  → parts.push("LIMIT", limit)
    IF offset != null → parts.push("OFFSET", offset)
    RETURN { sql: parts.join(" "), bindings: this.bindings }

  FUNCTION execute(db)
    { sql, bindings } ← this.toSql()
    RETURN db.query(sql, bindings)`,
  'database,query-builder,sql');

// ── Folder Structure Blueprints ──

// Web App
_bp('Web App', 'Client-Server',
  'Classic two-tier architecture separating the client application from the backend server.',
`STRUCTURE: Client-Server

root/
  client/                              ← SPA / mobile / desktop app
    src/
      components/                      ← reusable UI components
        common/                        ← buttons, inputs, modals
        layouts/                       ← page layouts, shell
        features/                      ← feature-specific components
      pages/                           ← route-level page components
      hooks/                           ← custom React hooks / composables
      services/                        ← API client layer (axios, fetch wrappers)
      stores/                          ← state management (zustand, pinia, redux)
      utils/                           ← helpers, formatters, validators
      types/                           ← TypeScript types / JSDoc typedefs
      assets/                          ← images, fonts, icons
      router/                          ← client-side routing
    test/
    package.json

  server/                              ← API server
    src/
      controllers/                     ← HTTP handlers only
      services/                        ← business logic
      repositories/                    ← data access
      middleware/                      ← auth, validation, logging
      routes/                          ← route definitions
      validators/                      ← input schemas (zod, joi)
      entities/                        ← domain models / ORM entities
      migrations/                      ← DB migrations
      seeders/                         ← test data
      utils/
    test/
    package.json

  shared/                              ← shared between client and server
    types/
    constants/
    validation/

RULES:
- Server owns the data, client only displays and collects input
- API contract is the single source of truth between tiers
- Client never talks to the database directly
- Server provides REST or GraphQL endpoints`,
  'client-server,web,architecture');

_bp('Web App', 'MVC',
  'Model-View-Controller pattern separating data, presentation, and user interaction logic.',
`STRUCTURE: MVC

root/
  app/
    controllers/                       ← handles requests, delegates to models
      AuthController.js
      UserController.js
      ProductController.js
    models/                            ← data logic, validation, DB queries
      User.js
      Product.js
      Order.js
    views/                             ← templates / response rendering
      layouts/
      partials/
      auth/
      users/
    middleware/                        ← request pipeline
      auth.js
      logger.js
      cors.js
    routes/                            ← URL to controller mapping
      web.js
      api.js
    validators/                        ← request validation
    helpers/                           ← view helpers, utilities
    config/
      database.js
      app.js
    bootstrap/
      app.js                           ← service container, DI setup

  public/                              ← static assets
    css/
    js/
    images/

  resources/
    lang/                              ← i18n translations
    views/                             ← alternative view directory

  storage/
    logs/
    uploads/

  test/
    controllers/
    models/
    middleware/

RULES:
- Controllers are thin — no business logic, only request/response handling
- Models contain all business logic and data access
- Views are passive — only display data passed from controller
- Fat models, skinny controllers`,
  'mvc,web,architecture');

_bp('Web App', 'Feature-based',
  'Organizes code by feature/domain rather than by technical role, colocating all related files.',
`STRUCTURE: Feature-based

root/
  src/
    features/                          ← each folder is a self-contained feature
      auth/
        components/
          LoginForm.jsx
          RegisterForm.jsx
        hooks/
          useAuth.js
        services/
          authService.js
        stores/
          authStore.js
        types/
          auth.types.ts
        AuthController.js             ← if SSR/API
        index.js                      ← public barrel exports

      users/
        components/
          UserList.jsx
          UserCard.jsx
          UserForm.jsx
        hooks/
          useUsers.js
        services/
          userService.js
        stores/
          userStore.js
        types/

      products/
        components/
          ProductGrid.jsx
          ProductCard.jsx
        hooks/
          useProducts.js
        services/
          productService.js
        stores/

    shared/                            ← truly shared code across features
      components/
        Button.jsx
        Modal.jsx
        Input.jsx
      hooks/
        useDebounce.js
      utils/
        formatDate.js
      ui/                              ← design system primitives
        theme.js

    app/                               ← app shell
      router.jsx
      App.jsx
      providers.jsx

    test/
      features/                        ← mirrors features structure
        auth/
        users/

RULES:
- Everything related to a feature lives in one folder
- No cross-feature imports — share via shared/ layer only
- Each feature can be extracted into its own package if needed
- Feature folders can contain their own routes, services, components`,
  'feature-based,architecture,modular');

// Backend
_bp('Backend', 'Microservices',
  'Microservice architecture with independently deployable services, event-driven communication.',
`STRUCTURE: Microservices

root/
  services/
    auth-service/
      src/
        controllers/                   ← HTTP layer only, no business logic
        services/                      ← business logic
        repositories/                  ← data access
        middleware/                    ← auth-specific middleware
        routes/
        dtos/                          ← input/output contracts
        validators/
        entities/                      ← DB models / ORM
        events/                        ← event publishers / subscribers
        config/
      test/
      Dockerfile
      package.json

    user-service/                      ← same structure as auth-service
    payment-service/
    notification-service/
    order-service/

  shared/
    libs/                              ← shared utilities
      logger.js
      httpClient.js
      retry.js
    contracts/                         ← shared DTOs / interfaces
      auth.contract.js
      user.contract.js
      payment.contract.js
    types/
    messaging/
      eventBus.js
      eventSchema.js
    observability/
      tracing.js
      metrics.js

  gateway/                             ← API gateway
    src/
      routes/                          ← routes to each microservice
      middleware/                      ← auth, rate limiting, cors
      rateLimiter.js
    package.json

  infrastructure/
    docker-compose.yml
    kubernetes/
    terraform/

RULES:
- Each service owns its own database — no shared DB across services
- Services communicate via async events (Kafka, RabbitMQ), not direct HTTP calls
- Gateway handles auth, rate limiting, and routing before forwarding requests
- Services are independently deployable
- Shared libs must be versioned and backward-compatible`,
  'microservices,backend,architecture');

_bp('Backend', 'N-Tier / Layered',
  'Traditional layered architecture with strict horizontal layering — presentation, business, data access.',
`STRUCTURE: N-Tier / Layered

root/
  presentation/                         ← outermost layer
    controllers/                        ← request/response handling
    routes/
    middleware/
    validators/
    dtos/                               ← request/response objects
    mappers/                            ← DTO ↔ domain mapping

  business/                             ← core logic layer
    services/                           ← use cases, business rules
    domain/                             ← domain models, value objects
    ports/                              ← interfaces for data access
      inbound/                          ← service interfaces
      outbound/                         ← repository interfaces
    events/                             ← domain events
    exceptions/                         ← domain exceptions

  data/                                 ← data access layer
    repositories/                       ← implementations of outbound ports
    entities/                           ← ORM / DB models
    migrations/
    seeders/
    dao/                                ← data access objects

  cross-cutting/                        ← concerns spanning all layers
    logging/
    auth/
    caching/
    config/

  test/
    unit/                               ← test business layer in isolation
    integration/                        ← test data layer with real DB
    e2e/                                ← test full stack

RULES:
- Layers communicate top-down only: Presentation → Business → Data
- Business layer knows nothing about HTTP or the database
- Business layer defines port interfaces; data layer implements them
- Dependency injection connects layers at composition root
- Each layer has its own model — DTOs ≠ domain models ≠ entities`,
  'layered,n-tier,backend,architecture');

_bp('Backend', 'Domain-Driven Design (DDD)',
  'Domain-Driven Design tactical patterns: aggregates, entities, value objects, repositories, domain events.',
`STRUCTURE: Domain-Driven Design (DDD)

root/
  src/
    context/                            ← bounded context
      domain/                           ← the heart of DDD
        aggregates/
          Order.js                      ← aggregate root
          Cart.js
        entities/
          User.js
          Product.js
        value-objects/
          Money.js
          Email.js
          Address.js
          OrderStatus.js
        events/
          OrderPlacedEvent.js
          OrderShippedEvent.js
        repositories/                   ← interfaces only
          IOrderRepository.js
          IUserRepository.js
        services/                       ← domain services (stateless)
          PricingService.js
          ShippingService.js
        exceptions/                     ← domain exceptions
          InsufficientStockException.js

      application/                      ← use cases / application services
        use-cases/
          PlaceOrderUseCase.js
          CancelOrderUseCase.js
        ports/                          ← inbound ports (use case interfaces)
          IPlaceOrderUseCase.js
        dto/
          PlaceOrderRequest.js
          PlaceOrderResponse.js

      infrastructure/                   ← adapters for ports
        persistence/
          repositories/                 ← implementations
            SqliteOrderRepository.js
          entity/                       ← ORM entities
          migrations/
        messaging/
          EventBus.js
          EventHandlers.js
        external/                       ← external API clients
          PaymentGateway.js
          EmailSender.js

      presentation/                     ← API layer
        controllers/
        routes/
        middleware/

    shared/                             ← shared kernel
      domain/
        BaseEntity.js
        BaseValueObject.js
      infrastructure/
        Database.js

RULES:
- Domain layer has zero external dependencies
- Ubiquitous language throughout the codebase
- Aggregates are consistency boundaries — always load as a whole
- Repositories return domain aggregates, not ORM entities`,
  'ddd,domain-driven-design,architecture');

_bp('Backend', 'Hexagonal Architecture',
  'Ports and Adapters (Hexagonal) pattern — core business logic isolated from external concerns.',
`STRUCTURE: Hexagonal Architecture (Ports & Adapters)

root/
  src/
    core/                               ← pure business logic, NO external dependencies
      domain/
        model/
          Order.js
          User.js
          Product.js
        service/                        ← domain services
          OrderService.js
          PricingService.js
        port/                           ← interfaces (the "ports")
          inbound/                      ← driving ports (use cases)
            OrderUseCase.js
            UserUseCase.js
          outbound/                     ← driven ports (repositories, external)
            OrderRepository.js
            PaymentGateway.js
            NotificationService.js
        event/
          DomainEvent.js
          EventPublisher.js             ← port interface
        exception/
          BusinessException.js

    infrastructure/                     ← adapters for each port
      adapter/
        inbound/                        ← driving adapters
          rest/                         ← REST controller adapter
            OrderController.js
            middleware/
          graphql/
            OrderResolver.js
          cli/
            ImportOrdersCommand.js
        outbound/                       ← driven adapters
          persistence/
            SqliteOrderRepository.js    ← implements OrderRepository port
            migrations/
          payment/
            StripePaymentGateway.js     ← implements PaymentGateway port
          notification/
            SendGridService.js          ← implements NotificationService port
          messaging/
            RabbitMQEventPublisher.js   ← implements EventPublisher port

    config/
      dependencyInjection.js            ← wires ports to adapters
      app.js

    test/
      core/                             ← test business logic in isolation (fast)
      adapter/                          ← integration tests

RULES:
- Core has ZERO imports from infrastructure
- All dependencies point INWARD — core defines what it needs via ports
- Adapters are replaceable (swap SQLite for PostgreSQL, REST for GraphQL)
- Test core with mock adapters — no DB, no HTTP in unit tests`,
  'hexagonal,ports-adapters,architecture');

// Monorepo
_bp('Monorepo', 'Monorepo (shared libs)',
  'Single repository with shared library packages consumed by multiple applications.',
`STRUCTURE: Monorepo (shared libs)

root/
  packages/
    lib-utils/                          ← shared utility functions
      src/
        index.js
        stringUtils.js
        dateUtils.js
        objectUtils.js
      test/
      package.json

    lib-ui/                             ← shared UI component library
      src/
        components/
          Button.jsx
          Modal.jsx
          Input.jsx
          Table.jsx
        hooks/
          useDebounce.js
          useMediaQuery.js
        theme/
          tokens.js
          ThemeProvider.jsx
      test/
      package.json

    lib-api-client/                     ← shared API client
      src/
        HttpClient.js
        endpoints/
        interceptors/
      package.json

  apps/
    admin-panel/
      src/
        pages/
        features/
        app.js
      package.json                      ← depends on lib-ui, lib-utils, lib-api-client

    customer-portal/
      src/
        pages/
        features/
      package.json                      ← depends on lib-ui, lib-utils, lib-api-client

  tools/                                ← monorepo tooling
    eslint-config-custom/
    tsconfig-base.json
    jest.config.base.js

  test/
    e2e/

  package.json                          ← root workspace config
  pnpm-workspace.yaml / lerna.json

RULES:
- Libraries are versioned independently via changesets or semantic-release
- Apps consume libraries as packages (not relative imports)
- Shared libraries keep bundle size small — tree-shakeable exports
- Root-level scripts for common tasks: build, test, lint`,
  'monorepo,shared-libs,architecture');

_bp('Monorepo', 'Monorepo (independent apps)',
  'Single repository with multiple independent applications that share minimal or no code.',
`STRUCTURE: Monorepo (independent apps)

root/
  apps/
    backend-api/
      src/
        controllers/
        services/
        repositories/
        routes/
      test/
      Dockerfile
      package.json

    mobile-app/
      src/
        screens/
        components/
        navigation/
        services/
      test/
      package.json

    web-app/
      src/
        pages/
        components/
        features/
      test/
      package.json

    cli-tool/
      src/
        commands/
        utils/
      test/
      package.json

  config/
    eslint/
      base.js
    typescript/
      tsconfig.base.json
    jest/
      jest.config.base.js
    commitlint.config.js

  scripts/
    build-all.sh
    deploy.sh
    version.sh

  test/
    e2e/                                ← cross-app E2E tests

  .github/
    workflows/
      ci.yml
      deploy.yml

  package.json                          ← workspace root
  pnpm-workspace.yaml / packageManager

RULES:
- Apps are fully independent — can be built and deployed separately
- No shared source code between apps (or minimal via extracted packages)
- CI runs only the affected app's tests on changes
- Root configs (eslint, tsconfig) provide consistent defaults but each app can override
- Release process is per-app, not monolith`,
  'monorepo,independent-apps,architecture');

// Mobile
_bp('Mobile', 'React Native structure',
  'Standard React Native project structure with screens, components, navigation, and services.',
`STRUCTURE: React Native

root/
  src/
    screens/                            ← full-screen views
      Auth/
        LoginScreen.jsx
        RegisterScreen.jsx
      Home/
        HomeScreen.jsx
      Profile/
        ProfileScreen.jsx
      Settings/
        SettingsScreen.jsx

    components/                         ← reusable UI components
      common/
        Button.jsx
        Input.jsx
        Card.jsx
        Loading.jsx
        EmptyState.jsx
      layouts/
        ScreenLayout.jsx
        AuthLayout.jsx

    navigation/                         ← routing / navigation
      AppNavigator.jsx
      AuthNavigator.jsx
      TabNavigator.jsx
      types.js

    services/                           ← API / external services
      api/
        client.js
        auth.js
        users.js
      storage/
        secureStorage.js
        asyncStorage.js
      notifications/
        pushNotifications.js

    hooks/                              ← custom hooks
      useAuth.js
      useNetwork.js
      useDebounce.js
      useKeyboard.js

    stores/                             ← state management
      authStore.js
      userStore.js

    utils/                              ← helpers
      validators.js
      formatters.js
      constants.js

    assets/                             ← static files
      images/
      fonts/
      icons/

    types/                              ← TypeScript types

    theme/                              ← app theme
      colors.js
      typography.js
      spacing.js
      index.js

  test/
    screens/
    components/
    hooks/

  android/
  ios/
  package.json

RULES:
- Screens should be thin — compose components, delegate logic to hooks/services
- Navigation is centralized — avoid scattered navigation logic
- Platform-specific code uses .ios.js / .android.js extensions`,
  'react-native,mobile,architecture');

_bp('Mobile', 'Flutter structure',
  'Standard Flutter project structure with screens, widgets, services, and state management.',
`STRUCTURE: Flutter

root/
  lib/
    app/
      app.dart                           ← MaterialApp, routing
      router.dart                        ← GoRouter / Navigator config
      theme.dart                         ← ThemeData, colors, typography

    core/                                ← shared foundation
      constants/
        api_constants.dart
        app_constants.dart
      errors/
        exceptions.dart
        failures.dart
      network/
        api_client.dart
        interceptors.dart
        network_info.dart
      utils/
        validators.dart
        formatters.dart
        extensions.dart
      widgets/                           ← truly reusable widgets
        app_button.dart
        app_text_field.dart
        loading_widget.dart
        error_widget.dart

    features/                            ← feature-based organization
      auth/
        data/
          datasources/
            auth_remote_datasource.dart
            auth_local_datasource.dart
          models/
            user_model.dart
            token_model.dart
          repositories/
            auth_repository_impl.dart
        domain/
          entities/
            user.dart
            token.dart
          repositories/
            auth_repository.dart          ← abstract
          usecases/
            login_usecase.dart
            register_usecase.dart
        presentation/
          cubit/                          ← or provider / riverpod / bloc
            auth_cubit.dart
            auth_state.dart
          screens/
            login_screen.dart
            register_screen.dart
          widgets/
            login_form.dart
            auth_header.dart

      home/
        data/
        domain/
        presentation/

      profile/
        data/
        domain/
        presentation/

  test/
    features/
      auth/
        data/
        domain/
        presentation/

  assets/
    images/
    fonts/

  pubspec.yaml

RULES:
- Clean Architecture layers: data → domain → presentation (inward dependency)
- Each feature is independent — no cross-feature imports
- BLoC/Cubit or Riverpod for state management
- Usecases encapsulate single business operations`,
  'flutter,mobile,architecture');

// ── Setup Steps ──

// Express.js
_bp('Express.js', 'Express.js Setup',
  'Step-by-step guide to set up an Express.js server from scratch.',
`## Step 1: Initialize the project
\`\`\`bash
mkdir my-app
cd my-app
npm init -y
\`\`\`

## Step 2: Install Express
\`\`\`bash
npm install express
\`\`\`

## Step 3: Install dev dependencies
\`\`\`bash
npm install -D nodemon
\`\`\`

## Step 4: Create entry file
Create \`index.js\`:
\`\`\`javascript
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
\`\`\`

## Step 5: Add start script
In \`package.json\`, update scripts:
\`\`\`json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js"
}
\`\`\`

## Step 6: Run
\`\`\`bash
npm run dev
\`\`\``,
  'express,node,backend,rest');

// React (Vite)
_bp('React (Vite)', 'React + Vite Setup',
  'Step-by-step guide to set up a React project with Vite.',
`## Step 1: Create Vite project
\`\`\`bash
npm create vite@latest my-app -- --template react
cd my-app
\`\`\`

## Step 2: Install dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 4: Project structure
\`\`\`
my-app/
  src/
    App.jsx
    App.css
    index.css
    main.jsx
  index.html
  package.json
  vite.config.js
\`\`\`

## Step 5: Edit App.jsx
Edit \`src/App.jsx\`:
\`\`\`jsx
import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1>Vite + React</h1>
      <button onClick={() => setCount(c => c + 1)}>
        count is {count}
      </button>
    </div>
  )
}
export default App
\`\`\`

## Step 6: Build for production
\`\`\`bash
npm run build
\`\`\``,
  'react,vite,frontend,spa');

// Next.js
_bp('Next.js', 'Next.js Setup',
  'Step-by-step guide to set up a Next.js app with App Router.',
`## Step 1: Create Next.js project
\`\`\`bash
npx create-next-app@latest my-app
cd my-app
\`\`\`
You will be prompted for:
- TypeScript? Yes/No
- ESLint? Yes
- Tailwind CSS? Yes/No
- App Router? Yes
- Import alias? Yes

## Step 2: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 3: Project structure (App Router)
\`\`\`
my-app/
  app/
    layout.js
    page.js
    globals.css
  public/
  package.json
  next.config.js
\`\`\`

## Step 4: Edit home page
Edit \`app/page.js\`:
\`\`\`jsx
export default function Home() {
  return (
    <main>
      <h1>Hello Next.js</h1>
    </main>
  )
}
\`\`\`

## Step 5: Add a route
Create \`app/about/page.js\`:
\`\`\`jsx
export default function About() {
  return <h1>About Page</h1>
}
\`\`\`

## Step 6: Build for production
\`\`\`bash
npm run build
npm start
\`\`\``,
  'nextjs,react,fullstack,ssr');

// Vue.js (Vite)
_bp('Vue.js (Vite)', 'Vue.js + Vite Setup',
  'Step-by-step guide to set up a Vue 3 project with Vite.',
`## Step 1: Create Vite project
\`\`\`bash
npm create vue@latest my-app
cd my-app
\`\`\`

## Step 2: Install dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 4: Project structure
\`\`\`
my-app/
  src/
    App.vue
    main.js
    style.css
  index.html
  package.json
  vite.config.js
\`\`\`

## Step 5: Edit App.vue
Edit \`src/App.vue\`:
\`\`\`vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <h1>Vue + Vite</h1>
  <button @click="count++">count is {{ count }}</button>
</template>

<style scoped>
h1 { color: #42b883; }
</style>
\`\`\`

## Step 6: Build for production
\`\`\`bash
npm run build
\`\`\``,
  'vue,vite,frontend,spa');

// Nuxt.js
_bp('Nuxt.js', 'Nuxt.js Setup',
  'Step-by-step guide to set up a Nuxt 3 project.',
`## Step 1: Create Nuxt project
\`\`\`bash
npx nuxi@latest init my-app
cd my-app
\`\`\`

## Step 2: Install dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 4: Project structure
\`\`\`
my-app/
  app.vue
  nuxt.config.ts
  pages/
    index.vue
  public/
  package.json
\`\`\`

## Step 5: Edit app.vue
Edit \`app.vue\`:
\`\`\`vue
<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtWelcome />
  </div>
</template>
\`\`\`

## Step 6: Add a page
Create \`pages/about.vue\`:
\`\`\`vue
<template>
  <h1>About Nuxt</h1>
</template>
\`\`\`

## Step 7: Build for production
\`\`\`bash
npm run build
node .output/server/index.mjs
\`\`\``,
  'nuxt,vue,fullstack,ssr');

// Angular
_bp('Angular', 'Angular Setup',
  'Step-by-step guide to set up an Angular project with CLI.',
`## Step 1: Install Angular CLI
\`\`\`bash
npm install -g @angular/cli
\`\`\`

## Step 2: Create project
\`\`\`bash
ng new my-app
cd my-app
\`\`\`
You will be prompted for:
- Stylesheet format? CSS/SCSS/Sass/Less
- SSR? Yes/No

## Step 3: Start dev server
\`\`\`bash
ng serve
\`\`\`
Navigate to \`http://localhost:4200\`.

## Step 4: Project structure
\`\`\`
my-app/
  src/
    app/
      app.component.ts
      app.component.html
      app.component.css
      app.config.ts
    main.ts
    index.html
    styles.css
  angular.json
  package.json
  tsconfig.json
\`\`\`

## Step 5: Edit root component
Edit \`src/app/app.component.ts\`:
\`\`\`typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: \`
    <h1>Hello Angular</h1>
  \`,
  styles: ['h1 { color: #dd0031; }']
})
export class AppComponent {
  title = 'my-app';
}
\`\`\`

## Step 6: Generate a component
\`\`\`bash
ng generate component hello
\`\`\`

## Step 7: Build for production
\`\`\`bash
ng build --configuration production
\`\`\``,
  'angular,frontend,spa,cli');

// Svelte (Vite)
_bp('Svelte (Vite)', 'Svelte + Vite Setup',
  'Step-by-step guide to set up a Svelte project with Vite.',
`## Step 1: Create Vite project
\`\`\`bash
npm create vite@latest my-app -- --template svelte
cd my-app
\`\`\`

## Step 2: Install dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 4: Project structure
\`\`\`
my-app/
  src/
    App.svelte
    main.js
    app.css
  index.html
  package.json
  vite.config.js
  svelte.config.js
\`\`\`

## Step 5: Edit App.svelte
Edit \`src/App.svelte\`:
\`\`\`svelte
<script>
  let count = 0
</script>

<h1>Hello Svelte</h1>
<button on:click={() => count++}>
  count is {count}
</button>

<style>
  h1 { color: #ff3e00; }
</style>
\`\`\`

## Step 6: Build for production
\`\`\`bash
npm run build
\`\`\``,
  'svelte,vite,frontend,spa');

// SvelteKit
_bp('SvelteKit', 'SvelteKit Setup',
  'Step-by-step guide to set up a SvelteKit project.',
`## Step 1: Create SvelteKit project
\`\`\`bash
npm create svelte@latest my-app
cd my-app
\`\`\`
You will be prompted for:
- Template: Skeleton/Demo
- TypeScript? Yes/No
- ESLint? Yes/No
- Prettier? Yes/No

## Step 2: Install dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 4: Project structure
\`\`\`
my-app/
  src/
    routes/
      +page.svelte
      +layout.svelte
    app.html
  static/
  package.json
  svelte.config.js
  vite.config.js
\`\`\`

## Step 5: Edit home page
Edit \`src/routes/+page.svelte\`:
\`\`\`svelte
<script>
  let name = 'world'
</script>

<h1>Hello {name}!</h1>
<input bind:value={name} />
\`\`\`

## Step 6: Add a route
Create \`src/routes/about/+page.svelte\`:
\`\`\`svelte
<h1>About SvelteKit</h1>
\`\`\`

## Step 7: Build for production
\`\`\`bash
npm run build
npm run preview
\`\`\``,
  'sveltekit,svelte,fullstack,ssr');

// NestJS
_bp('NestJS', 'NestJS Setup',
  'Step-by-step guide to set up a NestJS project with CLI.',
`## Step 1: Install NestJS CLI
\`\`\`bash
npm install -g @nestjs/cli
\`\`\`

## Step 2: Create project
\`\`\`bash
nest new my-app
cd my-app
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run start:dev
\`\`\`
Server runs on \`http://localhost:3000\`.

## Step 4: Project structure
\`\`\`
my-app/
  src/
    app.controller.ts
    app.service.ts
    app.module.ts
    main.ts
  test/
  package.json
  tsconfig.json
  nest-cli.json
\`\`\`

## Step 5: Edit main.ts
\`\`\`typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
\`\`\`

## Step 6: Generate a resource
\`\`\`bash
nest generate resource users
\`\`\`
This generates CRUD module, controller, service, entity, and DTO.

## Step 7: Build for production
\`\`\`bash
npm run build
node dist/main
\`\`\``,
  'nestjs,node,backend,typescript,rest');

// Remix
_bp('Remix', 'Remix Setup',
  'Step-by-step guide to set up a Remix project with Vite.',
`## Step 1: Create Remix project
\`\`\`bash
npx create-remix@latest my-app
cd my-app
\`\`\`
You will be prompted for:
- Deployment target: Vercel/Cloudflare/Express/Arc? Choose Express
- TypeScript? Yes

## Step 2: Install dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 4: Project structure
\`\`\`
my-app/
  app/
    root.tsx
    routes/
      _index.tsx
    entry.client.tsx
    entry.server.tsx
  public/
  package.json
  vite.config.ts
\`\`\`

## Step 5: Edit index route
Edit \`app/routes/_index.tsx\`:
\`\`\`tsx
export default function Index() {
  return (
    <main>
      <h1>Welcome to Remix</h1>
    </main>
  )
}
\`\`\`

## Step 6: Add a route
Create \`app/routes/about.tsx\`:
\`\`\`tsx
export default function About() {
  return <h1>About Remix</h1>
}
\`\`\`

## Step 7: Build for production
\`\`\`bash
npm run build
npm start
\`\`\``,
  'remix,react,fullstack,ssr');

// Astro
_bp('Astro', 'Astro Setup',
  'Step-by-step guide to set up an Astro project.',
`## Step 1: Create Astro project
\`\`\`bash
npm create astro@latest my-app
cd my-app
\`\`\`
You will be prompted for:
- Template: Basics/Blog/Empty
- TypeScript? Yes/No
- Install dependencies? Yes

## Step 2: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 3: Project structure
\`\`\`
my-app/
  src/
    pages/
      index.astro
    layouts/
      Layout.astro
  public/
  package.json
  astro.config.mjs
\`\`\`

## Step 4: Edit home page
Edit \`src/pages/index.astro\`:
\`\`\`astro
---
const title = 'My Astro Site'
---

<html lang="en">
  <head><title>{title}</title></head>
  <body>
    <h1>Hello Astro</h1>
  </body>
</html>
\`\`\`

## Step 5: Add a page
Create \`src/pages/about.astro\`:
\`\`\`astro
---
const title = 'About'
---
<html>
  <head><title>{title}</title></head>
  <body><h1>About</h1></body>
</html>
\`\`\`

## Step 6: Add a framework (React)
\`\`\`bash
npx astro add react
\`\`\`

## Step 7: Build for production
\`\`\`bash
npm run build
\`\`\`
Output goes to \`dist/\`.`,
  'astro,static,ssg,frontend');

// Solid.js (Vite)
_bp('Solid.js (Vite)', 'Solid.js + Vite Setup',
  'Step-by-step guide to set up a Solid.js project with Vite.',
`## Step 1: Create Vite project
\`\`\`bash
npm create vite@latest my-app -- --template solid
cd my-app
\`\`\`

## Step 2: Install dependencies
\`\`\`bash
npm install
\`\`\`

## Step 3: Start dev server
\`\`\`bash
npm run dev
\`\`\`

## Step 4: Project structure
\`\`\`
my-app/
  src/
    App.jsx
    main.jsx
    index.css
  index.html
  package.json
  vite.config.js
\`\`\`

## Step 5: Edit App.jsx
Edit \`src/App.jsx\`:
\`\`\`jsx
import { createSignal } from 'solid-js'

function App() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <h1>Hello Solid</h1>
      <button onClick={() => setCount(c => c + 1)}>
        count is {count()}
      </button>
    </div>
  )
}
export default App
\`\`\`

## Step 6: Build for production
\`\`\`bash
npm run build
\`\`\``,
  'solid,vite,frontend,spa');

// Django
_bp('Django', 'Django Setup',
  'Step-by-step guide to set up a Django project.',
`## Step 1: Create virtual environment
\`\`\`bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\\Scripts\\activate     # Windows
\`\`\`

## Step 2: Install Django
\`\`\`bash
pip install django
\`\`\`

## Step 3: Create project
\`\`\`bash
django-admin startproject myproject
cd myproject
\`\`\`

## Step 4: Run migrations
\`\`\`bash
python manage.py migrate
\`\`\`

## Step 5: Start dev server
\`\`\`bash
python manage.py runserver
\`\`\`
Navigate to \`http://localhost:8000\`.

## Step 6: Project structure
\`\`\`
myproject/
  myproject/
    __init__.py
    settings.py
    urls.py
    wsgi.py
  manage.py
\`\`\`

## Step 7: Create an app
\`\`\`bash
python manage.py startapp pages
\`\`\`
Add 'pages' to \`INSTALLED_APPS\` in \`myproject/settings.py\`.

## Step 8: Create a view
Edit \`pages/views.py\`:
\`\`\`python
from django.http import HttpResponse

def home(request):
    return HttpResponse('Hello Django')
\`\`\`

## Step 9: Wire URL
Create \`pages/urls.py\`:
\`\`\`python
from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
]
\`\`\`
Update \`myproject/urls.py\`:
\`\`\`python
from django.urls import include, path

urlpatterns = [
    path('', include('pages.urls')),
]
\`\`\`

## Step 10: Run again
\`\`\`bash
python manage.py runserver
\`\`\``,
  'django,python,backend,fullstack');

// Flask
_bp('Flask', 'Flask Setup',
  'Step-by-step guide to set up a Flask application.',
`## Step 1: Create virtual environment
\`\`\`bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\\Scripts\\activate     # Windows
\`\`\`

## Step 2: Install Flask
\`\`\`bash
pip install flask
\`\`\`

## Step 3: Create app.py
\`\`\`python
from flask import Flask

app = Flask(__name__)

@app.route('/')
def home():
    return 'Hello Flask!'

if __name__ == '__main__':
    app.run(debug=True)
\`\`\`

## Step 4: Run the app
\`\`\`bash
python app.py
\`\`\`
Navigate to \`http://localhost:5000\`.

## Step 5: Project structure
\`\`\`
my-app/
  venv/
  app.py
  requirements.txt
\`\`\`

## Step 6: Freeze dependencies
\`\`\`bash
pip freeze > requirements.txt
\`\`\`

## Step 7: Add templates
Create \`templates/index.html\`:
\`\`\`html
<!DOCTYPE html>
<html>
<head><title>Flask</title></head>
<body><h1>Hello from Template</h1></body>
</html>
\`\`\`
Update \`app.py\`:
\`\`\`python
from flask import Flask, render_template

@app.route('/')
def home():
    return render_template('index.html')
\`\`\``,
  'flask,python,backend,minimal');

// FastAPI
_bp('FastAPI', 'FastAPI Setup',
  'Step-by-step guide to set up a FastAPI project.',
`## Step 1: Create virtual environment
\`\`\`bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\\Scripts\\activate     # Windows
\`\`\`

## Step 2: Install FastAPI and server
\`\`\`bash
pip install fastapi uvicorn
\`\`\`

## Step 3: Create main.py
\`\`\`python
from fastapi import FastAPI

app = FastAPI(title='My API')

@app.get('/')
def read_root():
    return {'message': 'Hello FastAPI!'}

@app.get('/items/{item_id}')
def read_item(item_id: int, q: str = None):
    return {'item_id': item_id, 'q': q}
\`\`\`

## Step 4: Run the server
\`\`\`bash
uvicorn main:app --reload
\`\`\`
Navigate to \`http://localhost:8000\`.
API docs at \`http://localhost:8000/docs\`.

## Step 5: Project structure
\`\`\`
my-app/
  venv/
  main.py
  requirements.txt
\`\`\`

## Step 6: Add Pydantic models
\`\`\`python
from pydantic import BaseModel

class Item(BaseModel):
    name: str
    price: float
    in_stock: bool = True

@app.post('/items')
def create_item(item: Item):
    return {'item': item, 'total': item.price * 1.1}
\`\`\`

## Step 7: Freeze dependencies
\`\`\`bash
pip freeze > requirements.txt
\`\`\``,
  'fastapi,python,backend,rest,async');

// Laravel
_bp('Laravel', 'Laravel Setup',
  'Step-by-step guide to set up a Laravel project.',
`## Step 1: Install PHP and Composer
Ensure PHP 8.1+ and Composer are installed:
\`\`\`bash
php -v
composer -V
\`\`\`

## Step 2: Create project
\`\`\`bash
composer create-project laravel/laravel my-app
cd my-app
\`\`\`

## Step 3: Start dev server
\`\`\`bash
php artisan serve
\`\`\`
Navigate to \`http://localhost:8000\`.

## Step 4: Project structure
\`\`\`
my-app/
  app/
    Http/
      Controllers/
    Models/
  database/
    migrations/
  resources/
    views/
  routes/
    web.php
  public/
  .env
  artisan
\`\`\`

## Step 5: Create a route
Edit \`routes/web.php\`:
\`\`\`php
<?php

use Illuminate\\Support\\Facades\\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/hello', function () {
    return 'Hello Laravel!';
});
\`\`\`

## Step 6: Create a controller
\`\`\`bash
php artisan make:controller PageController
\`\`\`
Edit \`app/Http/Controllers/PageController.php\`:
\`\`\`php
<?php

namespace App\\Http\\Controllers;

class PageController extends Controller
{
    public function index()
    {
        return view('index');
    }
}
\`\`\`

## Step 7: Run migrations
\`\`\`bash
php artisan migrate
\`\`\`

## Step 8: Build assets (if using Vite)
\`\`\`bash
npm install
npm run build
\`\`\``,
  'laravel,php,backend,fullstack');

// Ruby on Rails
_bp('Ruby on Rails', 'Ruby on Rails Setup',
  'Step-by-step guide to set up a Ruby on Rails project.',
`## Step 1: Install Ruby and Rails
\`\`\`bash
ruby -v
gem install rails
\`\`\`

## Step 2: Create project
\`\`\`bash
rails new my-app
cd my-app
\`\`\`

## Step 3: Start dev server
\`\`\`bash
bin/rails server
\`\`\`
Navigate to \`http://localhost:3000\`.

## Step 4: Project structure
\`\`\`
my-app/
  app/
    controllers/
    models/
    views/
  config/
    routes.rb
  db/
    migrate/
  Gemfile
  Rakefile
\`\`\`

## Step 5: Create a route
Edit \`config/routes.rb\`:
\`\`\`ruby
Rails.application.routes.draw do
  root 'pages#home'
  get '/about', to: 'pages#about'
end
\`\`\`

## Step 6: Create a controller
\`\`\`bash
bin/rails generate controller Pages home about
\`\`\`
This creates \`app/controllers/pages_controller.rb\`:
\`\`\`ruby
class PagesController < ApplicationController
  def home
  end
  def about
  end
end
\`\`\`
And corresponding views in \`app/views/pages/\`.

## Step 7: Edit home view
Edit \`app/views/pages/home.html.erb\`:
\`\`\`erb
<h1>Hello Rails!</h1>
<p>Welcome to your Rails app.</p>
\`\`\`

## Step 8: Generate a model
\`\`\`bash
bin/rails generate model User name:string email:string
bin/rails db:migrate
\`\`\``,
  'rails,ruby,backend,fullstack');

// Go (Gin)
_bp('Go (Gin)', 'Go + Gin Setup',
  'Step-by-step guide to set up a Go web server with Gin.',
`## Step 1: Install Go
\`\`\`bash
go version
\`\`\`
Download from https://go.dev if not installed.

## Step 2: Create project
\`\`\`bash
mkdir my-app
cd my-app
go mod init my-app
\`\`\`

## Step 3: Install Gin
\`\`\`bash
go get github.com/gin-gonic/gin
\`\`\`

## Step 4: Create main.go
\`\`\`go
package main

import (
  "net/http"
  "github.com/gin-gonic/gin"
)

func main() {
  r := gin.Default()

  r.GET("/", func(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
      "message": "Hello Gin!",
    })
  })

  r.GET("/ping", func(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
      "pong": true,
    })
  })

  r.Run()
}
\`\`\`

## Step 5: Run the server
\`\`\`bash
go run main.go
\`\`\`
Navigate to \`http://localhost:8080\`.

## Step 6: Project structure
\`\`\`
my-app/
  main.go
  go.mod
  go.sum
\`\`\`

## Step 7: Build binary
\`\`\`bash
go build -o my-app
./my-app
\`\`\``,
  'go,golang,gin,backend,rest');

// Rust (Axum)
_bp('Rust (Axum)', 'Rust + Axum Setup',
  'Step-by-step guide to set up a Rust web server with Axum.',
`## Step 1: Install Rust
\`\`\`bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version
cargo --version
\`\`\`

## Step 2: Create project
\`\`\`bash
cargo new my-app
cd my-app
\`\`\`

## Step 3: Add Axum and Tokio
Edit \`Cargo.toml\`:
\`\`\`toml
[package]
name = "my-app"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
\`\`\`

## Step 4: Create main.rs
Edit \`src/main.rs\`:
\`\`\`rust
use axum::{
    routing::get,
    Router,
    Json,
};
use serde::Serialize;
use std::net::SocketAddr;

#[derive(Serialize)]
struct Message {
    message: String,
}

async fn hello() -> Json<Message> {
    Json(Message {
        message: "Hello Axum!".to_string(),
    })
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(hello));

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Server running on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
\`\`\`

## Step 5: Run
\`\`\`bash
cargo run
\`\`\`

## Step 6: Build release
\`\`\`bash
cargo build --release
./target/release/my-app
\`\`\``,
  'rust,axum,backend,rest,async');

// Spring Boot
_bp('Spring Boot', 'Spring Boot Setup',
  'Step-by-step guide to set up a Spring Boot project.',
`## Step 1: Prerequisites
Ensure JDK 17+ and Maven/Gradle are installed:
\`\`\`bash
java --version
mvn --version
\`\`\`

## Step 2: Create project with Spring Initializr
\`\`\`bash
curl https://start.spring.io/starter.zip \\
  -d type=maven-project \\
  -d language=java \\
  -d bootVersion=3.2.0 \\
  -d baseDir=my-app \\
  -d groupId=com.example \\
  -d artifactId=my-app \\
  -d dependencies=web,devtools \\
  -o my-app.zip
unzip my-app.zip
cd my-app
\`\`\`
Or use the web UI at https://start.spring.io.

## Step 3: Project structure
\`\`\`
my-app/
  src/main/java/com/example/myapp/
    MyAppApplication.java
  src/main/resources/
    application.properties
  pom.xml
\`\`\`

## Step 4: Create a REST controller
Create \`src/main/java/com/example/myapp/HelloController.java\`:
\`\`\`java
package com.example.myapp;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    @GetMapping("/")
    public String hello() {
        return "Hello Spring Boot!";
    }

    @GetMapping("/api/hello")
    public Message helloJson() {
        return new Message("Hello from Spring Boot");
    }

    record Message(String message) {}
}
\`\`\`

## Step 5: Run the application
\`\`\`bash
./mvnw spring-boot:run
\`\`\`
Navigate to \`http://localhost:8080\`.

## Step 6: Build JAR
\`\`\`bash
./mvnw package
java -jar target/my-app-0.0.1-SNAPSHOT.jar
\`\`\``,
  'spring-boot,java,backend,rest');

// ASP.NET Core
_bp('ASP.NET Core', 'ASP.NET Core Setup',
  'Step-by-step guide to set up an ASP.NET Core Web API.',
`## Step 1: Install .NET SDK
\`\`\`bash
dotnet --version
\`\`\`
Download from https://dotnet.microsoft.com if not installed.

## Step 2: Create project
\`\`\`bash
dotnet new webapi -n my-app
cd my-app
\`\`\`

## Step 3: Project structure
\`\`\`
my-app/
  Controllers/
  Properties/
  Program.cs
  appsettings.json
  my-app.csproj
\`\`\`

## Step 4: Edit Program.cs
\`\`\`csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.MapControllers();

app.Run();
\`\`\`

## Step 5: Create a controller
Create \`Controllers/HelloController.cs\`:
\`\`\`csharp
using Microsoft.AspNetCore.Mvc;

namespace my_app.Controllers;

[ApiController]
[Route("[controller]")]
public class HelloController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { message = "Hello ASP.NET Core!" });
    }

    [HttpGet("{id}")]
    public IActionResult Get(int id)
    {
        return Ok(new { id, message = $"Item {id}" });
    }
}
\`\`\`

## Step 6: Run
\`\`\`bash
dotnet run
\`\`\`
Navigate to \`https://localhost:5001\`.
Swagger UI at \`/swagger\`.

## Step 7: Publish
\`\`\`bash
dotnet publish -c Release -o ./publish
./publish/my-app
\`\`\``,
  'aspnet,csharp,dotnet,backend,rest');

module.exports = { SEED_CATEGORIES, SEED_BLUEPRINTS };
