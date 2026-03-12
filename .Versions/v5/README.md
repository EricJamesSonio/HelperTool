# Version 5

**Start Date:** March 10, 2026  
**End Date:** March 12, 2026

## Overview

Version 5 introduces the start of a **Tool Section** inside the application.  
This section allows new developer utilities to be integrated without affecting the main workflow.

The first tool added is the **API Tool**, a lightweight utility for interacting with APIs directly inside the application. It is designed to provide a fast and simple way to test endpoints without relying on external tools.

This version also introduces **automatic endpoint importing from OpenAPI/Swagger specifications**.

---

## New Features

### Tool Section

A new **Tool Section** has been added to the interface.  
This section acts as a central place where additional tools will be integrated in future updates.

---

### API Tool

The **API Tool** allows users to send HTTP requests and interact with APIs directly inside the application.

Supported request methods include:

- GET  
- POST  
- PUT  
- PATCH  
- DELETE  
- HEAD  

---

### API Project Management

Users can create **API projects** to organize endpoints.

Each project contains:

- API name  
- Base URL  
- Endpoint list  

---

### OpenAPI / Swagger Import

The API Tool can **import OpenAPI or Swagger specifications**.

When a specification is provided, the tool automatically:

- Reads the API definition  
- Extracts available endpoints  
- Registers them inside the API project  

---

## Compatibility

The API Tool works with **any backend framework** because it sends standard HTTP requests using `fetch()`.

Examples include:

**JavaScript / Node.js**

- Express  
- Fastify  
- Hono  
- NestJS  
- Koa  

**Python**

- FastAPI  
- Django  
- Flask  

**Go**

- Gin  
- Echo  
- Fiber  

**Other Frameworks**

- Spring Boot  
- ASP.NET Core  
- Laravel  
- Rails  
- Axum  

Any backend that exposes **HTTP endpoints** can be used.

---

## Limitations

**CORS**

Requests may be blocked if the backend does not allow the application's origin.

Example development header:
