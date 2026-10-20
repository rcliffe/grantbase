-- AlterTable
ALTER TABLE `grant_statuses` ADD COLUMN `stage` ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID') NULL;

-- Give existing statuses with the usual names their process stage. Administrators
-- can change these under Settings → Grant statuses.
UPDATE `grant_statuses` SET `stage` = 'SUBMITTED' WHERE `name` IN ('Submitted', 'Under review');
UPDATE `grant_statuses` SET `stage` = 'APPROVED' WHERE `name` IN ('Awarded', 'Approved');
UPDATE `grant_statuses` SET `stage` = 'REJECTED' WHERE `name` IN ('Declined', 'Rejected');
UPDATE `grant_statuses` SET `stage` = 'PAID' WHERE `name` = 'Paid';
