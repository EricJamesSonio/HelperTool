# Spring Boot Setup & Best Practices

## Project Initialization
- Use Spring Initializr (start.spring.io) or Spring Boot CLI
- Java 17+ or Kotlin
- Gradle (Kotlin DSL) or Maven
- Packaging: Jar

## Dependencies (starters)
- spring-boot-starter-web (REST API)
- spring-boot-starter-data-jpa (database)
- spring-boot-starter-validation
- spring-boot-starter-security
- spring-boot-starter-test

## Package Structure
com.project.app/
  config/           # @Configuration classes
  controller/       # REST controllers
  service/          # Business logic (interface + impl)
  repository/       # Spring Data JPA repositories
  model/
    entity/         # JPA entities
    dto/            # Request/Response DTOs
    enums/          # Enum types
  exception/        # Custom exceptions + handler
  mapper/           # Entity <-> DTO mappers
  util/             # Utility classes

## Controllers
- Use `@RestController`, not `@Controller` for APIs
- Version API: `@RequestMapping("/api/v1/resources")`
- Consistent naming: findAll, findById, create, update, delete
- Inject service interface, never implementation
- Use `@Valid` with DTOs for request validation

## Services
- Interface + Implementation pattern
- `@Transactional` on write operations
- Business logic in service layer only
- Throw custom exceptions for business rule violations
- Use `@Service` annotation

## JPA / Database
- Entity classes with `@Entity`, `@Table`
- Use `@ManyToOne`, `@OneToMany` relationships appropriately
- FetchType.LAZY by default, eager only when necessary
- Use Spring Data JPA derived queries for simple lookups
- `@Query` for complex queries
- Flyway or Liquibase for migrations

## Exception Handling
- `@RestControllerAdvice` global handler
- Custom exception classes extend RuntimeException
- Consistent error response: `{ status, message, timestamp, errors[] }`
- Map exceptions to correct HTTP status codes

## Security
- Spring Security with JWT for stateless auth
- SecurityConfig class with SecurityFilterChain bean
- Role-based access with `@PreAuthorize`
- Password hashing with BCryptPasswordEncoder

## Validation
- `@Valid` + `@Validated` on controller parameters
- Bean Validation annotations on DTO fields
- Custom validators for complex rules

## Testing
- JUnit 5 + Mockito
- `@WebMvcTest` for controller layer tests
- `@DataJpaTest` for repository tests
- `@SpringBootTest` for integration tests
- Testcontainers for database integration tests
