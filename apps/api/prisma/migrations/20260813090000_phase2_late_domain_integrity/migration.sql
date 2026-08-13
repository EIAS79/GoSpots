-- Phase 2 — late-domain integrity, expand step.
--
-- These constraints are deliberately NOT VALID where PostgreSQL supports it:
-- existing historical rows do not block deployment, while all new/updated rows
-- are protected immediately. Validation is a separate contract step after the
-- orphan audit documented in docs/architecture/phase2-integrity.md.

-- Composite parent keys let child FKs enforce tenant equality, not merely that a
-- globally unique parent id exists in some other Shop.
ALTER TABLE "TicketProduct" ADD CONSTRAINT "TicketProduct_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "RfidWallet" ADD CONSTRAINT "RfidWallet_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "RfidCredential" ADD CONSTRAINT "RfidCredential_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "RfidWalletEntry" ADD CONSTRAINT "RfidWalletEntry_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "InsightSnapshot" ADD CONSTRAINT "InsightSnapshot_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "AiInsightRun" ADD CONSTRAINT "AiInsightRun_shop_id_uq" UNIQUE ("shopId", "id");
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_shop_id_uq" UNIQUE ("shopId", "id");

-- Every late-domain row belongs to a real Shop.
ALTER TABLE "TicketProduct" ADD CONSTRAINT "TicketProduct_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "TicketScan" ADD CONSTRAINT "TicketScan_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "RfidWallet" ADD CONSTRAINT "RfidWallet_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "RfidCredential" ADD CONSTRAINT "RfidCredential_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "RfidWalletEntry" ADD CONSTRAINT "RfidWalletEntry_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "RfidTap" ADD CONSTRAINT "RfidTap_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AutomationExecutionStep" ADD CONSTRAINT "AutomationExecutionStep_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AutomationDeadLetter" ADD CONSTRAINT "AutomationDeadLetter_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "InsightSnapshot" ADD CONSTRAINT "InsightSnapshot_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AiInsightRun" ADD CONSTRAINT "AiInsightRun_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AiInsightFeedback" ADD CONSTRAINT "AiInsightFeedback_shop_fk"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE NOT VALID;

-- Ticket/access lineage. History-bearing parent rows use RESTRICT so a delete
-- cannot erase or detach already-issued financial/access evidence.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_product_same_shop_fk"
  FOREIGN KEY ("shopId", "productId") REFERENCES "TicketProduct"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_order_same_shop_fk"
  FOREIGN KEY ("shopId", "orderId") REFERENCES "TicketOrder"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "TicketScan" ADD CONSTRAINT "TicketScan_ticket_same_shop_fk"
  FOREIGN KEY ("shopId", "ticketId") REFERENCES "Ticket"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "RfidCredential" ADD CONSTRAINT "RfidCredential_wallet_same_shop_fk"
  FOREIGN KEY ("shopId", "walletId") REFERENCES "RfidWallet"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "RfidWalletEntry" ADD CONSTRAINT "RfidWalletEntry_wallet_same_shop_fk"
  FOREIGN KEY ("shopId", "walletId") REFERENCES "RfidWallet"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "RfidWalletEntry" ADD CONSTRAINT "RfidWalletEntry_reversal_same_shop_fk"
  FOREIGN KEY ("shopId", "reversalOfId") REFERENCES "RfidWalletEntry"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "RfidTap" ADD CONSTRAINT "RfidTap_credential_same_shop_fk"
  FOREIGN KEY ("shopId", "credentialId") REFERENCES "RfidCredential"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "RfidTap" ADD CONSTRAINT "RfidTap_wallet_same_shop_fk"
  FOREIGN KEY ("shopId", "walletId") REFERENCES "RfidWallet"("shopId", "id") ON DELETE RESTRICT NOT VALID;

-- Automation lineage. Execution history keeps its rule; execution deletion owns
-- only its internal steps/dead-letter record.
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_rule_same_shop_fk"
  FOREIGN KEY ("shopId", "ruleId") REFERENCES "AutomationRule"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "AutomationExecutionStep" ADD CONSTRAINT "AutomationStep_execution_same_shop_fk"
  FOREIGN KEY ("shopId", "executionId") REFERENCES "AutomationExecution"("shopId", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AutomationDeadLetter" ADD CONSTRAINT "AutomationDead_execution_same_shop_fk"
  FOREIGN KEY ("shopId", "executionId") REFERENCES "AutomationExecution"("shopId", "id") ON DELETE CASCADE NOT VALID;

-- AI lineage is immutable audit evidence: snapshot -> run -> insight -> feedback.
ALTER TABLE "AiInsightRun" ADD CONSTRAINT "AiInsightRun_snapshot_same_shop_fk"
  FOREIGN KEY ("shopId", "snapshotId") REFERENCES "InsightSnapshot"("shopId", "id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_run_same_shop_fk"
  FOREIGN KEY ("shopId", "runId") REFERENCES "AiInsightRun"("shopId", "id") ON DELETE CASCADE NOT VALID;
ALTER TABLE "AiInsightFeedback" ADD CONSTRAINT "AiInsightFeedback_insight_same_shop_fk"
  FOREIGN KEY ("shopId", "insightId") REFERENCES "AiInsight"("shopId", "id") ON DELETE CASCADE NOT VALID;

-- Database-level domain invariants. NOT VALID protects upgrades with historical
-- dirty rows while immediately rejecting new violations.
ALTER TABLE "TicketProduct" ADD CONSTRAINT "TicketProduct_price_nonnegative_ck"
  CHECK ("priceMinor" >= 0) NOT VALID;
ALTER TABLE "TicketProduct" ADD CONSTRAINT "TicketProduct_scan_count_ck"
  CHECK ("maxScans" > 0) NOT VALID;
ALTER TABLE "TicketProduct" ADD CONSTRAINT "TicketProduct_validity_ck"
  CHECK ("validityMinutes" IS NULL OR "validityMinutes" > 0) NOT VALID;
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_total_nonnegative_ck"
  CHECK ("totalMinor" >= 0) NOT VALID;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_scan_bounds_ck"
  CHECK ("scansUsed" >= 0 AND "maxScans" > 0 AND "scansUsed" <= "maxScans") NOT VALID;
ALTER TABLE "RfidWallet" ADD CONSTRAINT "RfidWallet_balance_nonnegative_ck"
  CHECK ("balanceMinor" >= 0) NOT VALID;
ALTER TABLE "RfidWallet" ADD CONSTRAINT "RfidWallet_version_nonnegative_ck"
  CHECK ("version" >= 0) NOT VALID;
ALTER TABLE "RfidWalletEntry" ADD CONSTRAINT "RfidWalletEntry_balance_nonnegative_ck"
  CHECK ("balanceAfterMinor" >= 0) NOT VALID;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_attempt_nonnegative_ck"
  CHECK ("attempt" >= 0) NOT VALID;
ALTER TABLE "AutomationExecutionStep" ADD CONSTRAINT "AutomationStep_index_nonnegative_ck"
  CHECK ("stepIndex" >= 0) NOT VALID;
ALTER TABLE "AutomationDeadLetter" ADD CONSTRAINT "AutomationDead_replay_nonnegative_ck"
  CHECK ("replayCount" >= 0) NOT VALID;
ALTER TABLE "AiInsightFeedback" ADD CONSTRAINT "AiInsightFeedback_rating_ck"
  CHECK ("rating" BETWEEN -1 AND 1) NOT VALID;
