# Data map (GDPR / privacy inventory)

**As of:** 2026-07-22  
**Related:** API `apps/api/src/modules/gdpr/**`, [`RETENTION_POLICY.md`](./RETENTION_POLICY.md)

This is an inventory of personal / operational data categories stored by GoSpots/GoSpots. It is not legal advice.

| Category | Examples | Where stored | Typical purpose | Notes |
|----------|----------|--------------|-----------------|-------|
| Owner account | email, password hash, name | `User` | Auth | MFA TOTP secret encrypted at rest |
| Staff account | email, invite tokens | `User` / membership | Ops access | Permissions via `MembershipPermission` rows |
| Sessions / devices | refresh family, UA | auth session tables | Security | List/revoke via dashboard |
| Venue profile | name, address, hours, media | `Shop` + related | Public + ops | Timezone IANA |
| Guests (bookings) | name, email, phone, tokens | `Reservation` (+ hash fields) | Booking / status links | Prefer hash; plaintext clear scripts exist |
| Guest chat / events | messages, contact fields | guest chat / event request models | Comms | Tokenized public flows |
| Reviews | author fields, body | reviews | Reputation | Moderation |
| Finance | amounts, payment method enums | orders, transactions, ledger, losses | Ops accounting | Retain for legal/financial duty |
| Audit logs | actor, action, meta | audit tables | Security / ops | May contain identifiers |
| Mail outbox | recipient, template keys | `MailOutbox` | Delivery | Bodies may be omitted from staff UI |
| Consent / DSAR | consent records, export jobs | GDPR module tables | Compliance | See retention policy |
| Uploads | images | media storage | Gallery/menu | Opaque public GET today |

**Processors (typical):** Neon (DB), Render (API), Vercel (web), Resend (email), Lemon Squeezy (subscriptions), optional Sentry.

Update this table when adding PII fields.
