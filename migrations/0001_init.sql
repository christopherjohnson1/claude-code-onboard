-- Migration 0001: initial schema.
--
-- This directory is PROTECTED. The `protect-files.sh` PreToolUse hook
-- (matcher Edit|Write) blocks Claude from editing anything under `migrations/`
-- with `exit 2`, even in bypassPermissions mode. To change the schema, add a
-- NEW migration file rather than editing an existing one.

CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users (email);
