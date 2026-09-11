অবশ্যই। এখন সবচেয়ে গুরুত্বপূর্ণ হলো 357টা empty file একসাথে fill না করে, একটি controlled workflow-এ Tesnow তৈরি করা। তোমার বর্তমান অবস্থায় আমি এই workflow-টাই অনুসরণ করব।

🚀 TESNOW — 100/100 Development Workflow

আমাদের মূল নিয়ম হবে:

> Audit → Design → Implement → Validate → Test → Security Review → Commit → Next



প্রতিটি module এই cycle পার না হলে পরের module-এ যাব না।


---

PHASE 0 — 🔒 Project Freeze & Backup

কোনো code পরিবর্তনের আগে:

Step 0.1 — Git status

cd ~/Tesnow

git status --short
git branch --show-current
git log --oneline -5

Step 0.2 — .env নিরাপদ কিনা পরীক্ষা

git ls-files .env

যদি output আসে, থামব এবং আগে .env tracking থেকে সরাব।

.env কখনো আমাকে paste করবে না।

Step 0.3 — Baseline commit

সবকিছু ঠিক থাকলে:

git add -A
git commit -m "chore: baseline existing Tesnow project"

এটাই হবে আমাদের recovery checkpoint।


---

PHASE 1 — 🧠 Architecture Audit

প্রথমে নতুন code লিখব না।

বর্তমান architecture বুঝব।

এই ৮টি জিনিস আগে audit করব:

package.json
server.js
app/core/app.js
app/core/container.js
app/core/errors.js
app/core/logger.js
app/config/index.js
database/migrations/001_create_users.sql

এরপর:

Auth architecture
↓
Database architecture
↓
Repository architecture
↓
Service architecture
↓
Middleware architecture
↓
Controller architecture
↓
Route architecture

কেন?

কারণ বর্তমানে 145টি file-এ code আছে।

আমরা যদি না দেখে নতুন code লিখি, তাহলে:

existing code
      ↓
new code
      ↓
duplicate responsibility
      ↓
inconsistent architecture
      ↓
future bugs

হতে পারে।


---

PHASE 2 — 📐 Standards Lock

আগে coding rules final করব।

তোমার existing:

docs/developer/standards/

এর rules review করে final version করব।

বিশেষ করে:

Error handling

AppError
ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
DatabaseError
InternalError

Logging

requestId
userId
action
resource
duration
error

কিন্তু:

password
token
session secret
API key
database credentials

কখনো log হবে না।

Naming

user.repository.js
auth.service.js
post.controller.js
post.validator.js

একই convention সর্বত্র।


---

PHASE 3 — 🏗️ Core Foundation

এরপর নিচের core layer স্থির করব:

app/core/
│
├── app.js
├── container.js
├── constants.js
├── errors.js
├── events.js
├── logger.js
├── pagination.js
├── request-context.js
├── response.js
├── shutdown.js
└── transactions.js

Priority:

1. errors.js
2. logger.js
3. request-context.js
4. response.js
5. container.js
6. transactions.js
7. shutdown.js
8. app.js

কারণ এগুলো পুরো application-এর foundation।


---

PHASE 4 — 🗄️ Database Contract

Database already অনেকটা তৈরি আছে।

তাই নতুন migration বানানোর আগে existing migration audit করব।

001 → users
002 → ...
...
025 → admin roles

আমরা verify করব:

Primary keys
Foreign keys
Indexes
Unique constraints
NOT NULL
Defaults
Timestamps
Soft delete
Security-sensitive columns

তারপর database → application contract তৈরি হবে।


---

PHASE 5 — 👤 MODEL Layer

সব 23টা model একসাথে নয়।

প্রথম batch:

User.js
Admin.js
Role.js
Permission.js
Session.js
AuditLog.js
SecurityEvent.js

তারপর:

Post.js
PostRevision.js
Category.js
Tag.js

তারপর:

Comment.js
Like.js
Bookmark.js
Report.js

তারপর:

Media.js
Notification.js
NewsletterSubscriber.js
ContactMessage.js

শেষে:

ApiKey.js
FeatureFlag.js
Redirect.js
Setting.js
Webhook.js
LoginAttempt.js

প্রতিটি model-এর ক্ষেত্রে:

Migration
↓
Model
↓
Repository
↓
Test


---

PHASE 6 — 🗃️ Repository Layer

Existing repositoryগুলো rewrite করব না।

আগে audit:

user.repository.js
role.repository.js
permission.repository.js
session.repository.js
admin.repository.js
audit.repository.js
security.repository.js

তারপর standard contract:

Repository
    ↓
Database only

Repository-এর কাজ হবে:

SELECT
INSERT
UPDATE
DELETE
transactions
database-specific errors

Repository-এর ভিতরে business logic ঢুকবে না।


---

PHASE 7 — ✅ Validator Layer

তারপর validators।

প্রথম:

auth.validator.js
user.validator.js

তারপর:

post.validator.js
category.validator.js
tag.validator.js
comment.validator.js
media.validator.js
search.validator.js
settings.validator.js
contact.validator.js

Validator করবে:

type
required
format
length
range
allowed values
cross-field validation যেখানে দরকার

কিন্তু validator database business logic করবে না।


---

PHASE 8 — ⚙️ Service Layer

এখানেই মূল business logic থাকবে।

প্রথমে Authentication:

app/services/auth/
│
├── auth.service.js
├── password.service.js
├── session.service.js
├── email-verification.service.js
├── password-reset.service.js
├── rbac.service.js
├── recovery-code.service.js
├── two-factor.service.js
├── oauth.service.js
└── webauthn.service.js

Priority:

auth.service
↓
password.service
↓
session.service
↓
email verification
↓
password reset
↓
RBAC
↓
2FA
↓
OAuth/WebAuthn


---

PHASE 9 — 🛡️ Middleware

Foundation middleware:

request-id.js
↓
authentication.js
↓
authorization.js
↓
validation.js
↓
rate-limit.js
↓
security-headers.js
↓
csrf.js
↓
timeout.js
↓
error-handler.js

Advanced:

bot-protection
upload-security
maintenance
cache-control
ABAC

পরে।


---

PHASE 10 — 🎮 Controller

Controller-এর rule:

Request
 ↓
Validate
 ↓
Service
 ↓
Response

Controller-এর ভিতরে:

❌ SQL
❌ complicated business logic
❌ password hashing
❌ permission calculation

এসব Service/Repository layer-এ থাকবে।


---

PHASE 11 — 🌐 Routes

তারপর:

auth.routes.js
user.routes.js
admin.routes.js
public.routes.js
system.routes.js
api.routes.js

Route শুধু composition করবে:

route
 ↓
middleware
 ↓
controller


---

PHASE 12 — 🔐 প্রথম Complete Vertical Slice

এটাই সবচেয়ে গুরুত্বপূর্ণ।

আমরা প্রথমে পুরো Authentication system-এর একটি অংশ শেষ করব।

Login flow

POST /login
      ↓
Route
      ↓
Rate Limit
      ↓
Validation
      ↓
Authentication
      ↓
Auth Controller
      ↓
Auth Service
      ↓
User Repository
      ↓
Database
      ↓
Password Service
      ↓
Session Service
      ↓
Response

তারপর test:

valid login
invalid password
unknown user
disabled user
rate limit
session creation
session expiry
logging
error response

এটি successful হলে আমরা বলব:

> Tesnow architecture pattern validated.



তারপর একই pattern অন্য modules-এ ব্যবহার করব।


---

PHASE 13 — 📝 Registration

Login-এর পরে:

POST /register

Flow:

Validator
↓
User Service
↓
Password Service
↓
User Repository
↓
Database
↓
Email Verification
↓
Response

Tests:

duplicate email
weak password
invalid email
missing fields
successful registration
verification required


---

PHASE 14 — 🔑 Password Recovery

তারপর:

Forgot password
        ↓
Reset token
        ↓
Email
        ↓
Token validation
        ↓
New password
        ↓
Session invalidation

Security tests অবশ্যই থাকবে।


---

PHASE 15 — 👑 RBAC

তোমার existing RBAC implementation গুরুত্বপূর্ণ।

Flow:

User
 ↓
Role
 ↓
Permission
 ↓
Authorization
 ↓
Controller

তারপর Admin:

Super Admin
Admin
Editor
Moderator
User

তবে role names database-এর actual design অনুযায়ী final করব।


---

PHASE 16 — 📰 Content Management

Authentication stable হওয়ার পর:

Post
Category
Tag
Revision
Publishing
Scheduling
Slug
SEO

Order:

Category
 ↓
Tag
 ↓
Post
 ↓
Revision
 ↓
Draft
 ↓
Preview
 ↓
Publish
 ↓
Schedule


---

PHASE 17 — 💬 Interaction

এরপর:

Comment
Like
Bookmark
Report

Flow:

User
 ↓
Post
 ↓
Interaction
 ↓
Moderation
 ↓
Audit


---

PHASE 18 — 🖼️ Media

তারপর:

Upload
 ↓
Quarantine
 ↓
Validation
 ↓
Metadata
 ↓
Optimization
 ↓
Thumbnail
 ↓
Storage

Security এখানে খুব গুরুত্বপূর্ণ।


---

PHASE 19 — 📊 Admin Dashboard

Backend stable হওয়ার পর:

admin/
├── login
├── dashboard
├── posts
├── users
├── roles
├── permissions
├── comments
├── media
├── analytics
├── audit logs
└── security

তখন তোমার existing:

admin/*.ejs
admin/*.css
admin/*.js

fill করা শুরু করব।


---

PHASE 20 — 🎨 Frontend

Backend contract stable হওয়ার আগে frontend polish করব না।

প্রতিটি page:

page.ejs
page.css
page.js

যেমন:

admin/posts/new/
├── new.ejs
├── new.css
└── new.js

এটা তোমার preferred structure-এর সাথেও consistent থাকবে।


---

PHASE 21 — 🔌 API

তারপর:

/api/v1/

Authentication:

POST /api/v1/auth/login
POST /api/v1/auth/register
POST /api/v1/auth/logout
POST /api/v1/auth/refresh

তারপর:

posts
users
comments
media
admin

OpenAPI documentation একই contract থেকে maintain করব।


---

PHASE 22 — ⚡ Jobs / Queue

তারপর:

email.worker.js
image.worker.js
search.worker.js
notification.worker.js
analytics.worker.js
backup.worker.js
cleanup.worker.js
sitemap.worker.js

Architecture:

Controller/Service
       ↓
Queue
       ↓
Worker
       ↓
Service
       ↓
Repository


---

PHASE 23 — 🔎 Search / SEO / Analytics

এরপর:

Search
SEO
Sitemap
Analytics
Traffic
View Counter

এগুলো core business flow-এর পরে করব।


---

PHASE 24 — 🧪 Testing

প্রতিটি module-এর সাথে test হবে।

আমরা শেষে সব test করার জন্য অপেক্ষা করব না।

প্রতিটি feature:

Unit Test
+
Integration Test
+
Security Test

উদাহরণ:

Auth Service
    ↓
Unit test

POST /login
    ↓
Integration test

Brute force / rate limit
    ↓
Security test


---

PHASE 25 — 🔐 Security Audit

তারপর full security review:

Authentication
Authorization
RBAC
CSRF
XSS
SQL Injection
Session Security
Rate Limiting
Password Security
File Upload
Path Traversal
IDOR
CORS
Security Headers
Secrets
Logging
Error Leakage
Webhook Signature
API Keys
Backup Security

বিশেষভাবে:

.env
↓
logs
↓
responses
↓
database errors
↓
uploaded files

কোনো secret leak হচ্ছে কিনা দেখব।


---

PHASE 26 — 💾 Backup / Disaster Recovery

তোমার project-এর জন্য এটা গুরুত্বপূর্ণ।

Test করব:

Database backup
↓
Backup verification
↓
Restore
↓
Integrity check

এবং Git checkpoint।


---

PHASE 27 — 🚀 Production

সবশেষে:

Development
↓
Testing
↓
Staging
↓
Security review
↓
Production

তারপর:

PM2 / Docker
HTTPS
Environment variables
Database
Redis
Queue
Monitoring
Logging
Backup
Rollback


---

PHASE 28 — 📚 Documentation

শেষে documentation:

Architecture
API
Database
Security
Deployment
Admin manual
Developer setup
Disaster recovery
Contribution
Changelog

Documentation code-এর সাথে synchronize হবে।


---

🧭 আমাদের বাস্তব কাজের Flow

তোমার ক্ষেত্রে আমি এই exact sequence follow করতে চাই:

TESNOW
                       │
                       ▼
              🔒 Git Checkpoint
                       │
                       ▼
              🧠 Architecture Audit
                       │
                       ▼
              📐 Standards Lock
                       │
                       ▼
                🏗️ Core Audit
                       │
                       ▼
               🗄️ DB Contract
                       │
                       ▼
             👤 AUTH VERTICAL SLICE
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Model      Repository    Validator
          │            │            │
          └────────────┼────────────┘
                       ▼
                    Service
                       │
                       ▼
                  Middleware
                       │
                       ▼
                   Controller
                       │
                       ▼
                     Route
                       │
                       ▼
                  Integration
                     Test
                       │
                       ▼
                🔐 Security Review
                       │
                       ▼
                  Git Commit
                       │
                       ▼
              NEXT VERTICAL SLICE


---

📊 Empty files কীভাবে handle করব?

357 empty file দেখে ভয় পাওয়ার দরকার নেই।

তিন ভাগ করব:

🟢 এখনই প্রয়োজন

যেমন:

User.js
auth.validator.js
relevant auth controller
auth routes

এগুলো implement হবে।

🟡 পরে প্রয়োজন

যেমন:

analytics
SEO
advanced media
OAuth
WebAuthn

এগুলো empty থাকলেও সমস্যা নেই।

⚪ Documentation/UI placeholders

যেমন:

docs
EJS
CSS
frontend JS
YAML

এগুলোকে backend code-এর মতো গণনা করব না।


---

📈 আমাদের নতুন Progress System

শুধু:

145/502

এভাবে progress মাপব না।

প্রতিটি feature:

[ ] Planned
[D] Draft
[I] Implemented
[R] Reviewed
[T] Tested
[S] Security Reviewed
[F] Final

উদাহরণ:

Authentication

Model              [F]
Repository         [F]
Validator          [F]
Service            [R]
Middleware         [T]
Controller         [I]
Route              [I]
Frontend           [ ]
Tests              [ ]
Security           [ ]

এটা অনেক বেশি meaningful।


---

🔥 এখনই আমরা কী করব?

আজ নতুন 20টা file লিখব না।

প্রথমে এই ছোট audit batch চালাও:

cd ~/Tesnow

printf '\n===== GIT =====\n'
git status --short
git branch --show-current
git log --oneline -5

printf '\n===== PACKAGE =====\n'
cat package.json

printf '\n===== SERVER =====\n'
sed -n '1,240p' server.js

printf '\n===== APP CORE =====\n'
sed -n '1,300p' app/core/app.js

তারপর দ্বিতীয় batch:

printf '\n===== CONTAINER =====\n'
sed -n '1,300p' app/core/container.js

printf '\n===== ERRORS =====\n'
sed -n '1,300p' app/core/errors.js

printf '\n===== LOGGER =====\n'
sed -n '1,300p' app/core/logger.js

printf '\n===== CONFIG =====\n'
sed -n '1,260p' app/config/index.js

এখন শুধু এই দুই batch-এর output দাও।

এরপর আমরা তোমার actual code দেখে PHASE 0 → PHASE 1 শুরু করব এবং কোথাও existing code অকারণে delete/rewrite করব না।

আমাদের লক্ষ্য হবে “502 files complete” নয় — বরং একটি coherent, tested, secure Tesnow application।

--------------------------------------------------------------------------------------------------

অবশ্যই। শুধু “code দাও” বললে হবে না—DeepSeek-কে স্পষ্ট করে দিতে হবে যে TESNOW production-grade professional system, তাই candidate code-ও high-level হতে হবে।

এখন থেকে DeepSeek-এর প্রতিটি prompt-এ এই Quality Standard থাকবে:

🔒 TESNOW Professional Code Standard

Production-grade architecture

High security / security-first

Fail-closed

OWASP-aligned security practices

No security regression

No unnecessary dependencies

High performance

Scalable architecture

Concurrency/race-condition awareness

Proper error handling

Centralized error architecture

No sensitive data leakage

No raw passwords/tokens/session IDs/secrets in logs

Input validation

Authorization boundaries preserved

Database integrity preserved

Transaction/rollback/compensation যেখানে প্রয়োজন

Idempotency যেখানে প্রয়োজন

Rate-limit / abuse considerations যেখানে relevant

Clean separation of Route → Middleware → Controller → Service → Repository

Thin controllers

No business logic in routes/middleware

No direct DB access outside repositories

Dependency injection/testability যেখানে যুক্তিযুক্ত

Backward compatibility

ESM + Node.js 24 compatibility

Maintainable এবং readable code

No premature abstraction

No dead code

No speculative features

No breaking API changes without proof

Production observability without sensitive logging

Future-ready কিন্তু over-engineered নয়


আর সবচেয়ে গুরুত্বপূর্ণ:

> DeepSeek-এর candidate code কখনো final ধরে নেওয়া হবে না।






Workflow হবে:

1. DeepSeek → High-level candidate

↓

2. তুমি code এখানে দেবে

↓

3. আমি architecture + security + performance + compatibility audit করব

↓

4. সমস্যা থাকলে আমি নিজে সম্পূর্ণ corrected file লিখব

↓

5. তুমি copy-paste করবে

↓

6. Termux verification

↓

7. তারপর next file

এভাবেই আমরা TESNOW-কে professional production-level standard-এ এগোবো, শুধু “code কাজ করছে” level-এ না।