-- CreateTable
CREATE TABLE `grants` (
    `id` VARCHAR(36) NOT NULL,
    `charityId` VARCHAR(36) NOT NULL,
    `categoryId` VARCHAR(36) NOT NULL,
    `statusId` VARCHAR(36) NOT NULL,
    `purpose` VARCHAR(200) NULL,
    `dateSubmitted` DATE NOT NULL,
    `amountRequested` DECIMAL(12, 2) NOT NULL,
    `amountAgreed` DECIMAL(12, 2) NULL,
    `decisionDate` DATE NULL,
    `paymentDate` DATE NULL,
    `createdById` VARCHAR(36) NULL,
    `updatedById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `grants_charityId_dateSubmitted_idx`(`charityId`, `dateSubmitted`),
    INDEX `grants_statusId_idx`(`statusId`),
    INDEX `grants_categoryId_idx`(`categoryId`),
    INDEX `grants_dateSubmitted_idx`(`dateSubmitted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `grants` ADD CONSTRAINT `grants_charityId_fkey` FOREIGN KEY (`charityId`) REFERENCES `charities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grants` ADD CONSTRAINT `grants_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `grant_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grants` ADD CONSTRAINT `grants_statusId_fkey` FOREIGN KEY (`statusId`) REFERENCES `grant_statuses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grants` ADD CONSTRAINT `grants_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grants` ADD CONSTRAINT `grants_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
