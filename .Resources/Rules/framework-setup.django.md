# Django Setup & Best Practices

## Project Initialization
- Use `django-admin startproject` then `python manage.py startapp`
- Use Python 3.11+
- Use Poetry for dependency management
- Use django-environ for environment variables

## Folder Structure
project/
  apps/
    accounts/      # User auth app
    core/          # Shared models, utils, mixins
    api/           # REST API (Django REST Framework)
    web/           # Template-based views (if any)
  config/
    settings/      # Split settings (base, dev, prod)
    urls.py
    wsgi.py
  static/
  templates/
  tests/

## Django Apps
- One app per domain concept
- Keep apps loosely coupled
- Each app has its own models, views, serializers, urls, tests
- App name is short singular noun

## Models
- Use UUIDField as primary key for all models
- Add created_at / updated_at timestamp fields via abstract base model
- Use related_name explicitly on ForeignKey fields
- Add db_index on fields used in filters/ordering
- Keep business logic in model methods, not views

## Views & APIs
- Use Django REST Framework (DRF) for all APIs
- Use ViewSets + ModelSerializers for CRUD endpoints
- Use generics (ListCreateAPIView, RetrieveUpdateDestroyAPIView)
- Keep views thin — business logic in services or model methods
- Use permissions classes for access control

## Serializers
- One serializer per model per action (CreateSerializer, ListSerializer, DetailSerializer)
- Use SerializerMethodField sparingly
- Validation logic in serializer validate_ methods
- Nested serializers for read, flat IDs for write

## URL Routing
- Use DefaultRouter for ViewSets
- Namespace all URLs
- Version API: `/api/v1/`

## Settings
- Base settings shared, dev/prod override specific values
- SECRET_KEY, DB credentials from environment
- DEBUG = False in production
- CORS configured per environment

## Testing
- pytest + pytest-django
- Test models (methods, constraints)
- Test API endpoints (status codes, response shape)
- Test edge cases and error paths
- Use factories (factory_boy) for test data

## Performance
- Use select_related / prefetch_related for related data
- Add pagination to all list endpoints
- Database query optimization with django-debug-toolbar
- Use Redis for caching where appropriate
