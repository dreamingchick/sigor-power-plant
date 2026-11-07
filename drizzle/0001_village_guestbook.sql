CREATE TABLE guestbook_players (
  player text PRIMARY KEY NOT NULL,
  secret_hash text NOT NULL,
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE guestbook_posts (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  player text NOT NULL,
  name text NOT NULL,
  body text NOT NULL,
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX guestbook_posts_player_created_idx ON guestbook_posts(player,created_at);
--> statement-breakpoint
CREATE TABLE guestbook_likes (
  post_id integer NOT NULL,
  player text NOT NULL,
  PRIMARY KEY(post_id,player)
);
--> statement-breakpoint
CREATE TABLE guestbook_rate (
  player text PRIMARY KEY NOT NULL,
  last_post_at integer NOT NULL
);
