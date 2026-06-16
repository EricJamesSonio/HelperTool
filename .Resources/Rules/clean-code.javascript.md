AI CLEAN CODE BLUEPRINT

CORE PRINCIPLE:
Write code for humans first, machines second.
Optimize for readability, simplicity, and maintainability.

---

1. NAMING

- Use clear, meaningful, pronounceable names
- Be consistent with vocabulary (one concept = one name)
- Avoid abbreviations and mental mapping
- Prefer explicit over implicit
- Use constants instead of magic numbers

RULE:
If a name needs a comment → rename it

---

2. FUNCTIONS

- Do ONE thing only
- Keep them small
- Max 2 parameters (use objects if needed)
- Function name must describe EXACT behavior
- Avoid boolean flags (split functions instead)
- Avoid side effects (pure functions preferred)

RULE:
If you need “and” in description → split function

---

3. STRUCTURE & ABSTRACTION

- One level of abstraction per function
- Extract repeated logic (DRY)
- Prefer composition over inheritance
- Encapsulate conditionals
- Avoid deep nesting

RULE:
Each layer should read like a story

---

4. DATA HANDLING

- Avoid mutating shared state
- Prefer immutable patterns (return new values)
- Encapsulate internal data (use getters/setters when needed)
- Don’t expose raw data unnecessarily

RULE:
Data should be controlled, not freely modified

---

5. SIDE EFFECTS

- Minimize and isolate side effects
- Never modify globals
- Centralize I/O (API calls, DB, file writes)

RULE:
Pure logic separate from side effects

---

6. CONDITION LOGIC

- Avoid complex conditionals
- Avoid negative conditions
- Replace conditionals with polymorphism when possible

RULE:
If logic branches too much → redesign structure

---

7. ERROR HANDLING

- Never ignore errors
- Always handle or propagate properly
- Prefer clear failure paths over silent failures

RULE:
Every possible failure must have a response

---

8. CLASSES & DESIGN

- Follow SOLID principles:
  - S: One responsibility per class
  - O: Extend without modifying existing code
  - L: Subtypes must behave correctly
  - I: Avoid forcing unused dependencies
  - D: Depend on abstractions, not concrete implementations

RULE:
Classes should be small, focused, and replaceable

---

9. TESTING

- Test every feature
- One concept per test
- Tests must be readable and predictable

RULE:
If it’s not tested, it’s not reliable

---

10. ASYNC & FLOW

- Prefer async/await over callbacks
- Avoid nested chains
- Keep async logic readable

RULE:
Async code should look synchronous

---

11. FORMATTING

- Be consistent
- Group related logic together
- Keep caller above callee
- Use automated formatting tools

RULE:
Code layout should guide reading naturally

---

12. COMMENTS

- Avoid unnecessary comments
- Only explain WHY, not WHAT
- Remove dead/commented code

RULE:
Good code explains itself

---

13. SIMPLICITY

- Avoid over-engineering
- Don’t optimize prematurely
- Remove dead code

RULE:
Simpler > smarter

---

FINAL META-RULE:
Continuously refactor.
First draft = working code
Final draft = clean code
