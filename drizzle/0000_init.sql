CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection_references` (
	`collection_id` text NOT NULL,
	`reference_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`note` text,
	`added_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`collection_id`, `reference_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_references_ref_idx` ON `collection_references` (`reference_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'collection' NOT NULL,
	`brief` text,
	`cover_image_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`cover_image_id`) REFERENCES `reference_images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collections_updated_idx` ON `collections` (`updated_at`);--> statement-breakpoint
CREATE TABLE `design_analyses` (
	`reference_id` text PRIMARY KEY NOT NULL,
	`observations` text,
	`interesting` text,
	`typography_notes` text,
	`color_notes` text,
	`layout_notes` text,
	`interaction_notes` text,
	`ux_strengths` text,
	`limitations` text,
	`usage_ideas` text,
	`ai_suggestions` text,
	`ai_suggestions_reviewed` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reference_images` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`label` text,
	`original_key` text NOT NULL,
	`preview_key` text NOT NULL,
	`thumb_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`preview_width` integer NOT NULL,
	`preview_height` integer NOT NULL,
	`thumb_width` integer NOT NULL,
	`thumb_height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`dhash` text NOT NULL,
	`viewport` text DEFAULT 'desktop' NOT NULL,
	`viewport_width` integer,
	`viewport_height` integer,
	`theme` text DEFAULT 'unknown' NOT NULL,
	`screenshot_type` text DEFAULT 'full_page' NOT NULL,
	`source` text DEFAULT 'upload' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reference_images_ref_idx` ON `reference_images` (`reference_id`,`position`);--> statement-breakpoint
CREATE INDEX `reference_images_sha_idx` ON `reference_images` (`sha256`);--> statement-breakpoint
CREATE TABLE `reference_terms` (
	`reference_id` text NOT NULL,
	`term_id` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`reference_id`, `term_id`),
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reference_terms_term_idx` ON `reference_terms` (`term_id`);--> statement-breakpoint
CREATE TABLE `references` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`site_name` text,
	`source_url` text,
	`source_domain` text,
	`description` text,
	`industry_id` text,
	`page_type_id` text,
	`screenshot_type` text DEFAULT 'full_page' NOT NULL,
	`captured_theme` text DEFAULT 'unknown' NOT NULL,
	`supports_dark_mode` text DEFAULT 'unknown' NOT NULL,
	`captured_viewport` text DEFAULT 'desktop' NOT NULL,
	`status` text DEFAULT 'to_review' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`attribution` text,
	`license_notes` text,
	`captured_at` text,
	`search_text` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`industry_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`page_type_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `references_created_idx` ON `references` (`created_at`);--> statement-breakpoint
CREATE INDEX `references_updated_idx` ON `references` (`updated_at`);--> statement-breakpoint
CREATE INDEX `references_title_idx` ON `references` (`title`);--> statement-breakpoint
CREATE INDEX `references_industry_idx` ON `references` (`industry_id`);--> statement-breakpoint
CREATE INDEX `references_page_type_idx` ON `references` (`page_type_id`);--> statement-breakpoint
CREATE INDEX `references_favorite_idx` ON `references` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `references_domain_idx` ON `references` (`source_domain`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`is_built_in` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_kind_slug_unique` ON `terms` (`kind`,`slug`);--> statement-breakpoint
CREATE INDEX `terms_kind_idx` ON `terms` (`kind`);