ALTER TABLE `account` ADD `id_token` text;--> statement-breakpoint
ALTER TABLE `account` ADD `access_token_expires_at` integer;--> statement-breakpoint
ALTER TABLE `account` ADD `refresh_token_expires_at` integer;--> statement-breakpoint
ALTER TABLE `account` ADD `scope` text;