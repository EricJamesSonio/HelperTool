# NestJS Setup & Best Practices

## Project Initialization
- Use NestJS CLI: `npm i -g @nestjs/cli && nest new project-name`
- TypeScript is mandatory
- Use pnpm for package management

## Folder Structure
src/
  modules/          # Feature modules
    users/
      users.module.ts
      users.controller.ts
      users.service.ts
      dto/
      entities/
  common/           # Shared module
    decorators/
    guards/
    interceptors/
    pipes/
    filters/
    types/
  config/           # Configuration module
  database/         # Database module (Prisma/TypeORM)
  main.ts           # Entry point

## Module Design
- One module per domain entity
- Modules import dependencies, not services
- Use `@Global()` decorator sparingly (only for core modules)
- Modules export providers that other modules need
- Feature modules are self-contained

## Controllers
- Thin controllers: parse request, delegate to service, return response
- Use decorators for route params, query, body
- Consistent REST naming: `@Get()`, `@Post()`, `@Put()`, `@Delete()`
- Version routes: `@Controller('api/v1/users')`
- Use validation pipe with DTO classes

## Services / Providers
- Business logic in services only
- Services inject repositories and other services
- Use interfaces for service contracts (loose coupling)
- Keep service methods focused (single responsibility)
- Use `@Injectable()` for dependency injection

## DTOs & Validation
- Use class-validator decorators on DTO classes
- Use class-transformer for serialization
- Separate create vs update DTOs
- ValidationPipe enabled globally with whitelist: true

## Database
- Use Prisma or TypeORM
- Repository pattern: inject repository into service
- Migrations for schema changes
- Transactions for multi-entity operations

## Guards & Auth
- Use guards for authentication (JWT, session)
- Use custom decorators for user context extraction
- Apply guards at controller or route level
- RBAC with custom roles guard

## Interceptors
- Transform response format globally
- Log request/response timing
- Cache responses for GET endpoints
- Serialize response data

## Exception Filters
- Global exception filter catches all errors
- Business exceptions extend base exception class
- Consistent error response format

## Testing
- Jest (built-in)
- Unit test services with mocked repositories
- E2E tests with supertest + test database
- Use Test.createTestingModule for integration tests
