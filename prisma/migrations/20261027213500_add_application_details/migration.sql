-- AlterTable
ALTER TABLE `charities` ADD COLUMN `contactName` VARCHAR(200) NULL,
    ADD COLUMN `contactPosition` VARCHAR(200) NULL;

-- AlterTable
ALTER TABLE `grants` ADD COLUMN `accountsDate` DATE NULL,
    ADD COLUMN `employees` INTEGER NULL,
    ADD COLUMN `expenditure` DECIMAL(12, 2) NULL,
    ADD COLUMN `governmentFunding` DECIMAL(12, 2) NULL,
    ADD COLUMN `income` DECIMAL(12, 2) NULL,
    ADD COLUMN `otherFunders` VARCHAR(1000) NULL,
    ADD COLUMN `penceInPound` TINYINT NULL,
    ADD COLUMN `submissionReference` VARCHAR(100) NULL,
    ADD COLUMN `trustees` INTEGER NULL,
    ADD COLUMN `volunteers` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `grants_submissionReference_key` ON `grants`(`submissionReference`);

