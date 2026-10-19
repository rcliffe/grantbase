-- CreateTable
CREATE TABLE `charities` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `registrationNumber` VARCHAR(20) NULL,
    `addressLine1` VARCHAR(200) NULL,
    `addressLine2` VARCHAR(200) NULL,
    `town` VARCHAR(100) NULL,
    `county` VARCHAR(100) NULL,
    `postcode` VARCHAR(20) NULL,
    `country` VARCHAR(100) NULL,
    `contactEmail` VARCHAR(320) NULL,
    `website` VARCHAR(500) NULL,
    `createdById` VARCHAR(36) NULL,
    `updatedById` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `charities_registrationNumber_key`(`registrationNumber`),
    INDEX `charities_name_idx`(`name`),
    INDEX `charities_town_idx`(`town`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `charities` ADD CONSTRAINT `charities_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `charities` ADD CONSTRAINT `charities_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
