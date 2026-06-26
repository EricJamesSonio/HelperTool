# Laravel Setup & Best Practices

## Project Initialization
- Use `composer create-project laravel/laravel project-name`
- PHP 8.2+
- Use Laravel Sail for local Docker development
- Use Laravel Breeze or Jetstream for auth scaffolding

## Folder Structure
app/
  Http/
    Controllers/    # Controller classes
    Requests/       # Form request validation classes
    Middleware/     # Custom middleware
  Models/           # Eloquent models
  Services/         # Business logic classes
  Repositories/     # Data access layer
  Enums/            # PHP enums
  Exceptions/       # Custom exception classes
  Traits/           # Reusable traits
database/
  migrations/       # Schema migrations
  seeders/          # Database seeders
  factories/        # Model factories
routes/
  web.php           # Web routes
  api.php           # API routes

## Controllers
- Keep controllers thin: call service, return response
- Use `__invoke` for single-action controllers
- Use route model binding for entity resolution
- Return resources/collections for API responses
- Use Form Requests for validation (not in controller)

## Eloquent Models
- One model per database table
- Use $fillable or $guarded for mass assignment protection
- Define relationships explicitly (belongsTo, hasMany, etc.)
- Use accessors/mutators for attribute transformation
- Use local/global scopes for query reusability
- Use model events (boot method) for side effects

## Services
- Business logic in service classes, not controllers
- Service methods return typed responses
- Services can inject other services and models
- Keep methods single responsibility

## Validation
- Use Form Request classes for ALL validation
- authorize() method for permissions
- rules() method returns validation rules array
- Custom validation rules for complex logic

## API Resources
- Use Laravel Resources for API response transformation
- Use Resource Collections for lists
- Conditionally include relationships with ->whenLoaded
- Consistent response structure

## Database
- Migrations for ALL schema changes (never raw SQL)
- Seeders for development data
- Factories for test data generation
- N+1 prevention: use ->with() for eager loading
- Index foreign key columns

## Testing
- PHPUnit (built-in)
- Use Model factories for test data
- HTTP tests for API endpoints
- Database assertions: assertDatabaseHas, assertDatabaseMissing
- Feature tests for workflows
- Mock external services in tests

## Security
- CSRF protection enabled for web routes
- API authentication with Sanctum
- Authorization with Gates and Policies
- SQL injection prevention: use Eloquent/Query Builder only
- XSS protection with Blade escaping
