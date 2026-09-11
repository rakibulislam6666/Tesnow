# TESNOW — ARCHITECTURE & TECHNICAL DECISIONS

> প্রজেক্ট: Tesnow
> ডকুমেন্ট: Architecture & Technical Decisions
> অবস্থা: ACTIVE
> Version: 1.0.0
> সর্বশেষ আপডেট: 2026-09-10
>
> এই ফাইলে Tesnow-এর গুরুত্বপূর্ণ Architecture, Security,
> Performance এবং Development Decision সংরক্ষণ করা হবে।
>
> কোনো গুরুত্বপূর্ণ সিদ্ধান্ত শুধুমাত্র Chat-এর মধ্যে রাখা যাবে না।
> সিদ্ধান্ত Final হলে এখানে সংরক্ষণ করতে হবে।

---

# ১. এই ফাইলের উদ্দেশ্য

এই ফাইলের প্রধান উদ্দেশ্য:

- কেন একটি Architecture বেছে নেওয়া হয়েছে
- কেন একটি Technology ব্যবহার করা হয়েছে
- কেন একটি Security Control যোগ করা হয়েছে
- কেন কোনো Approach বাতিল করা হয়েছে
- ভবিষ্যতে কোনো Developer যেন পুরোনো সিদ্ধান্ত বুঝতে পারে
- নতুন Chat শুরু হলেও Technical Context যেন হারিয়ে না যায়
- একই সমস্যার জন্য বারবার নতুন সিদ্ধান্ত নিতে না হয়

---

# ২. Decision Status

প্রতিটি Decision-এর Status:

PROPOSED
→ সিদ্ধান্ত প্রস্তাব করা হয়েছে।

REVIEWING
→ সিদ্ধান্ত যাচাই করা হচ্ছে।

ACCEPTED
→ সিদ্ধান্ত গ্রহণ করা হয়েছে।

IMPLEMENTED
→ Code-এ বাস্তবায়ন করা হয়েছে।

SUPERSEDED
→ নতুন সিদ্ধান্ত পুরোনো সিদ্ধান্তকে প্রতিস্থাপন করেছে।

REJECTED
→ সিদ্ধান্ত গ্রহণ করা হয়নি।

---

# ৩. Decision Format

প্রতিটি গুরুত্বপূর্ণ সিদ্ধান্ত নিচের Format অনুসরণ করবে:

## DECISION-XXX — শিরোনাম

তারিখ:

Status:

Context:

সমস্যা কী ছিল?

Decision:

আমরা কী সিদ্ধান্ত নিয়েছি?

Reason:

কেন এই সিদ্ধান্ত নেওয়া হয়েছে?

Alternatives:

অন্য কোন Approach বিবেচনা করা হয়েছিল?

Security Impact:

Security-এর উপর প্রভাব কী?

Performance Impact:

Performance-এর উপর প্রভাব কী?

Maintainability Impact:

Future Maintenance-এর উপর প্রভাব কী?

Implementation:

কোন File/Module-এ এটি বাস্তবায়ন হবে?

Related:

কোন অন্য Decision বা Documentation-এর সাথে সম্পর্কিত?

---

# ৪. Core Architecture Decisions

## DECISION-001 — Layered Application Architecture

তারিখ:

2026-09-10

Status:

ACCEPTED

Context:

Tesnow একটি বড় Application হিসেবে তৈরি হচ্ছে।

একই File-এর মধ্যে Route, Database Query, Business Logic,
Authentication এবং Response Logic রাখলে ভবিষ্যতে Application
Maintain করা কঠিন হবে।

Decision:

Tesnow Layered Architecture অনুসরণ করবে।

প্রধান Flow:

Request
→ Route
→ Middleware
→ Controller
→ Validator
→ Service
→ Repository
→ Database

Reason:

Responsibility পরিষ্কার থাকবে।

একটি Layer পরিবর্তন করলে অন্য Layer-এর উপর অপ্রয়োজনীয়
প্রভাব কম হবে।

Testing সহজ হবে।

Security Review সহজ হবে।

Future Feature যোগ করা সহজ হবে।

Alternatives:

- সব Logic Controller-এ রাখা
- Route-এর মধ্যে Database Query করা
- Service এবং Repository বাদ দেওয়া
- Monolithic File Structure

এই Approach গ্রহণ করা হয়নি।

Security Impact:

Security-sensitive Logic আলাদা Layer-এ রাখা সম্ভব হবে।

Performance Impact:

Layer সংখ্যা বাড়লেও Architecture পরিষ্কার থাকবে।

অপ্রয়োজনীয় abstraction এড়ানো হবে।

Maintainability Impact:

HIGH POSITIVE

Implementation:

app/controllers/
app/services/
app/repositories/
app/validators/
app/middleware/
app/models/

---

# ৫. Thin Controller Decision

## DECISION-002 — Controller Thin রাখা

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Controller-এর মধ্যে Complex Business Logic রাখা যাবে না।

Controller-এর প্রধান Flow:

Request
→ Validate
→ Service
→ Response

Controller-এ SQL Query থাকবে না।

Password Hashing থাকবে না।

Complex Permission Logic থাকবে না।

Reason:

Controller সহজ এবং Testable থাকবে।

Security Review সহজ হবে।

Business Logic Service Layer-এ কেন্দ্রীভূত থাকবে।

---

# ৬. Business Logic Service Layer-এ রাখা

## DECISION-003 — Service Layer as Business Logic Boundary

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Application-এর Business Logic প্রধানত Service Layer-এ থাকবে।

Service:

- Business Rules
- Workflow
- Security-sensitive Decisions
- Multiple Repository Coordination
- External Provider Coordination
- Transactions

পরিচালনা করবে।

Reason:

Business Logic এক জায়গায় সংগঠিত থাকবে।

Future Feature এবং API একই Service ব্যবহার করতে পারবে।

---

# ৭. Repository Layer Decision

## DECISION-004 — Database Access Repository-এর মাধ্যমে

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Application-এর Database Access Repository Layer-এর মাধ্যমে
পরিচালিত হবে।

Repository-এর দায়িত্ব:

- SELECT
- INSERT
- UPDATE
- DELETE
- Database Query
- Persistence
- Transaction-related Database Operation

Repository-এর মধ্যে Complex Business Logic থাকবে না।

Reason:

Database-specific Code Application Logic থেকে আলাদা থাকবে।

Testing সহজ হবে।

Database implementation ভবিষ্যতে পরিবর্তন করার সুযোগ থাকবে।

---

# ৮. Database Schema Protection

## DECISION-005 — Existing Database আগে Audit

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Existing Database Migration এবং Schema Audit না করে
অপ্রয়োজনীয়ভাবে নতুন Database Structure তৈরি করা যাবে না।

প্রথমে:

Migration
→ Schema
→ Index
→ Constraint
→ Repository
→ Model

সম্পর্ক যাচাই করতে হবে।

Reason:

Tesnow-এর Database Migration ইতোমধ্যে তৈরি আছে।

Existing Schema না বুঝে পরিবর্তন করলে Data Integrity সমস্যা
হতে পারে।

---

# ৯. Existing Code Preserve করার সিদ্ধান্ত

## DECISION-006 — অপ্রয়োজনীয় Rewrite নিষিদ্ধ

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Existing Working Code অপ্রয়োজনীয়ভাবে Delete বা Rewrite করা যাবে না।

কোনো File পরিবর্তনের আগে:

1. Existing Code পড়তে হবে।
2. Dependency বুঝতে হবে।
3. Related File পরীক্ষা করতে হবে।
4. পরিবর্তনের কারণ নির্ধারণ করতে হবে।
5. তারপর Modification করতে হবে।

Reason:

Project-এ ইতোমধ্যে অনেক Implementation রয়েছে।

সবকিছু নতুন করে লিখলে Regression এবং Architecture Conflict
হওয়ার সম্ভাবনা বাড়বে।

---

# ১০. One-Step-at-a-Time Development

## DECISION-007 — Controlled Incremental Development

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Tesnow একসাথে শত শত File Implement করবে না।

Preferred Flow:

একটি File
→ Validate
→ Test
→ Review
→ Commit

প্রয়োজন হলে ছোট Module:

Module
→ Integration Test
→ Security Review
→ Commit

Reason:

Error হলে সমস্যা কোথায় হয়েছে তা সহজে শনাক্ত করা যাবে।

Git Rollback সহজ হবে।

Architecture Drift কমবে।

---

# ১১. Vertical Slice Strategy

## DECISION-008 — প্রথমে End-to-End Feature তৈরি

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

শুধু একটি Layer-এর সব File শেষ করার পরিবর্তে
প্রথমে একটি Feature-এর End-to-End Vertical Slice তৈরি করা হবে।

প্রথম Vertical Slice:

Authentication

Flow:

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

Reason:

পুরো Architecture বাস্তবে কাজ করছে কিনা দ্রুত যাচাই করা যাবে।

---

# ১২. Authentication First

## DECISION-009 — Authentication প্রথম বড় Feature

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Core Foundation এবং Database Contract-এর পরে Authentication
প্রথম প্রধান Feature হিসেবে তৈরি করা হবে।

Reason:

প্রায় সব User এবং Admin Feature Authentication-এর উপর নির্ভর করে।

Security architecture শুরুতেই validate করা দরকার।

---

# ১৩. Server-side Authorization

## DECISION-010 — Frontend Authorization যথেষ্ট নয়

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Authorization অবশ্যই Server-side enforce করতে হবে।

Frontend-এ Button hide করা Security Control হিসেবে গণ্য হবে না।

Server অবশ্যই যাচাই করবে:

- User Identity
- Role
- Permission
- Resource Access
- Ownership যেখানে প্রয়োজন

Reason:

Client-side Code User পরিবর্তন করতে পারে।

---

# ১৪. RBAC Decision

## DECISION-011 — Role-Based Access Control

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Tesnow-এ RBAC ব্যবহার করা হবে।

Flow:

User
→ Role
→ Permission
→ Authorization

প্রয়োজন অনুযায়ী ABAC বা Resource-level checks যোগ করা যেতে পারে।

Reason:

Admin এবং User Access পরিষ্কারভাবে পরিচালনা করা দরকার।

---

# ১৫. Password Security

## DECISION-012 — Password কখনো Plain Text নয়

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Password কখনো Plain Text হিসেবে Database-এ সংরক্ষণ করা যাবে না।

Password Hashing-এর জন্য নিরাপদ এবং বর্তমান Project-এর সাথে
সামঞ্জস্যপূর্ণ Password Hashing Strategy ব্যবহার করা হবে।

Password Log করা সম্পূর্ণ নিষিদ্ধ।

Reason:

Database compromise হলেও Plain Password প্রকাশ রোধ করা।

---

# ১৬. Session Security

## DECISION-013 — Secure Session Architecture

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Authentication Session নিরাপদভাবে পরিচালনা করতে হবে।

প্রয়োজন অনুযায়ী:

- Session Expiration
- Session Rotation
- Session Invalidation
- Secure Cookie
- HttpOnly
- SameSite
- Secure Flag যখন HTTPS ব্যবহৃত হবে

ব্যবহার করা হবে।

Reason:

Session Hijacking এবং Session Abuse-এর ঝুঁকি কমানো।

---

# ১৭. Secrets Management

## DECISION-014 — Secret Source Code-এ রাখা যাবে না

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Password, API Key, Token, Encryption Key, Database Credential
এবং অন্যান্য Secret Source Code-এ রাখা যাবে না।

Environment Configuration ব্যবহার করা হবে।

`.env` Git Repository-তে Commit করা যাবে না।

Reason:

Git History বা Source Code Leak হলে Secret Exposure রোধ করা।

---

# ১৮. Error Message Security

## DECISION-015 — Public Error এবং Internal Error আলাদা

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

User-facing Error Response নিরাপদ এবং সংক্ষিপ্ত হবে।

Production Response-এ সরাসরি দেখানো যাবে না:

- SQL Error
- Stack Trace
- Internal Path
- Database Details
- Secret
- Internal Configuration

Internal Diagnostic তথ্য নিরাপদ Logging-এর মাধ্যমে রাখা হবে।

---

# ১৯. Logging Security

## DECISION-016 — Sensitive Data Logging নিষিদ্ধ

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Log-এ সরাসরি Sensitive Credential রাখা যাবে না।

বিশেষভাবে:

- Password
- Access Token
- Refresh Token
- API Secret
- Database Password
- Encryption Key
- Session Secret

Log করা যাবে না।

User Data-ও প্রয়োজন অনুযায়ী Minimize করা হবে।

---

# ২০. Input Validation

## DECISION-017 — Server-side Validation বাধ্যতামূলক

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Client-side Validation থাকলেও Server-side Validation বাধ্যতামূলক।

Client-এর Input বিশ্বাস করা যাবে না।

Validation প্রয়োজনে:

- Type
- Required
- Format
- Length
- Range
- Allowed Values
- Cross-field Rules

যাচাই করবে।

---

# ২১. SQL Injection Protection

## DECISION-018 — Parameterized Query

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

User-controlled Data সরাসরি SQL String-এর মধ্যে Concatenate
করা যাবে না।

Parameterized Query / Prepared Statement ব্যবহার করতে হবে।

Reason:

SQL Injection প্রতিরোধ।

---

# ২২. Rate Limiting

## DECISION-019 — Abuse-sensitive Endpoint Protection

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

শুধু Public Endpoint নয়, প্রয়োজন অনুযায়ী Sensitive
Authenticated Endpoint-এও Rate Limiting ব্যবহার করা হবে।

বিশেষভাবে:

- Login
- Registration
- Password Reset
- Verification
- API
- Sensitive Admin Action

Protection পাবে।

---

# ২৩. File Upload Security

## DECISION-020 — Upload Trust করা যাবে না

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

User-provided File:

- Filename
- Extension
- MIME
- Path
- Metadata

কোনোটিই একা Trust করা যাবে না।

প্রয়োজন অনুযায়ী:

Validation
→ Quarantine
→ Processing
→ Safe Storage

Flow ব্যবহার করা হবে।

---

# ২৪. Performance Decision

## DECISION-021 — Measure Before Optimize

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

শুধু অনুমানের ভিত্তিতে Performance Optimization করা হবে না।

প্রথমে:

Measure
→ Identify Bottleneck
→ Optimize
→ Measure Again

Reason:

অপ্রয়োজনীয় Optimization Architecture জটিল করতে পারে।

---

# ২৫. Database Performance

## DECISION-022 — Index এবং Query Design

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Database Performance-এর জন্য:

- Proper Index
- Efficient Query
- Pagination
- Query Review
- N+1 Prevention
- Connection Pooling

ব্যবহার করা হবে।

প্রয়োজন ছাড়া অতিরিক্ত Index যোগ করা যাবে না।

---

# ২৬. Caching

## DECISION-023 — Cache শুধু প্রয়োজনীয় জায়গায়

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Cache ব্যবহার করা হবে যেখানে এটি বাস্তব Performance Benefit দেয়।

Cache ব্যবহার করার আগে:

- Data Freshness
- Invalidation
- TTL
- Consistency
- Memory Cost

বিবেচনা করতে হবে।

---

# ২৭. Asynchronous Processing

## DECISION-024 — Heavy Work Background-এ

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

যেসব কাজ User Request-এর মধ্যে করার প্রয়োজন নেই,
সেগুলো প্রয়োজনে Queue/Worker-এ পাঠানো হবে।

উদাহরণ:

- Email
- Image Processing
- Analytics
- Search Indexing
- Backup
- Sitemap

Reason:

Main Request দ্রুত শেষ করা।

---

# ২৮. Testing Decision

## DECISION-025 — Test পরে নয়, Feature-এর সাথে

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Feature Code লেখার পরে অনেক দূর গিয়ে একসাথে Test করা হবে না।

যতটা সম্ভব:

Implementation
→ Test
→ Review

Flow অনুসরণ করা হবে।

---

# ২৯. Security Review Decision

## DECISION-026 — Security Final Gate

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Critical Feature Security Review ছাড়া Final হিসেবে চিহ্নিত করা যাবে না।

বিশেষ করে:

- Authentication
- Authorization
- Admin
- Payment
- Upload
- API
- Webhook
- Password
- Session

---

# ৩০. Git Checkpoint Decision

## DECISION-027 — Milestone Commit

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

গুরুত্বপূর্ণ Milestone-এর পরে Git Commit করা হবে।

Commit-এর আগে যতটা প্রযোজ্য:

- Syntax Check
- Test
- Security Review
- Architecture Review

সম্পন্ন করতে হবে।

Reason:

Regression হলে দ্রুত Rollback করা।

---

# ৩১. Chat-independent Development

## DECISION-028 — Project Documentation হবে Development Memory

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Tesnow-এর Development Context কোনো নির্দিষ্ট Chat-এর
উপর নির্ভরশীল হবে না।

Project-এর মধ্যে:

docs/development/

এর Documentation থাকবে।

প্রধান File:

- MASTER-PLAN.md
- CURRENT-STATUS.md
- DECISIONS.md
- CHANGELOG.md
- NEXT-TASK.md

Reason:

Chat Limit, Session Loss অথবা নতুন Chat হলেও Development
Continue করা সম্ভব হবে।

---

# ৩২. DeepSeek Development Decision

## DECISION-029 — DeepSeek as Code Generation Assistant

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

DeepSeek বড় এবং Copy-paste-ready Code Generation-এর জন্য
ব্যবহার করা যেতে পারে।

কিন্তু DeepSeek Local Tesnow File System সরাসরি Access করতে পারে না।

তাই:

Local File
→ Content সংগ্রহ
→ DeepSeek-কে দেওয়া
→ Code Generate
→ Local File-এ Paste
→ Termux Validation
→ Review

এই Workflow ব্যবহার করা হবে।

---

# ৩৩. AI-generated Code Review

## DECISION-030 — AI Code সরাসরি Trusted নয়

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

ChatGPT বা DeepSeek-এর Generated Code সরাসরি Final হিসেবে
গ্রহণ করা যাবে না।

প্রতিটি গুরুত্বপূর্ণ Code-এর:

- Syntax
- Architecture
- Security
- Integration
- Test

Review করতে হবে।

Reason:

AI-generated Code-এ ভুল, Security Issue বা Architecture
Mismatch থাকতে পারে।

---

# ৩৪. Dependency Decision

## DECISION-031 — অপ্রয়োজনীয় Dependency নিষিদ্ধ

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

একটি নতুন Dependency যোগ করার আগে যাচাই করতে হবে:

- সত্যিই প্রয়োজন কিনা
- Existing Dependency দিয়ে কাজ সম্ভব কিনা
- Security Risk
- Maintenance
- Package Size
- Performance
- License
- Compatibility

Reason:

Dependency কম থাকলে Attack Surface এবং Maintenance Cost কমে।

---

# ৩৫. Free Tool Strategy

## DECISION-032 — Free-first Development

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

Tesnow Development যতটা সম্ভব Free এবং Open-source Tool/
Technology ব্যবহার করে করা হবে।

Paid Service অপরিহার্য না হলে ব্যবহার করা হবে না।

তবে Free হওয়ার কারণে Security বা Correctness-এর মান কমানো যাবে না।

---

# ৩৬. Mobile-first Development Environment

## DECISION-033 — Termux-based Development

তারিখ:

2026-09-10

Status:

ACCEPTED

Decision:

বর্তমান Development Workflow Android + Termux Environment-এর
সাথে সামঞ্জস্যপূর্ণ রাখতে হবে।

Commands এবং Tooling এমন হওয়া উচিত যাতে PC না থাকলেও
প্রয়োজনীয় Development কাজ করা যায়।

---

# ৩৭. Decision পরিবর্তনের নিয়ম

পুরোনো Decision পরিবর্তন করতে হলে পুরোনো Entry Delete করা যাবে না।

তার পরিবর্তে:

পুরোনো:

Status:
SUPERSEDED

এবং নতুন Decision-এর মধ্যে উল্লেখ করতে হবে:

Supersedes:
DECISION-XXX

Reason:

কেন পুরোনো Decision পরিবর্তন করা হয়েছে।

---

# ৩৮. Decision তৈরির বাধ্যতামূলক ক্ষেত্র

নিচের যেকোনো বিষয়ে বড় পরিবর্তন হলে DECISIONS.md Update করতে হবে:

- Architecture
- Database Design
- Authentication
- Authorization
- Security
- Performance Architecture
- Caching
- Queue
- External Provider
- API Design
- Major Dependency
- Deployment
- Backup
- Disaster Recovery
- Development Workflow

---

# ৩৯. Decision পরিবর্তনের আগে Checklist

[ ] Existing Architecture Review

[ ] Existing Code Review

[ ] Security Impact

[ ] Performance Impact

[ ] Maintenance Impact

[ ] Compatibility Impact

[ ] Alternatives Considered

[ ] Migration/Rollback Strategy

[ ] Documentation Update

---

# ৪০. Current Decision Summary

বর্তমান Tesnow-এর মূল সিদ্ধান্ত:

1. Layered Architecture
2. Thin Controllers
3. Service-based Business Logic
4. Repository-based Database Access
5. Existing Database আগে Audit
6. Existing Code অপ্রয়োজনীয় Rewrite নয়
7. One-step-at-a-time Development
8. Vertical Slice Strategy
9. Authentication First
10. Server-side Authorization
11. RBAC
12. Secure Password Handling
13. Secure Sessions
14. Environment-based Secrets
15. Safe Error Handling
16. Secure Logging
17. Server-side Validation
18. Parameterized Database Queries
19. Rate Limiting
20. Secure File Upload
21. Measure Before Optimize
22. Proper Database Indexing
23. Controlled Caching
24. Background Jobs
25. Testing Alongside Features
26. Security as Final Gate
27. Git Milestones
28. Chat-independent Documentation
29. DeepSeek for Code Generation
30. AI-generated Code Review
31. Minimal Dependencies
32. Free-first Development
33. Termux-compatible Development

---

# ৪১. বর্তমান অবস্থা

Decision System:

ACTIVE

Current Decision Range:

DECISION-001 → DECISION-033

পরবর্তী গুরুত্বপূর্ণ Architecture বা Technical Decision হলে:

DECISION-034

থেকে শুরু করতে হবে।

---

# ৪২. গুরুত্বপূর্ণ নিয়ম

এই ফাইলে কোনো:

- Password
- API Key
- Token
- Secret
- Database Credential
- Encryption Key

রাখা যাবে না।

---

# ৪৩. Final Principle

Tesnow-এর কোনো গুরুত্বপূর্ণ Technical Decision যেন শুধু
কোনো মানুষের স্মৃতি বা Chat History-এর উপর নির্ভর না করে।

Decision অবশ্যই Project Documentation-এর মধ্যে সংরক্ষিত থাকবে।

> "কী করেছি" জানার জন্য CURRENT-STATUS.md

> "কেন করেছি" জানার জন্য DECISIONS.md

> "কী পরিবর্তন হয়েছে" জানার জন্য CHANGELOG.md

> "এখন কী করতে হবে" জানার জন্য NEXT-TASK.md

> "পুরো Project-এর পরিকল্পনা" জানার জন্য MASTER-PLAN.md

---

END OF DECISIONS