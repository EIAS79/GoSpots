/**
 * Jest setup for concurrency config only.
 * Does not load Nest / Prisma — skip gate stays cheap without Neon.
 */
process.env.TZ ??= 'UTC';
