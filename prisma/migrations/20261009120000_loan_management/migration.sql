CREATE TABLE `loans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `lender` VARCHAR(191) NOT NULL DEFAULT '',
  `principal_cents` INTEGER NOT NULL,
  `interest_rate` DOUBLE NOT NULL DEFAULT 0,
  `started_on` VARCHAR(10) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `loans_user_id_started_on_idx` (`user_id`, `started_on`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `loan_repayment_plans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `loan_id` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `amount_cents` INTEGER NOT NULL,
  `frequency` VARCHAR(32) NOT NULL,
  `next_due_on` VARCHAR(10) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `loan_repayment_plans_user_id_loan_id_next_due_on_idx` (`user_id`, `loan_id`, `next_due_on`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `loan_payments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `loan_id` INTEGER NOT NULL,
  `plan_id` INTEGER NULL,
  `amount_cents` INTEGER NOT NULL,
  `paid_on` VARCHAR(10) NOT NULL,
  `note` VARCHAR(500) NOT NULL DEFAULT '',
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `loan_payments_user_id_loan_id_paid_on_idx` (`user_id`, `loan_id`, `paid_on`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `loans` ADD CONSTRAINT `loans_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loan_repayment_plans` ADD CONSTRAINT `loan_repayment_plans_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loan_payments` ADD CONSTRAINT `loan_payments_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `loan_payments` ADD CONSTRAINT `loan_payments_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `loan_repayment_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
