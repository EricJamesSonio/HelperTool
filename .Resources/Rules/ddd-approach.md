AI CODEBASE EXECUTION BLUEPRINT
(DDD + Clean + Hexagonal + Vertical Slice)

GOAL:
Build scalable, maintainable systems using strict structure and flow.

---

0. GLOBAL RULES (ALWAYS FOLLOW)

- Never mix layers
- Never skip validation
- Never leak infrastructure into domain
- Prefer small, isolated units
- Each feature = independent slice

---

1. START WITH DOMAIN (NOT CODE)

STEP:

- Identify core business concepts (Entities)
- Define rules (Invariants)
- Define relationships (Aggregates)
- Define important values (Value Objects)

OUTPUT:

- entity.ts
- value-object.ts
- domain rules inside entities

RULE:
Domain = pure logic, no frameworks, no DB

---

2. DEFINE USE CASES (APPLICATION LAYER)

STEP:
For each feature:

- Define a Command (write)
- Define a Query (read)

OUTPUT:

- create-user.command.ts
- get-user.query.ts

RULE:
Commands = change state  
Queries = read only

---

3. CREATE APPLICATION SERVICE (ORCHESTRATOR)

STEP:

- Take Command/Query
- Call domain logic
- Use ports for external actions

OUTPUT:

- create-user.service.ts

RULE:
Service = orchestration ONLY (no business logic)

FLOW:
DTO → Command → Service → Domain → Port → Return

---

4. DEFINE PORTS (INTERFACES)

STEP:

- Identify external needs:
  - DB
  - APIs
  - Email
- Create interfaces

OUTPUT:

- user.repository.port.ts
- email.service.port.ts

RULE:
Ports define WHAT, not HOW

---

5. BUILD DOMAIN LOGIC (CORE)

STEP:

- Implement logic inside Entities
- Enforce invariants
- Use methods, not setters

OUTPUT:

- user.entity.ts

RULE:
Entity controls its own state

BAD:
user.name = "x"

GOOD:
user.updateName("x")

---

6. HANDLE SIDE EFFECTS VIA ADAPTERS (INFRASTRUCTURE)

STEP:

- Implement ports
- Connect to DB / APIs

OUTPUT:

- user.repository.ts
- email.service.ts

RULE:
Adapters = implementation only  
Never used directly by domain

---

7. CREATE CONTROLLERS (ENTRY POINT)

STEP:

- Accept input (DTO)
- Validate input
- Convert → Command/Query
- Call service

OUTPUT:

- create-user.controller.ts
- create-user.request.dto.ts

RULE:
Controller = translation layer ONLY

---

8. VALIDATION SYSTEM

LAYERED DEFENSE:

1. DTO Validation (external input)
2. Domain Guard (internal truth)

RULE:
Invalid input → reject early  
Invalid domain state → throw error

---

9. ERROR HANDLING MODEL

STEP:

- Define domain errors
- Return Result type (Ok / Err)

OUTPUT:

- user.errors.ts

RULE:
Expected errors → return  
Unexpected errors → throw

---

10. MODULE STRUCTURE (VERTICAL SLICE)

STRUCTURE:

/modules/user/
/create-user/
create-user.controller.ts
create-user.service.ts
create-user.command.ts
create-user.dto.ts

user.entity.ts
user.repository.port.ts

RULE:
Group by FEATURE, not by TYPE

---

11. DATA FLOW (STRICT)

FLOW:

Request
→ DTO
→ Command/Query
→ Service
→ Domain
→ Port
→ Adapter (DB/API)
→ Response DTO
→ Response

RULE:
One direction only (no shortcuts)

---

12. EVENTS (FOR DECOUPLING)

USE WHEN:

- Multiple things happen after one action

FLOW:
Command → Domain Event → Handlers

RULE:
Avoid chaining commands directly

---

13. TESTING STRATEGY

TEST:

- Domain (pure logic)
- Services (use cases)
- End-to-end flows

RULE:
Test behavior, not implementation

---

14. REFACTOR LOOP

PROCESS:

1. Make it work
2. Make it clean
3. Make it scalable

RULE:
Refactor continuously

---

15. AI EXECUTION LOOP (IMPORTANT)

FOR EVERY FEATURE:

1. Identify domain concept
2. Create entity/value objects
3. Define command/query
4. Build service
5. Define ports
6. Implement adapters
7. Add controller
8. Validate input
9. Handle errors
10. Test

---

FINAL META-RULE:

DO NOT:

- Mix responsibilities
- Skip layers
- Overcomplicate early

DO:

- Start simple
- Add complexity only when needed
- Keep boundaries strict

---

SYSTEM MINDSET:

You are not writing code.
You are assembling independent, replaceable units.
