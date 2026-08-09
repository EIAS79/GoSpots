-- Per-zone hourly surcharge added on top of the configured gaming rate.
ALTER TABLE "GamingSection"
ADD COLUMN "hourlyPriceAddon" DECIMAL(19,4) NOT NULL DEFAULT 0;
