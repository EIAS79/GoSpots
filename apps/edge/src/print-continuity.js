import { canonicalJson } from './canonical.js';

function nowIso() { return new Date().toISOString(); }

export class PrintContinuityStore {
  constructor(store) {
    this.db = store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edge_print_jobs (
        job_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL,
        result_json TEXT,
        error_text TEXT,
        staged_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_edge_print_jobs_state ON edge_print_jobs(state, staged_at);
    `);
  }

  stage(job) {
    if (!job?.id) throw new Error('Print job id is required');
    const payload = canonicalJson(job);
    const existing = this.db.prepare('SELECT * FROM edge_print_jobs WHERE job_id=?').get(job.id);
    if (existing) {
      if (existing.payload_json !== payload) throw new Error('IDEMPOTENCY_CONFLICT: print job changed after it was staged');
      return this.#row(existing);
    }
    const now = nowIso();
    const row = this.db.prepare(`INSERT INTO edge_print_jobs(job_id,payload_json,state,staged_at,updated_at)
      VALUES(?,?,'CLAIMED',?,?) RETURNING *`).get(job.id, payload, now, now);
    return this.#row(row);
  }

  next() {
    const row = this.db.prepare(`SELECT * FROM edge_print_jobs
      WHERE state IN ('CLAIMED','PRINTED_PENDING_ACK','FAILED_PENDING_ACK')
      ORDER BY staged_at ASC LIMIT 1`).get();
    return row ? this.#row(row) : null;
  }

  markPrinted(jobId, result) {
    this.db.prepare("UPDATE edge_print_jobs SET state='PRINTED_PENDING_ACK',result_json=?,error_text=NULL,updated_at=? WHERE job_id=?")
      .run(canonicalJson(result ?? {}), nowIso(), jobId);
  }

  markFailed(jobId, error) {
    this.db.prepare("UPDATE edge_print_jobs SET state='FAILED_PENDING_ACK',error_text=?,updated_at=? WHERE job_id=?")
      .run(String(error ?? '').slice(0, 1000), nowIso(), jobId);
  }

  markAcknowledged(jobId) {
    this.db.prepare("UPDATE edge_print_jobs SET state='ACKNOWLEDGED',updated_at=? WHERE job_id=?").run(nowIso(), jobId);
  }

  diagnostics() {
    const row = this.db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN state='CLAIMED' THEN 1 ELSE 0 END) claimed,
      SUM(CASE WHEN state='PRINTED_PENDING_ACK' THEN 1 ELSE 0 END) printed_pending_ack,
      SUM(CASE WHEN state='FAILED_PENDING_ACK' THEN 1 ELSE 0 END) failed_pending_ack
      FROM edge_print_jobs`).get();
    return {
      total: Number(row.total ?? 0),
      claimed: Number(row.claimed ?? 0),
      printedPendingAck: Number(row.printed_pending_ack ?? 0),
      failedPendingAck: Number(row.failed_pending_ack ?? 0),
    };
  }

  #row(row) {
    return {
      jobId: row.job_id,
      job: JSON.parse(row.payload_json),
      state: row.state,
      result: row.result_json ? JSON.parse(row.result_json) : null,
      error: row.error_text,
      stagedAt: row.staged_at,
      updatedAt: row.updated_at,
    };
  }
}
