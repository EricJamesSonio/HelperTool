# Ruby on Rails Setup & Best Practices

## Project Initialization
- Use `rails new project-name --api --database=postgresql`
- Ruby 3.2+
- Skip test-unit: add --skip-test (use RSpec instead)
- Use `rails new` with --api for API-only apps

## Folder Structure
app/
  controllers/       # Controllers (inherit ApplicationController)
  models/            # ActiveRecord models
  services/          # Business logic (app/services/)
  serializers/       # JSON serialization (blueprinter or alba)
  policies/          # Authorization policies (Pundit)
  queries/           # Query objects for complex queries
  forms/             # Form objects for validation
  mailers/           # Mailer classes
config/
  routes.rb          # Route definitions
db/
  migrate/           # Schema migrations
  seeds.rb           # Seed data

## Controllers
- RESTful resource controllers with 7 default actions
- Keep controllers thin: delegate to services/interactors
- Use `before_action` for shared setup (set_resource)
- Strong parameters for mass assignment protection
- Version API in routes or headers

## Models / ActiveRecord
- Keep models thin: validations, associations, scopes
- Business logic in service objects, not model callbacks
- Use `has_many :through` for many-to-many relationships
- Prefer `has_secure_password` over custom auth
- Use enums for status fields
- Add database-level constraints alongside model validations

## Services / Interactors
- One service class per use case
- Service call convention: `MyService.call(params)`
- Return ServiceResult object with success/data/error
- Services can call other services
- Keep services stateless

## Routing
- Use `resources :model` for standard REST routes
- Nest routes only 1 level deep
- Use `namespace :v1` for API versioning
- Use `member` and `collection` for custom actions sparingly

## Database
- Add NOT NULL constraints at database level
- Index foreign keys and frequently queried columns
- Use `add_reference` for belongs_to associations
- Use `change_table` for modifying existing tables
- Avoid callbacks that perform side effects (move to services)

## Serialization
- Use Blueprinter or Alba for JSON serialization
- Define explicit attributes per serializer
- Conditionally include associations
- Keep serialization logic out of models

## Testing
- RSpec + FactoryBot + Faker
- Model specs: validations, associations, scopes
- Request specs for API endpoint testing
- Service specs with mocked dependencies
- Use `let` and `let!` for test data
- Use `before(:context)` / `before(:each)` appropriately

## Performance
- Add `includes` for eager loading (N+1 prevention)
- Use `find_each` for batch processing
- Add database indexes for WHERE/ORDER BY columns
- Use fragment caching for expensive views
- Background jobs (Sidekiq) for heavy tasks
