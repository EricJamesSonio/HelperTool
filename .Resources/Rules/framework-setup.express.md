# Express.js Setup & Best Practices

## Project Initialization
- Use `npm init` then install express, typescript, ts-node
- Use tsx for dev server: `tsx watch src/index.ts`
- Keep ES module syntax (type: "module" in package.json)

## Folder Structure
src/
  routes/          # Route definitions (thin, delegate only)
  controllers/     # Request handling, validation, response
  services/        # Business logic
  middleware/      # Express middleware
  validators/      # Input validation schemas
  utils/           # Pure utilities
  types/           # TypeScript types
  config/          # Configuration files
  tests/           # Test files

## Route Design
- RESTful resource naming (plural nouns)
- Version your API: `/api/v1/resources`
- Routes only map URL to controller, no logic
- Use express.Router() for each resource group

## Controller Patterns
- Controllers handle: parse request, validate, call service, send response
- Try/catch wrapped around service calls
- Consistent response format: `{ success, data, error, meta }`
- Use HTTP status codes correctly (201 for create, 204 for delete)

## Middleware
- cors, helmet, compression added globally
- Error handler middleware as LAST middleware
- Rate limiting on sensitive endpoints
- Request validation middleware per route
- Auth middleware checks JWT/API key, attaches user to request

## Error Handling
- Custom AppError class with status code + message
- Global error handler middleware catches all errors
- Operational errors (expected) vs programming errors (unexpected)
- Log errors with structured logger (pino or winston)

## Validation
- Use zod for request validation schemas
- Validate on controller entry before service call
- Return 422 with detailed validation errors

## Database
- Use Prisma or Drizzle ORM
- Services depend on repository interfaces, not ORM directly
- Transactions for multi-step operations
- Connection pool configured for production

## Security
- Helmet for HTTP headers
- CORS configured per environment
- Input sanitization against XSS/NoSQL injection
- Rate limiting with express-rate-limit
- Payload size limits

## Testing
- Vitest + Supertest for integration tests
- Unit test services with mocked repositories
- Test error paths and edge cases
