-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `token_hash` CHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `expires_at` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`token_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `display_name` VARCHAR(191) NOT NULL DEFAULT 'Alex Morgan',
    `workspace_name` VARCHAR(191) NOT NULL DEFAULT 'Personal workspace',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `week_starts_on` VARCHAR(16) NOT NULL DEFAULT 'Sunday',
    `notifications` BOOLEAN NOT NULL DEFAULT true,
    `profile_picture` LONGTEXT NOT NULL DEFAULT '',

    UNIQUE INDEX `settings_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `occurred_on` VARCHAR(10) NOT NULL,
    `recurring` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `transactions_user_id_occurred_on_idx`(`user_id`, `occurred_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `symbol` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `value_cents` INTEGER NOT NULL DEFAULT 0,
    `change_percent` DOUBLE NOT NULL DEFAULT 0,
    `allocation` DOUBLE NOT NULL DEFAULT 0,
    `cost_basis_cents` INTEGER NOT NULL DEFAULT 0,
    `day_change_cents` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `assets_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trades` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `pair` VARCHAR(32) NOT NULL,
    `setup` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(32) NOT NULL,
    `result_cents` INTEGER NOT NULL DEFAULT 0,
    `traded_on` VARCHAR(10) NOT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `trade_status` VARCHAR(16) NOT NULL DEFAULT 'closed',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `trades_user_id_traded_on_idx`(`user_id`, `traded_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target_cents` INTEGER NOT NULL DEFAULT 0,
    `current_cents` INTEGER NOT NULL DEFAULT 0,
    `target_date` VARCHAR(10) NOT NULL,
    `color` VARCHAR(32) NOT NULL DEFAULT 'mint',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `goals_user_id_target_date_idx`(`user_id`, `target_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goal_contributions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `goal_id` INTEGER NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `funded_on` VARCHAR(10) NOT NULL,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `goal_contributions_user_id_goal_id_funded_on_idx`(`user_id`, `goal_id`, `funded_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `event_type` VARCHAR(32) NOT NULL,
    `amount_cents` INTEGER NOT NULL DEFAULT 0,
    `event_date` VARCHAR(10) NOT NULL,
    `notes` TEXT NOT NULL DEFAULT '',
    `source` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `events_user_id_event_date_idx`(`user_id`, `event_date`),
    INDEX `events_user_id_source_idx`(`user_id`, `source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashflow_incomes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `expected_income_cents` INTEGER NOT NULL DEFAULT 0,
    `period_start` VARCHAR(10) NOT NULL,
    `period_end` VARCHAR(10) NOT NULL,
    `favorite_plan_id` INTEGER NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `cashflow_incomes_user_id_period_start_idx`(`user_id`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashflow_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `income_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `period_start` VARCHAR(10) NOT NULL,
    `period_end` VARCHAR(10) NOT NULL,
    `expected_income_cents` INTEGER NOT NULL DEFAULT 0,
    `savings_target_cents` INTEGER NOT NULL DEFAULT 0,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `cashflow_plans_user_id_income_id_period_start_idx`(`user_id`, `income_id`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashflow_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `planned_cents` INTEGER NOT NULL DEFAULT 0,
    `spent_cents` INTEGER NOT NULL DEFAULT 0,
    `due_on` VARCHAR(10) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'planned',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `cashflow_items_user_id_plan_id_due_on_idx`(`user_id`, `plan_id`, `due_on`),
    UNIQUE INDEX `cashflow_items_plan_expense_identity`(`plan_id`, `label`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `settings` ADD CONSTRAINT `settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trades` ADD CONSTRAINT `trades_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goals` ADD CONSTRAINT `goals_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goal_contributions` ADD CONSTRAINT `goal_contributions_goal_id_fkey` FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashflow_incomes` ADD CONSTRAINT `cashflow_incomes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashflow_plans` ADD CONSTRAINT `cashflow_plans_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashflow_plans` ADD CONSTRAINT `cashflow_plans_income_id_fkey` FOREIGN KEY (`income_id`) REFERENCES `cashflow_incomes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashflow_items` ADD CONSTRAINT `cashflow_items_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `cashflow_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
