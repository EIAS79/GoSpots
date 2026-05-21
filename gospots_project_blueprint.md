# GoSpots / Gaming & Billiard Center Management SaaS  
## Full Project Blueprint, Architecture Plan, and Build Roadmap

---

## 1. Project Summary

You are building a **real SaaS product** for billiard halls, gaming lounges, and entertainment centers.

The product helps venue owners manage:

- Tables
- Games
- Live sessions
- Timers
- Billing
- Staff
- Daily revenue
- Packages/subscriptions
- Reports
- Branches later

The software is not just a simple billiard timer.

It is a **venue operations SaaS**.

The core purpose is:

> Help gaming and billiard centers control every table, session, bill, employee action, and daily revenue from one clear operating system.

---

## 2. Product Positioning

### Main Positioning

**GoSpots is a SaaS platform for billiard and gaming centers that helps owners control live sessions, table usage, billing, staff activity, and daily revenue from one operating screen.**

### Simple Sales Message

**Stop managing tables, timers, and payments by memory. Control every active session and every bill from one clear system.**

### What the Product Is

GoSpots is:

- A live operation screen
- A session timer system
- A billing system
- A lightweight POS for gaming venues
- A staff control system
- A revenue reporting system
- A subscription-based SaaS product

### What the Product Is Not

GoSpots is not:

- A generic POS
- A restaurant system
- A toy billiard timer
- A simple booking app
- A normal website
- A prototype

This is a serious business system.

---

## 3. Honest Product Judgment

The idea is good.

But the dangerous part is overbuilding too early.

The full idea includes:

- Multi-tenant SaaS
- Packages
- Tables
- Games
- Sessions
- Billing
- Bar module
- Staff permissions
- Reservations
- Reports
- Memberships
- Multi-branch dashboard
- Enterprise customization

That is a full commercial roadmap, not an MVP.

The first version must focus only on the strongest pain:

> Who is playing, on which table, since when, and how much should they pay?

If this core works well, the product has a real chance.

If the main operation screen is weak, the product is dead.

---

## 4. Target Users

---

### 4.1 Our-CS Admin / System Owner

This is the SaaS owner/admin.

The system admin manages:

- Venues/tenants
- Packages
- Subscription status
- Feature access
- Tenant activation/suspension
- Package limits
- SaaS-level reports later

Example actions:

- Create a new venue account
- Assign Starter package
- Suspend unpaid tenant
- Upgrade tenant to Pro
- View active venues
- Enable/disable features

---

### 4.2 Venue Owner

The venue owner manages their own business inside the system.

The owner can:

- Add resources/tables/games
- Set prices
- Add staff
- View daily/monthly reports
- Check invoices
- Track revenue
- See which games make money
- Manage settings

Example actions:

- Add Table 1 as Billiard
- Set hourly rate to 40 PLN/hour
- Add cashier account
- View today’s revenue
- Check who gave a discount

---

### 4.3 Branch Manager

For venues with branches.

The branch manager can:

- Manage one branch
- View branch resources
- See branch reports
- Manage staff in that branch
- Monitor active sessions

This can come later, but the database should support it from day one.

---

### 4.4 Cashier / Staff

The cashier uses the system every day.

The cashier can:

- Start sessions
- End sessions
- Add drinks/snacks
- Move a customer to another table
- Apply allowed discounts
- Generate bill
- Print receipt
- Close shift later

Example actions:

- Start Table 2
- Add 2 Coca-Cola
- End session
- Collect cash
- Print bill

---

## 5. Main Business Problem

Many billiard and gaming venues still manage operations manually using:

- Memory
- Paper
- WhatsApp
- Simple calculators
- Manual timers
- Cash drawer guesses
- Excel sheets
- Verbal staff handover

This causes:

- Wrong billing
- Forgotten sessions
- Undercharging
- Staff mistakes
- No clear daily revenue
- No proof of who did what
- Poor owner control
- No visibility into busy hours
- No clear resource profitability

GoSpots solves this by centralizing the operation.

---

## 6. Core Product Concept

The system is based on three core concepts:

---

### 6.1 Resources

A resource is anything that can be played, rented, or occupied.

Examples:

- Billiard table
- Snooker table
- Ping pong table
- Darts board
- PlayStation station
- Chess table
- Board game table

Each resource has:

- Name
- Type
- Status
- Pricing type
- Hourly price
- Fixed price
- Branch
- Tenant

---

### 6.2 Sessions

A session is a period of usage for a resource.

Example:

Customer starts playing on Table 3 at 18:20.

The system creates a session:

- Resource: Table 3
- Start time: 18:20
- Status: Active
- Started by: Cashier
- Price: 40 PLN/hour

When the customer finishes, the cashier ends the session.

The system calculates:

- Duration
- Base amount
- Extras
- Discount
- Total bill

---

### 6.3 Billing

Billing turns a session into an invoice/receipt.

The bill may include:

- Session cost
- Drinks
- Snacks
- Extra services
- Discounts
- Payment method
- Final total

Example:

```text
Table 3
Duration: 1 hour 30 minutes
Rate: 40 PLN/hour
Game total: 60 PLN

2x Coca-Cola: 20 PLN
Discount: 0 PLN

Total: 80 PLN
Payment: Cash
```

---

## 7. Suggested Product Name

Two good names:

### Option 1: CueControl

Good for billiard-focused positioning.

Problem: it sounds too limited to billiards.

### Option 2: GoSpots

Better for a wider SaaS product.

It can cover:

- Billiards
- Darts
- PlayStation
- Board games
- Gaming lounges
- Multi-branch venues

### Recommended Name

**GoSpots**

Reason:

The system is not only about cues or billiards. It is about controlling the flow of a venue.

---

## 8. Packages

The product uses a subscription/package model.

Each package unlocks different features and limits.

---

### 8.1 Starter Package

For small venues.

Features:

- Billiard/table resources only
- Limited number of resources
- Live session timer
- Automatic billing
- Simple receipt
- Daily report
- One cashier account
- One branch only

Example limits:

- Up to 6 resources
- Up to 2 users
- Basic reports only
- No reservations
- No memberships
- No advanced staff permissions

---

### 8.2 Standard Package

For medium venues.

Features:

- Multiple game types
- Billiard
- Snooker
- Darts
- Cards
- Chess
- PlayStation
- Bar/snacks sales
- Reservations
- Sales reports
- Multiple staff accounts

Example limits:

- Up to 20 resources
- Up to 5 users
- Bar module enabled
- Reservation module enabled
- Standard reports

---

### 8.3 Pro Package

For serious venues.

Features:

- Unlimited or high resource limit
- Staff roles and permissions
- Customer records
- Memberships
- Discounts
- Advanced reports
- Peak hours
- Most profitable games
- Cashier activity logs
- Shift reports

Example limits:

- Up to 100 resources
- Up to 20 users
- Advanced reports enabled
- Staff permissions enabled
- Membership module enabled

---

### 8.4 Enterprise Package

For chains and multi-branch businesses.

Features:

- Multiple branches
- Central dashboard
- Branch comparison
- Advanced roles
- Custom settings
- Higher support
- Custom contract
- Possible white-labeling later

Example limits:

- Unlimited branches
- Unlimited users
- Custom modules
- Priority support

---

## 9. Feature Modules

The system should be built as modules.

Do not build all modules first.

But design the structure so they can be added cleanly.

---

### 9.1 Auth Module

Responsible for:

- Login
- Logout
- Password reset
- Current user session
- Role checking
- User permissions
- Tenant access control

Roles:

- SystemAdmin
- TenantOwner
- BranchManager
- Cashier
- Viewer

---

### 9.2 Tenant Module

Responsible for SaaS tenant/business accounts.

A tenant is one subscribed business.

Example:

```text
Tenant: Warsaw Gaming Club
```

Tenant module handles:

- Tenant creation
- Tenant profile
- Tenant status
- Tenant subscription
- Package assignment
- Account activation
- Account suspension

Tenant statuses:

- Trial
- Active
- Suspended
- Cancelled
- Expired

---

### 9.3 Branch Module

Responsible for venue branches.

A tenant can have one branch or multiple branches.

Example:

```text
Warsaw Gaming Club
- Branch 1: Mokotów
- Branch 2: Centrum
```

For MVP:

- Support one branch in UI

But database should already include BranchId.

---

### 9.4 Resource Module

Responsible for anything playable/rentable.

Examples:

- Table 1
- Table 2
- Snooker 1
- Darts 1
- PlayStation 1

Resource statuses:

- Available
- Busy
- Reserved
- Maintenance
- Disabled

Resource pricing types:

- Hourly
- Fixed
- Free
- Custom later

Resource fields:

- ResourceId
- TenantId
- BranchId
- Name
- ResourceType
- Status
- PricingType
- HourlyRate
- FixedPrice
- IsActive
- CreatedAt
- UpdatedAt

---

### 9.5 Session Module

This is the heart of the system.

Responsible for:

- Start session
- Pause session
- Resume session
- End session
- Cancel session
- Move resource
- Track active sessions
- Calculate duration
- Calculate base amount

Session statuses:

- Active
- Paused
- Closed
- Cancelled

Important rules:

- A resource cannot have two active sessions at the same time.
- A closed session cannot be reopened casually.
- Cancelling a session must be logged.
- Ending a session should create or prepare an invoice.
- Moving a session from one resource to another must be logged.

---

### 9.6 Billing Module

Responsible for:

- Creating invoices
- Adding session cost
- Adding extra items
- Applying discounts
- Recording payment method
- Closing bills
- Printing receipt
- Tracking unpaid bills later

Invoice statuses:

- Draft
- Issued
- Paid
- Cancelled
- Refunded later

Payment methods:

- Cash
- Card
- Mixed
- Online later
- Unpaid

Billing rules:

- Invoice must belong to a TenantId.
- Invoice must belong to a BranchId.
- Invoice should link to a session when it is session-based.
- Discounts should be permission-controlled.
- Every cancelled invoice should create an audit log.

---

### 9.7 Products / Bar Module

Responsible for extra sales.

Examples:

- Coca-Cola
- Water
- Coffee
- Chips
- Snacks
- Energy drinks

MVP version:

- Product name
- Price
- Active/inactive
- Add product to invoice/session

Do not build full inventory first.

Inventory later can include:

- Stock quantity
- Low stock alert
- Purchase price
- Supplier
- Profit margin

But this is not MVP.

---

### 9.8 Reservation Module

Responsible for booking resources in advance.

Features later:

- Select resource
- Select date/time
- Customer name
- Phone number
- Prevent time conflict
- Reservation status
- Convert reservation to session

Reservation statuses:

- Pending
- Confirmed
- Cancelled
- Completed
- No-show

Do not build this first.

Add it after the core session/billing system works.

---

### 9.9 Staff Module

Responsible for employees and permissions.

Features:

- Add staff user
- Assign role
- Limit access
- Track actions
- View cashier performance

Examples:

- Cashier can start/end sessions
- Cashier cannot change prices
- Owner can change prices
- Manager can view reports
- Viewer can only view dashboard

---

### 9.10 Reports Module

Responsible for business visibility.

MVP reports:

- Daily revenue
- Number of sessions
- Revenue by resource
- Revenue by cashier
- Cash/card totals
- Open sessions
- Closed sessions
- Cancelled sessions

Later reports:

- Monthly revenue
- Peak hours
- Best-performing resources
- Staff performance
- Average session duration
- Branch comparison
- Product sales
- Customer/member activity

---

### 9.11 Subscription Module

Responsible for SaaS packages and feature access.

Features:

- Package list
- Package limits
- Tenant subscription
- Subscription start date
- Subscription end date
- Subscription status
- Manual activation
- Feature locking

MVP:

- Manual activation by Our-CS Admin
- No online payment gateway at first

Later:

- Stripe
- PayPal
- Invoice payment
- Auto-renewal
- Failed payment handling

---

### 9.12 Audit Log Module

This module is non-negotiable.

It tracks important actions.

Examples:

- User started session
- User ended session
- User cancelled invoice
- User changed price
- User applied discount
- User deleted resource
- User changed package
- User suspended tenant

Audit log fields:

- AuditLogId
- TenantId
- BranchId
- UserId
- Action
- EntityName
- EntityId
- OldValue
- NewValue
- CreatedAt
- IpAddress

Why this matters:

Owners need control.

If money is involved, staff actions must be traceable.

---

## 10. Main Operation Screen

This is the most important screen in the whole system.

If this screen is bad, the product is bad.

The main operation screen should show all resources as live cards.

Example:

```text
Table 1 — Available
Table 2 — Playing — 42 min
Table 3 — Reserved — 8:00 PM
Darts 1 — Available
Chess Table — Busy
```

Each card should show:

- Resource name
- Resource type
- Status
- Active timer
- Current session amount estimate
- Quick actions

Actions:

- Start Session
- Pause Session
- Resume Session
- End Session
- Add Items
- Move Resource
- Print Bill
- Mark Maintenance

Card status colors:

- Available: calm/neutral
- Busy: active/visible
- Reserved: warning/scheduled
- Maintenance: disabled/blocked

Important UX rule:

The cashier should understand the whole venue in 3 seconds.

No complicated menus.

No hidden core actions.

The operation screen is the product.

---

## 11. Recommended Technology Stack

The recommended stack for this project is:

```text
Framework: Next.js
Language: TypeScript
Database: PostgreSQL
ORM: Drizzle ORM
Validation: Zod
Auth: Better Auth / Auth.js / Clerk
Realtime: Ably/Pusher first or Socket.IO on VPS
Cache later: Redis
Background jobs later: BullMQ + Redis
Architecture: Modular Monolith
Deployment: Vercel first or Docker VPS for more backend control
```

---

## 12. Why Next.js + TypeScript

Next.js is suitable because:

- It can build a full SaaS dashboard
- It supports frontend and backend in one project
- It works well with Cursor
- It is fast for UI iteration
- It supports server actions and route handlers
- It can be deployed easily
- It has a large ecosystem

TypeScript is required.

Do not build this in plain JavaScript.

Reason:

This system handles:

- Money
- Invoices
- Tenant permissions
- Sessions
- Users
- Subscriptions
- Reports

Plain JavaScript will become risky.

Use TypeScript for safer development.

---

## 13. Database Choice

Use:

```text
PostgreSQL
```

Do not use:

- MongoDB
- Firebase as main database
- SQLite for production
- Random NoSQL database

Why PostgreSQL:

The data is relational:

- Tenants have branches
- Branches have resources
- Resources have sessions
- Sessions have invoices
- Invoices have items
- Users have roles
- Packages have permissions

This is classic relational business data.

PostgreSQL is the correct database.

---

## 14. ORM Choice

Recommended:

```text
Drizzle ORM
```

Why:

- Type-safe
- SQL-friendly
- Lightweight
- Good for PostgreSQL
- Gives more control than overly abstracted ORMs

Alternative:

```text
Prisma
```

Prisma is easier to start, but Drizzle is cleaner for long-term control.

Recommended choice:

```text
Drizzle ORM
```

---

## 15. Real-Time Strategy

The operation screen needs real-time updates.

Example:

When Cashier A starts Table 2, Owner dashboard and other staff screens should update instantly.

Realtime events:

- SessionStarted
- SessionPaused
- SessionResumed
- SessionEnded
- ResourceStatusChanged
- InvoiceCreated
- PaymentCompleted
- ReservationCreated later

Options:

### Option A: Ably or Pusher

Good for easier production realtime.

Recommended if deploying on Vercel.

### Option B: Socket.IO

Good if hosting on your own VPS.

Requires more backend/server control.

### Recommendation

For easier SaaS launch:

```text
Use Ably or Pusher first
```

For full control later:

```text
Move to Socket.IO + Redis on VPS
```

---

## 16. Architecture Type

Use:

```text
Modular Monolith
```

Do not use microservices first.

Microservices at this stage would be overengineering.

The system should be one application, but internally separated by modules.

Modules:

- Auth
- Tenants
- Branches
- Resources
- Sessions
- Billing
- Products
- Reports
- Subscriptions
- Audit

This gives structure without microservice complexity.

---

## 17. Project Folder Structure

Recommended project structure:

```text
GoSpots/
│
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── forgot-password/
│   │
│   ├── (system-admin)/
│   │   └── admin/
│   │       ├── tenants/
│   │       ├── packages/
│   │       ├── subscriptions/
│   │       └── dashboard/
│   │
│   ├── (tenant)/
│   │   ├── dashboard/
│   │   ├── operations/
│   │   ├── resources/
│   │   ├── sessions/
│   │   ├── invoices/
│   │   ├── reports/
│   │   ├── staff/
│   │   └── settings/
│   │
│   ├── api/
│   │   ├── realtime/
│   │   ├── webhooks/
│   │   └── health/
│   │
│   ├── layout.tsx
│   └── page.tsx
│
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── tenants/
│   │   ├── branches/
│   │   ├── users/
│   │   ├── resources/
│   │   ├── sessions/
│   │   ├── billing/
│   │   ├── products/
│   │   ├── reports/
│   │   ├── subscriptions/
│   │   └── audit/
│   │
│   ├── db/
│   │   ├── schema/
│   │   ├── migrations/
│   │   ├── index.ts
│   │   └── seed.ts
│   │
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── permissions.ts
│   │   ├── tenant.ts
│   │   ├── money.ts
│   │   ├── dates.ts
│   │   └── realtime.ts
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── operations/
│   │   ├── billing/
│   │   └── reports/
│   │
│   ├── actions/
│   │   ├── resources.actions.ts
│   │   ├── sessions.actions.ts
│   │   ├── invoices.actions.ts
│   │   └── subscriptions.actions.ts
│   │
│   ├── validations/
│   │   ├── resource.schema.ts
│   │   ├── session.schema.ts
│   │   ├── invoice.schema.ts
│   │   └── tenant.schema.ts
│   │
│   └── types/
│       ├── auth.ts
│       ├── billing.ts
│       ├── sessions.ts
│       └── tenant.ts
│
├── jobs/
│   ├── subscription-expiry.job.ts
│   └── daily-close-report.job.ts
│
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── permissions.md
│   └── roadmap.md
│
├── drizzle.config.ts
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 18. Business Logic Rule

Do not put business logic directly inside React components.

Bad architecture:

```text
Button clicked
↓
React component calculates price
↓
React component creates invoice
```

Good architecture:

```text
Button clicked
↓
Server action
↓
Session service
↓
Billing service
↓
Database transaction
↓
Realtime event
↓
UI updates
```

UI should display and trigger actions.

Business logic belongs in service/module layer.

---

## 19. Database Design

---

### 19.1 Multi-Tenant Database Model

Use:

```text
Single database
Shared tables
TenantId column
```

This means all customers use the same database, but every tenant-owned record has TenantId.

Example:

```text
Resources
------------------------------------------------
ResourceId | TenantId | BranchId | Name
1          | T001     | B001     | Table 1
2          | T001     | B001     | Table 2
3          | T002     | B010     | Table 1
```

Do not create a separate database for every customer at the beginning.

That would create unnecessary complexity.

---

### 19.2 Required Fields

Every tenant-owned table must include:

```text
TenantId
```

Most operational tables should also include:

```text
BranchId
```

Common fields:

```text
CreatedAt
UpdatedAt
CreatedBy
UpdatedBy
IsActive
```

For money tables:

```text
Currency
Subtotal
DiscountAmount
TaxAmount
TotalAmount
```

---

## 20. Core Database Tables

---

### 20.1 Tenants

Stores subscribed businesses.

Fields:

```text
TenantId
Name
Slug
Email
Phone
Status
PackageId
SubscriptionStatus
CreatedAt
UpdatedAt
```

---

### 20.2 Branches

Stores venue branches.

Fields:

```text
BranchId
TenantId
Name
Address
City
Country
Phone
IsMainBranch
IsActive
CreatedAt
UpdatedAt
```

---

### 20.3 Users

Stores system users.

Fields:

```text
UserId
TenantId
BranchId
FullName
Email
PasswordHash
Role
Status
LastLoginAt
CreatedAt
UpdatedAt
```

System admin users may have no TenantId or use a special system tenant model.

---

### 20.4 Packages

Stores SaaS packages.

Fields:

```text
PackageId
Name
Description
MonthlyPrice
YearlyPrice
MaxBranches
MaxResources
MaxUsers
AllowBar
AllowReservations
AllowStaffRoles
AllowAdvancedReports
AllowMemberships
AllowMultiBranch
IsActive
CreatedAt
UpdatedAt
```

---

### 20.5 Subscriptions

Stores tenant subscription data.

Fields:

```text
SubscriptionId
TenantId
PackageId
Status
StartDate
EndDate
TrialEndsAt
CancelledAt
SuspendedAt
CreatedAt
UpdatedAt
```

---

### 20.6 Resources

Stores playable/rentable resources.

Fields:

```text
ResourceId
TenantId
BranchId
Name
ResourceType
Status
PricingType
HourlyRate
FixedPrice
SortOrder
IsActive
CreatedAt
UpdatedAt
```

ResourceType examples:

```text
Billiard
Snooker
Darts
PlayStation
Chess
Cards
BoardGame
PingPong
Other
```

PricingType examples:

```text
Hourly
Fixed
Free
```

---

### 20.7 Sessions

Stores active and completed sessions.

Fields:

```text
SessionId
TenantId
BranchId
ResourceId
StartedAt
PausedAt
ResumedAt
EndedAt
Status
StartedByUserId
EndedByUserId
DurationMinutes
BaseAmount
Notes
CreatedAt
UpdatedAt
```

---

### 20.8 Invoices

Stores invoice headers.

Fields:

```text
InvoiceId
TenantId
BranchId
SessionId
InvoiceNumber
Subtotal
DiscountAmount
TaxAmount
TotalAmount
PaymentMethod
Status
CreatedByUserId
PaidAt
CreatedAt
UpdatedAt
```

---

### 20.9 InvoiceItems

Stores invoice line items.

Fields:

```text
InvoiceItemId
TenantId
BranchId
InvoiceId
ItemType
ItemName
Quantity
UnitPrice
TotalPrice
CreatedAt
UpdatedAt
```

ItemType examples:

```text
Session
Product
Discount
Custom
```

---

### 20.10 Products

Stores bar/snack products.

Fields:

```text
ProductId
TenantId
BranchId
Name
Category
Price
IsActive
CreatedAt
UpdatedAt
```

Later inventory fields:

```text
StockQuantity
LowStockAlert
PurchasePrice
SupplierId
```

Not MVP.

---

### 20.11 Payments

Stores payment records.

Fields:

```text
PaymentId
TenantId
BranchId
InvoiceId
Amount
PaymentMethod
PaidAt
ReceivedByUserId
CreatedAt
```

---

### 20.12 AuditLogs

Stores important system actions.

Fields:

```text
AuditLogId
TenantId
BranchId
UserId
Action
EntityName
EntityId
OldValue
NewValue
IpAddress
CreatedAt
```

---

## 21. Important Business Rules

---

### 21.1 Tenant Isolation

A user must never access another tenant’s data.

Every query must be filtered by TenantId.

Example:

```text
Get resources where TenantId = currentTenantId
```

Never trust only frontend filtering.

Tenant filtering must happen on the server/database layer.

---

### 21.2 Resource Active Session Rule

One resource cannot have more than one active session.

Before starting a session:

- Check resource status
- Check no active session exists
- Start transaction
- Create session
- Update resource status to Busy
- Commit transaction
- Send realtime event

---

### 21.3 End Session Rule

When ending a session:

- Get active session
- Calculate duration
- Calculate base amount
- Mark session as Closed
- Update resource status to Available
- Create draft/paid invoice
- Send realtime event
- Log action

---

### 21.4 Discount Rule

Discounts must be permission-controlled.

Cashier may have:

- No discount permission
- Max 5% discount
- Max fixed amount discount

Owner/manager can have higher permissions.

Every discount should be logged.

---

### 21.5 Invoice Cancellation Rule

Invoice cancellation must require permission.

Cancellation must create audit log.

Cancelled invoices should not disappear from the system.

Never hard-delete financial records casually.

---

### 21.6 Delete Rule

For important business data, avoid hard delete.

Use soft delete:

```text
IsDeleted
DeletedAt
DeletedBy
```

Especially for:

- Resources
- Products
- Users

Invoices and sessions should not be deleted normally.

They should be cancelled or archived.

---

## 22. MVP Scope

The MVP should include only the core system.

---

### 22.1 MVP Features

Build first:

```text
Login
Tenant setup
Branch setup
Resources
Resource pricing
Main operation screen
Start session
End session
Live timer
Basic billing
Payment method
Simple receipt
Daily report
Basic package permissions
Audit logs
```

---

### 22.2 MVP Excluded Features

Do not build first:

```text
Online payment gateway
Advanced inventory
Customer memberships
Loyalty system
Mobile app
Enterprise dashboard
Multi-country tax system
Complex accounting
AI analytics
QR ordering
Kitchen screen
Full booking engine
```

These are future features.

If you build them too early, the project will become heavy and slow.

---

## 23. Development Phases

---

## Phase 0: Product Finalization

Goal:

Define exactly what the first version includes.

Tasks:

- Confirm product name
- Confirm first package limits
- Confirm roles
- Confirm MVP modules
- Confirm UI layout direction
- Confirm database stack
- Confirm deployment strategy

Output:

- Product blueprint
- Architecture document
- Database plan
- MVP roadmap

---

## Phase 1: Project Foundation

Goal:

Create a clean production-grade project base.

Tasks:

- Create Next.js app with TypeScript
- Setup Tailwind/shadcn UI if used
- Setup ESLint/Prettier
- Setup environment variables
- Setup PostgreSQL
- Setup Drizzle
- Setup database connection
- Create base layouts
- Create auth pages
- Create protected route structure

Output:

- Clean running app
- Database connected
- Basic login structure ready

---

## Phase 2: Authentication and Roles

Goal:

Users can log in and access correct areas.

Tasks:

- Implement auth provider
- Create login page
- Create logout
- Create current user helper
- Create role checking
- Create protected layouts
- Create SystemAdmin route group
- Create Tenant route group

Roles:

- SystemAdmin
- TenantOwner
- BranchManager
- Cashier
- Viewer

Output:

- Secure login
- Role-based routing
- Protected dashboard

---

## Phase 3: Tenant and Subscription Foundation

Goal:

The SaaS owner can create/manage tenant accounts.

Tasks:

- Create tenants table
- Create packages table
- Create subscriptions table
- Create admin tenant list
- Create tenant creation form
- Assign package to tenant
- Activate/suspend tenant
- Implement basic feature limit helper

Output:

- Our-CS Admin can create tenant
- Tenant has package
- Tenant has subscription status

---

## Phase 4: Branch and Resource Management

Goal:

Venue owner can setup their venue resources.

Tasks:

- Create branches table
- Create resources table
- Add branch page
- Add resources page
- Add resource form
- Edit resource
- Disable resource
- Set pricing
- Set resource type
- Show resources list

Output:

- Venue can create tables/games
- Resources have pricing and status

---

## Phase 5: Main Operation Screen

Goal:

Build the heart of the product.

Tasks:

- Create operations dashboard
- Display resources as cards
- Show statuses
- Show active timer
- Add Start Session button
- Add End Session button
- Add Add Items button placeholder
- Add Move Resource placeholder
- Add Print Bill placeholder

Output:

- Cashier can see all resources clearly
- Operations screen becomes usable

---

## Phase 6: Session Engine

Goal:

Start and end sessions correctly.

Tasks:

- Create sessions table
- Build startSession service
- Build endSession service
- Prevent double active sessions
- Calculate duration
- Calculate base amount
- Update resource status
- Add database transactions
- Add audit logging

Output:

- Cashier can start/end real sessions
- Resource status updates correctly
- Duration and amount calculated

---

## Phase 7: Billing Engine

Goal:

Convert sessions into bills.

Tasks:

- Create invoices table
- Create invoice items table
- Create payments table
- Generate invoice number
- Add session line item
- Add manual/custom item
- Apply discount
- Select payment method
- Mark invoice as paid
- Build receipt view

Output:

- Session produces bill
- Bill can be paid
- Receipt can be shown/printed

---

## Phase 8: Daily Reports

Goal:

Owner can see business results.

Tasks:

- Daily revenue report
- Session count
- Revenue by resource
- Revenue by cashier
- Cash/card split
- Open sessions
- Closed sessions
- Cancelled sessions

Output:

- Owner can understand today’s business performance

---

## Phase 9: Realtime Updates

Goal:

Operation screen updates instantly.

Tasks:

- Choose realtime provider
- Setup Ably/Pusher or Socket.IO
- Emit SessionStarted
- Emit SessionEnded
- Emit ResourceStatusChanged
- Update dashboard live
- Test multiple browser windows

Output:

- All connected users see live venue status

---

## Phase 10: Package Permissions

Goal:

Features and limits depend on package.

Tasks:

- Create package feature system
- Enforce max resources
- Enforce max users
- Hide locked features
- Block unauthorized actions
- Show upgrade prompts later

Output:

- SaaS package model works

---

## Phase 11: Audit Logs

Goal:

Track important actions.

Tasks:

- Create audit log service
- Log session start/end
- Log invoice cancellation
- Log discounts
- Log price changes
- Log resource changes
- Create admin audit log page

Output:

- Owner can see who did what

---

## Phase 12: Production Hardening

Goal:

Prepare for real users.

Tasks:

- Error handling
- Loading states
- Empty states
- Form validation
- Security checks
- Tenant isolation testing
- Backups
- Logging
- Basic monitoring
- Deployment pipeline

Output:

- First production-ready version

---

## 24. First Build Order for Cursor

Give Cursor small, strict tasks.

Do not ask Cursor to “build the whole SaaS.”

That will create garbage.

Use this order:

---

### Step 1

Create the Next.js TypeScript project structure with:

- app route groups
- src/modules
- src/db
- src/components
- src/lib
- src/actions
- src/validations

No business features yet.

---

### Step 2

Install and configure:

- Tailwind
- shadcn/ui
- Drizzle
- PostgreSQL connection
- Zod
- Auth provider

---

### Step 3

Create database schema for:

- tenants
- branches
- users
- packages
- subscriptions
- resources
- sessions
- invoices
- invoiceItems
- payments
- auditLogs

---

### Step 4

Create seed data:

- One system admin
- One tenant
- One branch
- One owner
- One cashier
- Starter package
- Standard package
- Example resources

---

### Step 5

Build login and protected layouts.

---

### Step 6

Build tenant admin page.

---

### Step 7

Build resource management.

---

### Step 8

Build main operation screen.

---

### Step 9

Build start/end session logic.

---

### Step 10

Build billing logic.

---

### Step 11

Build daily report.

---

### Step 12

Add realtime.

---

## 25. First Cursor Prompt

Use this with Cursor first:

```text
We are building a real production SaaS called GoSpots.

It is a multi-tenant management system for billiard and gaming centers.

Tech stack:
- Next.js App Router
- TypeScript
- PostgreSQL
- Drizzle ORM
- Zod
- Tailwind CSS
- shadcn/ui
- Modular monolith architecture

Important architecture rules:
- Do not put business logic inside React components.
- Use server actions or service functions for mutations.
- Every tenant-owned table must include TenantId.
- Operational tables must include BranchId.
- Build clean modules under src/modules.
- Use src/db/schema for Drizzle schema.
- Use src/lib for shared helpers.
- Use src/components for UI components.
- Use src/actions for server actions.
- Use Zod for validation.

Create only the initial project structure first.
Do not build all features yet.

Create folders:
app/(auth)
app/(system-admin)/admin
app/(tenant)/dashboard
app/(tenant)/operations
app/(tenant)/resources
app/(tenant)/sessions
app/(tenant)/invoices
app/(tenant)/reports
app/(tenant)/staff
app/(tenant)/settings
src/modules/auth
src/modules/tenants
src/modules/branches
src/modules/users
src/modules/resources
src/modules/sessions
src/modules/billing
src/modules/products
src/modules/reports
src/modules/subscriptions
src/modules/audit
src/db/schema
src/lib
src/components/ui
src/components/layout
src/components/operations
src/actions
src/validations
src/types
docs

Also create docs/architecture.md, docs/database.md, docs/roadmap.md with placeholder headings.
```

---

## 26. Second Cursor Prompt

After the structure is created, use this:

```text
Now create the first Drizzle database schema for GoSpots.

Tables needed:
- tenants
- branches
- users
- packages
- subscriptions
- resources
- sessions
- invoices
- invoiceItems
- payments
- auditLogs

Rules:
- Use PostgreSQL.
- Use UUID primary keys.
- Every tenant-owned table must include tenantId.
- Operational tables must include branchId.
- Add createdAt and updatedAt timestamps.
- Use enums where appropriate:
  - tenantStatus
  - subscriptionStatus
  - userRole
  - resourceType
  - resourceStatus
  - pricingType
  - sessionStatus
  - invoiceStatus
  - paymentMethod
- Do not create UI yet.
- Only create schema files and database index export.
```

---

## 27. Third Cursor Prompt

After schema:

```text
Create seed data for GoSpots.

Seed:
- System admin user
- Starter package
- Standard package
- Pro package
- Enterprise package
- Demo tenant
- Demo branch
- Demo owner
- Demo cashier
- Demo resources:
  - Table 1 Billiard 40 PLN/hour
  - Table 2 Billiard 40 PLN/hour
  - Snooker 1 50 PLN/hour
  - Darts 1 20 PLN/hour
  - PlayStation 1 35 PLN/hour

Keep seed clean and reusable.
```

---

## 28. Fourth Cursor Prompt

After seed:

```text
Build the tenant operation screen UI.

Requirements:
- Page path: app/(tenant)/operations/page.tsx
- Display resources as cards.
- Each card shows:
  - Resource name
  - Resource type
  - Status
  - Price
  - Active timer placeholder
  - Start Session button
  - End Session button disabled if not busy
  - Add Items button placeholder
  - Print Bill button placeholder
- Do not implement full session logic yet.
- Use clean shadcn/ui components.
- Keep the UI responsive.
```

---

## 29. Fifth Cursor Prompt

After operation UI:

```text
Implement session start and end logic.

Rules:
- Use server actions.
- Start session:
  - Validate tenantId, branchId, resourceId, userId.
  - Check resource is Available.
  - Check no active session exists for this resource.
  - Create session with status Active.
  - Update resource status to Busy.
  - Create audit log.
  - Use database transaction.

- End session:
  - Find active session.
  - Calculate duration in minutes.
  - Calculate base amount based on hourly rate.
  - Mark session Closed.
  - Update resource status to Available.
  - Create draft invoice with one session invoice item.
  - Create audit log.
  - Use database transaction.

Do not add products yet.
```

---

## 30. Build Priorities

The top priority is:

```text
Operation screen + session engine + billing
```

Everything else is secondary.

The first sellable version is not:

```text
A beautiful website
```

The first sellable version is:

```text
A cashier can run the venue for one full day without manual calculation.
```

That is the real test.

---

## 31. Final MVP Definition

The MVP is complete when:

- System admin can create a tenant
- Tenant owner can create resources
- Cashier can start a session
- Cashier can end a session
- System calculates time and price
- System creates bill
- Payment method is recorded
- Daily report works
- Tenant data is isolated
- Package limits work at basic level
- Audit logs record important actions

---

## 32. Final Warning

Do not build advanced features before the core works.

Bad order:

```text
Build landing page
Build memberships
Build online payment
Build enterprise dashboard
Build AI reports
Then think about sessions
```

Correct order:

```text
Build resources
Build sessions
Build billing
Build reports
Then expand
```

The product lives or dies on this:

```text
Can a real cashier use it during a busy night without confusion?
```

If yes, the product has value.

If no, the rest does not matter.

---

## 33. Final Recommended Stack

Use:

```text
Next.js
TypeScript
PostgreSQL
Drizzle ORM
Zod
Tailwind CSS
shadcn/ui
Ably/Pusher for realtime first
Redis later
Modular Monolith
```

This is serious, modern, manageable, and suitable for building with Cursor.

---

## 34. One-Sentence Project Definition

**GoSpots is a multi-tenant SaaS platform for billiard and gaming venues that manages live resources, session timers, billing, staff activity, subscriptions, and daily revenue from one real-time operation dashboard.**

---

## 35. First Thing To Do Now

Start with documentation and structure.

Do not code features immediately.

First create:

```text
docs/architecture.md
docs/database.md
docs/roadmap.md
```

Then create the Next.js project.

Then create database schema.

Then build the operation screen.

Then implement sessions.

That is the correct path.

