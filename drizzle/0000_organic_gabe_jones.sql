CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`secret` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`taps` integer NOT NULL,
	`duration` integer NOT NULL
);
