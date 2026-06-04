# Version 13.0.0 — Database Inspector & Visual Schema Explorer

**Start Date:** June 1, 2026
**End Date:** June 4, 2026

## Overview

Version 13 introduces a powerful new **Database Inspector** system designed to simplify database exploration, querying, and schema visualization.

This update focuses on:

* Visual database schema exploration
* React Flow-powered table relationship graphs
* Direct database querying
* Improved database navigation
* Faster schema inspection workflows
* Better database management tooling

The goal of this version is to provide developers with a centralized environment for understanding, exploring, and managing databases without needing to switch between multiple external tools.

---

# New Features

## Database Inspector (13.0.0)

Version 13 introduces the new **Database Inspector**.

The Database Inspector allows users to connect directly to supported databases and inspect their structure from within the application.

Users can now:

* Connect to databases
* View database tables
* Explore table structures
* Inspect columns and relationships
* Visualize schemas
* Execute SQL queries
* Navigate large databases more efficiently

The feature is designed to reduce dependency on external database management tools during development workflows.

Supported use cases include:

* Schema exploration
* Database auditing
* Development debugging
* Relationship analysis
* Query testing
* Table inspection
* Project onboarding

The Database Inspector provides a centralized view of database architecture for faster understanding of complex systems.

---

## Visual Schema Explorer (13.0.0)

Version 13 introduces a new **Visual Schema Explorer** powered by React Flow.

The Visual Schema Explorer automatically converts database schemas into interactive relationship graphs.

Users can now:

* View tables as nodes
* Visualize foreign key relationships
* Explore connected entities
* Navigate large schemas visually
* Understand database structures faster
* Inspect relationship mappings

The graph view helps developers quickly understand how data flows across a database without manually inspecting individual tables.

Key capabilities include:

* Interactive node navigation
* Relationship visualization
* Automatic schema mapping
* Expandable table nodes
* Improved database comprehension
* Faster architecture discovery

This significantly improves onboarding and maintenance workflows for larger systems.

---

## Query Tool (13.0.0)

Version 13 adds an integrated **Query Tool**.

The Query Tool enables direct database interaction from within the application.

Users can now:

* Execute SQL queries
* View query results
* Inspect returned data
* Validate database changes
* Test queries during development
* Explore datasets faster

The feature streamlines database debugging and reduces context switching between development tools.

Example workflow:

1. Connect database
2. Open Query Tool
3. Execute query
4. Review results
5. Continue development

This provides a lightweight database interaction experience directly inside the platform.

---

# Improvements

## Database Navigation Improvements (13.0.1)

Database browsing has been improved to provide a smoother inspection experience.

Enhancements include:

* Faster table loading
* Improved schema retrieval
* Better table organization
* Cleaner relationship rendering
* Improved large-schema handling
* Faster metadata inspection

These improvements help maintain responsiveness when working with larger databases.

---

# Workflow Improvements

Version 13 improves database-related development workflows.

Key workflow improvements include:

* Reduced dependency on external database tools
* Faster schema understanding
* Improved onboarding for existing projects
* Easier relationship discovery
* Faster query testing
* Better database debugging
* Simplified architecture exploration
* More efficient development workflows

---

# Performance Notes

The Database Inspector uses optimized schema retrieval to minimize unnecessary database requests.

Visual Schema Explorer efficiently renders relationships while maintaining responsiveness for larger database structures.

Query execution and result handling have been optimized to improve interaction speed during active development sessions.

---

# Compatibility

Version 13 remains fully compatible with existing workspace tools, repositories, and development workflows.

The Database Inspector integrates directly into the current architecture without requiring database migrations or structural modifications.

Visual Schema Explorer and Query Tool functionality operate alongside existing systems while preserving compatibility with supported database configurations.
