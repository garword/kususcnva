-- Migration: Add canva_accounts table
-- Date: 2026-01-12
-- Description: Create table for multi-account support and migrate existing single-account settings.

-- 1. Create Table
CREATE TABLE IF NOT EXISTS canva_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cookie TEXT NOT NULL,           -- Session Cookie (Main Auth)
  email TEXT,                     -- Auto-discovered Profile Email
  team_id TEXT,                   -- Auto-discovered Team ID
  member_count INTEGER DEFAULT 0, -- Tracked member count
  max_slots INTEGER DEFAULT 500,  -- Slot limit (Default 500)
  is_active BOOLEAN DEFAULT 1,    -- active=1, inactive=0
  last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrate Data from 'settings' (Single Account Preservation)
-- We check if 'canva_cookie' exists in settings. If so, we insert it as the first account.
INSERT INTO canva_accounts (cookie, team_id, member_count)
SELECT 
    (SELECT value FROM settings WHERE key = 'canva_cookie') as cookie,
    (SELECT value FROM settings WHERE key = 'canva_team_id') as team_id,
    COALESCE((SELECT value FROM settings WHERE key = 'team_member_count'), '0') as member_count
WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'canva_cookie');

-- 3. Note: We do NOT delete from settings yet, to allow easy rollback.
-- The code will prioritize `canva_accounts`, if empty -> fallback to settings (legacy).
