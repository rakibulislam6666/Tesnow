# TESNOW — মাস্টার ডেভেলপমেন্ট প্ল্যান

> প্রজেক্ট: Tesnow
> ডকুমেন্ট: Master Development Plan
> অবস্থা: ACTIVE
> Version: 1.0.0
> সর্বশেষ আপডেট: 2026-09-10

---

# ১. Tesnow-এর লক্ষ্য

Tesnow একটি Production-Grade, Secure, Maintainable এবং
High-Performance Web Application হিসেবে তৈরি করা হবে।

আমাদের প্রধান লক্ষ্য:

- শক্তিশালী Security
- High Performance
- নির্ভরযোগ্যতা
- Maintainability
- Scalability
- Testability
- পরিষ্কার Architecture
- পরিষ্কার Responsibility Separation
- ভবিষ্যতে নতুন Feature যোগ করার সুবিধা
- Backup ও Disaster Recovery
- ভালো Developer Documentation

শুধু সব Empty File পূরণ করাই আমাদের লক্ষ্য নয়।

আমাদের লক্ষ্য হলো একটি:

> নিরাপদ, দ্রুত, নির্ভরযোগ্য, পরীক্ষিত এবং দীর্ঘমেয়াদে
> Maintain করা যায়—এমন সম্পূর্ণ Application তৈরি করা।

---

# ২. আমাদের Development Philosophy

Tesnow-এর প্রতিটি কাজ এই Flow অনুসরণ করবে:

Audit
→ Design
→ Implement
→ Validate
→ Test
→ Security Review
→ Performance Review
→ Commit
→ Document
→ Next Task

কোনো বড় Uncontrolled Rewrite করা যাবে না।

কাজ করার সময় অপ্রয়োজনীয়ভাবে Existing File Delete করা যাবে না।

শুধু Code লেখা শেষ হলেই কোনো Feature-কে Final বলা যাবে না।

---

# ৩. মূল Architecture

Tesnow-এর প্রধান Application Flow:

Request
→ Route
→ Middleware
→ Controller
→ Validator
→ Service
→ Repository
→ Database

সহায়ক Flow:

Service
→ Queue / Worker

Service
→ Cache

Service
→ External Provider

Service
→ Event

---

# ৪. প্রতিটি Layer-এর দায়িত্ব

## Route

Route-এর কাজ:

- Endpoint নির্ধারণ করা
- Middleware যুক্ত করা
- Controller-এর সাথে Route যুক্ত করা

Route-এর মধ্যে Business Logic থাকবে না।

---

## Middleware

Middleware-এর কাজ হতে পারে:

- Authentication
- Authorization
- Validation
- Rate Limiting
- CSRF Protection
- Security Headers
- Request ID
- Timeout
- অন্যান্য Request-level Security

---

## Controller

Controller-এর কাজ:

Request
→ Input গ্রহণ
→ Validator
→ Service
→ Response

Controller-এর মধ্যে থাকবে না:

- SQL Query
- Database implementation
- Complex Business Logic
- Password Hashing
- Permission Calculation
- বড় Data Processing Logic

Controller পাতলা (Thin) রাখা হবে।

---

## Validator

Validator-এর কাজ:

- Required Field যাচাই
- Data Type যাচাই
- Format যাচাই
- Length যাচাই
- Range যাচাই
- Allowed Value যাচাই
- প্রয়োজন অনুযায়ী Cross-field Validation

Validator-এর মধ্যে অপ্রয়োজনীয় Business Logic থাকবে না।

---

## Service

Service হলো Business Logic-এর প্রধান Layer।

Service-এর কাজ:

- Business Rules
- Application Workflow
- Domain Logic
- একাধিক Repository সমন্বয়
- Security-sensitive Application Decision
- External Provider সমন্বয়
- Transaction Workflow

---

## Repository

Repository-এর প্রধান কাজ:

- Database Access
- SQL Query
- Insert
- Update
- Delete
- Select
- Transaction-related Database Operation
- Database-specific Error Handling

Repository-এর মধ্যে Application-এর Complex Business Logic রাখা যাবে না।

---

## Database

Database-এর দায়িত্ব:

- Data Persistence
- Primary Key
- Foreign Key
- Unique Constraint
- NOT NULL Constraint
- Index
- Database-level Integrity

Application এবং Database-এর মধ্যে Contract পরিষ্কার থাকতে হবে।

---

# ৫. Development-এর প্রধান নিয়ম

## নিয়ম ১ — Existing Code আগে দেখতে হবে

কোনো নতুন File বা Feature তৈরি করার আগে সম্পর্কিত Existing Code পরীক্ষা করতে হবে।

বিশেষ করে:

- Model
- Repository
- Service
- Validator
- Controller
- Route
- Database Migration
- Schema
- Configuration
- Test

আগে দেখতে হবে।

Existing ভালো Code অপ্রয়োজনীয়ভাবে Rewrite করা যাবে না।

---

# ৬. একবারে ছোট Scope

একসাথে অনেক File Implement করা হবে না।

সাধারণ Preferred Flow:

একটি File
→ Syntax Check
→ Review
→ Test
→ Security Check
→ Commit

যদি কয়েকটি File খুব ঘনিষ্ঠভাবে একে অপরের উপর নির্ভরশীল হয়:

ছোট Module
→ Integration Test
→ Security Review
→ Commit

---

# ৭. Database-এর নিয়ম

Database-backed কোনো Feature তৈরি করার আগে যাচাই করতে হবে:

- Migration
- Schema
- Table
- Column
- Primary Key
- Foreign Key
- Unique Constraint
- NOT NULL
- Default Value
- Index
- Relationship

Database Schema অপ্রয়োজনীয়ভাবে পরিবর্তন করা যাবে না।

---

# ৮. Security-by-Design

Security শুধু Project-এর শেষে যোগ করা হবে না।

প্রতিটি Feature তৈরির সময় থেকেই Security বিবেচনা করতে হবে।

Tesnow-এ প্রয়োজন অনুযায়ী নিচের Threat মোকাবিলা করা হবে:

- SQL Injection
- XSS
- CSRF
- IDOR
- Broken Access Control
- Authentication Bypass
- Session Attack
- Brute Force
- Credential Stuffing
- Rate-limit Abuse
- Path Traversal
- Unsafe File Upload
- SSRF যেখানে প্রযোজ্য
- Security Misconfiguration
- Sensitive Information Leakage
- Webhook Forgery
- API Abuse
- Log Injection
- Secret Leakage

প্রতিটি Security Control Feature-এর প্রকৃত প্রয়োজন অনুযায়ী ব্যবহার করতে হবে।

অপ্রয়োজনীয় Security Mechanism যোগ করে Application জটিল করা যাবে না।

---

# ৯. Authentication Security

Authentication System-এ প্রয়োজন অনুযায়ী:

- নিরাপদ Password Hashing
- Password Policy
- Secure Session
- Session Rotation
- Session Expiration
- Session Invalidation
- Login Rate Limiting
- Brute-force Protection
- Account Protection
- Password Reset Security
- Email Verification
- 2FA-এর জন্য ভবিষ্যৎ Support
- Security Event Logging

ব্যবহার করা হবে।

কোনো Password বা Secret কখনো Log করা যাবে না।

---

# ১০. Authorization Security

Authorization-এর জন্য প্রয়োজন অনুযায়ী:

- RBAC
- Permission System
- Resource Ownership Check
- Admin Authorization
- ABAC যেখানে প্রয়োজন
- IDOR Protection

ব্যবহার করা হবে।

শুধু Frontend-এর উপর Authorization নির্ভর করা যাবে না।

Authorization অবশ্যই Server-side enforce করতে হবে।

---

# ১১. API Security

API তৈরি করার সময়:

- Authentication
- Authorization
- Input Validation
- Rate Limiting
- Request Size Limit
- Timeout
- Secure Error Response
- API Versioning
- API Key Security
- Webhook Signature Verification

প্রয়োজন অনুযায়ী ব্যবহার করা হবে।

---

# ১২. File Upload Security

Upload Feature তৈরি হলে:

- File Size Limit
- MIME Type Validation
- Extension Validation
- Filename Sanitization
- Path Traversal Protection
- Upload Quarantine
- Metadata Handling
- Image Validation
- Safe Storage
- Access Control

ব্যবহার করা হবে।

User-provided filename সরাসরি File Path হিসেবে ব্যবহার করা যাবে না।

---

# ১৩. Logging Security

Log-এ কখনো সরাসরি রাখা যাবে না:

- Password
- Session Secret
- API Secret
- Access Token
- Refresh Token
- Database Password
- Encryption Key
- অন্যান্য Sensitive Credential

Sensitive User Data-ও প্রয়োজন ছাড়া Log করা যাবে না।

Error Log এবং User-facing Error Message আলাদা রাখতে হবে।

---

# ১৪. Error Handling

Application Error এবং Programmer/Fatal Error আলাদা করতে হবে।

User-এর কাছে নিরাপদ Error Message যাবে।

Production Response-এ কখনো সরাসরি:

- SQL Error
- Stack Trace
- Database Details
- Internal File Path
- Secret
- Internal Configuration

দেখানো যাবে না।

Internal বিস্তারিত তথ্য শুধুমাত্র নিরাপদ Logging-এর মাধ্যমে সংরক্ষণ করা যাবে।

---

# ১৫. Performance লক্ষ্য

Tesnow-কে High-Performance করার জন্য:

- Efficient Database Query
- Proper Database Index
- Connection Pooling
- Pagination
- Cursor Pagination যেখানে উপযুক্ত
- Caching
- Proper Cache Invalidation
- Background Jobs
- Queue Workers
- Efficient Serialization
- Static Asset Caching
- Compression যেখানে উপযুক্ত
- N+1 Query Prevention
- Request Timeout
- Resource Limit

ব্যবহার করা হবে।

তবে:

> Performance-এর নামে Security বা Correctness নষ্ট করা যাবে না।

এবং:

> মাপার আগে অপ্রয়োজনীয় Optimization করা যাবে না।

---

# ১৬. Testing Strategy

প্রতিটি গুরুত্বপূর্ণ Feature-এর জন্য Testing থাকবে।

## Unit Test

ব্যবহার করা হবে:

- Service
- Validator
- Helper
- Business Rule
- Security Utility

এর জন্য।

---

## Integration Test

ব্যবহার করা হবে:

- Repository
- Database Interaction
- Service + Repository
- Authentication Flow
- API Endpoint

এর জন্য।

---

## Security Test

পরীক্ষা করা হবে:

- Authentication
- Authorization
- Input Validation
- Rate Limiting
- Session Security
- Access Control
- Malicious Input
- Upload Security

---

## Regression Test

কোনো গুরুত্বপূর্ণ Bug Fix করার পর সম্ভব হলে সেই Bug-এর জন্য Regression Test যোগ করতে হবে।

---

# ১৭. Git Strategy

প্রতিটি গুরুত্বপূর্ণ Milestone-এর পরে Git Commit করতে হবে।

Commit করার আগে:

- Code Check
- Syntax Check
- Test
- Security Review

যতটা সম্ভব সম্পন্ন করতে হবে।

Commit Message পরিষ্কার হতে হবে।

উদাহরণ:

feat: implement user authentication

fix: prevent unauthorized post access

security: harden session validation

refactor: simplify repository error handling

---

# ১৮. DeepSeek ব্যবহারের নিয়ম

DeepSeek Tesnow-এর Code Generator হিসেবে ব্যবহার করা হবে।

কিন্তু DeepSeek সরাসরি Local Project দেখতে বা পরিবর্তন করতে পারে না।

তাই তাকে কখনো বলা যাবে না:

"আমার Local Project inspect করো।"

বরং প্রয়োজনীয় File-এর Content তাকে দিতে হবে।

DeepSeek-কে:

- Existing Architecture অনুসরণ করতে হবে
- Existing File অপ্রয়োজনীয়ভাবে Delete করা যাবে না
- Unrelated File পরিবর্তন করা যাবে না
- Duplicate Functionality তৈরি করা যাবে না
- অপ্রয়োজনীয় Dependency যোগ করা যাবে না
- Placeholder রাখা যাবে না
- অসম্পূর্ণ Code দেওয়া যাবে না
- Exact File Path দিতে হবে
- Complete Copy-paste-ready Code দিতে হবে
- Security Requirements মানতে হবে
- Performance Requirements মানতে হবে

---

# ১৯. Chat-independent Development

Tesnow-এর Development কোনো Chat-এর উপর নির্ভরশীল হবে না।

Project-এর ভিতরের Development Documentation-ই হবে প্রধান Development Memory।

প্রধান Tracking File:

docs/development/

এর মধ্যে থাকবে:

- MASTER-PLAN.md
- CURRENT-STATUS.md
- DECISIONS.md
- CHANGELOG.md
- NEXT-TASK.md

নতুন Chat শুরু হলেও এই File-গুলো দেখে Development Continue করা যাবে।

---

# ২০. Development Status System

প্রতিটি Feature/File-এর Status নিচের মতো হবে:

[ ] Planned

[D] Draft

[I] Implemented

[R] Reviewed

[T] Tested

[S] Security Reviewed

[P] Performance Reviewed

[F] Final

একটি Feature শুধু Code লেখা শেষ হলেই [F] হবে না।

Final করার আগে প্রয়োজনীয় Review এবং Test সম্পন্ন করতে হবে।

---

# ২১. প্রধান Development Phases

## PHASE 0 — Project Safety

কাজ:

- Git Status
- Git Branch
- Existing Commit Review
- Environment Safety
- Baseline Checkpoint
- Backup Strategy

অবস্থা:

IN PROGRESS

---

## PHASE 1 — Architecture Audit

কাজ:

- package.json
- server.js
- app/core
- app/config
- database
- existing repositories
- existing services
- existing middleware
- existing controllers

পরীক্ষা করা।

---

## PHASE 2 — Standards Lock

কাজ:

- Naming
- Error Handling
- Logging
- Import Order
- JSDoc
- File Writing
- Security Rules
- Testing Rules

Final করা।

---

## PHASE 3 — Core Foundation

Priority:

1. errors.js
2. logger.js
3. request-context.js
4. response.js
5. container.js
6. transactions.js
7. shutdown.js
8. app.js

---

## PHASE 4 — Database Contract

কাজ:

- Existing migrations audit
- Schema audit
- Index audit
- Constraint audit
- Repository compatibility

---

## PHASE 5 — Authentication

প্রথম বড় Vertical Slice:

User
→ Model
→ Repository
→ Validator
→ Service
→ Middleware
→ Controller
→ Route
→ Test

---

## PHASE 6 — RBAC

কাজ:

- User
- Role
- Permission
- Authorization
- Admin Access

---

## PHASE 7 — User Management

কাজ:

- Profile
- User Management
- Suspension
- Moderation
- Data Rights

---

## PHASE 8 — Content Management

কাজ:

- Category
- Tag
- Post
- Revision
- Draft
- Preview
- Publish
- Schedule
- Slug
- Redirect

---

## PHASE 9 — Interaction

কাজ:

- Comment
- Like
- Bookmark
- Report
- Moderation

---

## PHASE 10 — Media

কাজ:

- Upload
- Quarantine
- Validation
- Metadata
- Optimization
- Thumbnail
- Storage
- Cleanup

---

## PHASE 11 — Admin

কাজ:

- Dashboard
- Posts
- Users
- Roles
- Permissions
- Comments
- Media
- Analytics
- Audit Logs
- Security
- Settings

---

## PHASE 12 — Public Frontend

কাজ:

- Home
- Post
- Category
- Tag
- Search
- Author
- Contact
- Legal
- Authentication Pages

---

## PHASE 13 — API

কাজ:

- API Versioning
- Authentication
- Users
- Posts
- Comments
- Media
- Admin
- Webhooks
- OpenAPI

---

## PHASE 14 — Jobs & Queues

কাজ:

- Email Worker
- Image Worker
- Search Worker
- Notification Worker
- Analytics Worker
- Backup Worker
- Cleanup Worker
- Sitemap Worker

---

## PHASE 15 — Search / SEO / Analytics

কাজ:

- Search
- Indexing
- Suggestions
- SEO
- Sitemap
- Redirects
- Analytics
- Traffic
- View Counter

---

## PHASE 16 — Testing

কাজ:

- Unit Tests
- Integration Tests
- API Tests
- Security Tests
- Regression Tests
- Failure Tests

---

## PHASE 17 — Security Audit

সম্পূর্ণ Application Audit:

- Authentication
- Authorization
- RBAC
- CSRF
- XSS
- SQL Injection
- Session Security
- Rate Limiting
- File Upload
- IDOR
- CORS
- Security Headers
- Secrets
- Logging
- Error Leakage
- Webhooks
- API Security
- Backup Security

---

## PHASE 18 — Performance Audit

পরীক্ষা:

- Database Query
- Index
- Cache
- Memory
- CPU
- Response Time
- N+1
- Connection Pool
- Queue
- Static Assets

Performance Bottleneck মাপার পরে Optimization করা হবে।

---

## PHASE 19 — Backup & Disaster Recovery

কাজ:

- Database Backup
- Backup Verification
- Restore
- Integrity Check
- Recovery Procedure
- Rollback

---

## PHASE 20 — Production Hardening

কাজ:

- Production Environment
- HTTPS
- Secure Configuration
- Process Management
- Database
- Cache
- Queue
- Monitoring
- Logging
- Backup
- Rollback

---

## PHASE 21 — Documentation

শেষে এবং প্রয়োজন অনুযায়ী:

- Architecture Documentation
- API Documentation
- Database Documentation
- Security Documentation
- Deployment Documentation
- Admin Manual
- Developer Setup
- Disaster Recovery
- Changelog

Update করা হবে।

---

# ২২. Vertical Slice Strategy

প্রতিটি বড় Feature যতটা সম্ভব End-to-End তৈরি করা হবে।

উদাহরণ:

Authentication:

Database
→ Model
→ Repository
→ Validator
→ Service
→ Middleware
→ Controller
→ Route
→ Frontend
→ Test
→ Security Review

একটি Vertical Slice সফলভাবে সম্পন্ন হওয়ার পরে
তার Architecture Pattern পরবর্তী Feature-এ ব্যবহার করা হবে।

---

# ২৩. Empty File Strategy

Tesnow-এর Empty File মানেই সেটি এখনই পূরণ করতে হবে—এমন নয়।

Empty File তিন ধরনের হতে পারে:

1. এখন প্রয়োজনীয়
2. ভবিষ্যতে প্রয়োজনীয়
3. Documentation/UI/Placeholder

তাই Empty File সংখ্যা দিয়ে Project Completion মাপা হবে না।

---

# ২৪. Completion Definition

কোনো Feature তখনই সম্পূর্ণ হিসেবে বিবেচিত হবে যখন:

- Code Implemented
- Architecture Reviewed
- Syntax Valid
- Integration Valid
- Tests Passed
- Security Reviewed
- Performance Considered
- Documentation Updated যেখানে প্রয়োজন
- Git Commit Created

---

# ২৫. প্রধান নীতি

Tesnow-এর Development-এর সবচেয়ে গুরুত্বপূর্ণ নীতি:

> দ্রুত অনেক Code লেখা নয়।

> সঠিক Architecture-এর মধ্যে ধাপে ধাপে
> নিরাপদ এবং পরীক্ষিত Code তৈরি করা।

---

# ২৬. বর্তমান অবস্থা

Project:

Tesnow

Development Strategy:

One Step at a Time

Current Focus:

Project Safety + Architecture Audit

Current Phase:

PHASE 0

Next Major Phase:

PHASE 1 — Architecture Audit

---

# ২৭. Final Development Rule

কোনো কাজ করার আগে তিনটি প্রশ্ন:

1. Existing Code-এর সাথে এটি কীভাবে যুক্ত?
2. এটি Security এবং Performance-কে কীভাবে প্রভাবিত করবে?
3. এটি Test এবং Future Maintenance-এর জন্য কীভাবে রাখা হবে?

এই তিনটির উত্তর পরিষ্কার না হলে Implementation শুরু করা যাবে না।

---

END OF MASTER PLAN