import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const runs=sqliteTable('runs',{id:text('id').primaryKey(),player:text('player').notNull(),secret:text('secret').notNull(),name:text('name').notNull(),mode:text('mode').notNull(),taps:integer('taps').notNull(),duration:integer('duration').notNull()});

export const guestbookPlayers = sqliteTable('guestbook_players', {
  player: text('player').primaryKey(),
  secretHash: text('secret_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const guestbookPosts = sqliteTable('guestbook_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  player: text('player').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const guestbookLikes = sqliteTable('guestbook_likes', {
  postId: integer('post_id').notNull(),
  player: text('player').notNull(),
}, table => [
  primaryKey({ columns: [table.postId, table.player] }),
]);
export const guestbookRate = sqliteTable('guestbook_rate', {
  player: text('player').primaryKey(),
  lastPostAt: integer('last_post_at').notNull(),
});
