-- Cloudflare D1 Database Schema for Time Tracker
-- Deploy this schema to your D1 database first

-- Work sessions table - stores complete work sessions instead of individual check-in/out events
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,                -- UUID for unique identification
    device_id TEXT NOT NULL,            -- Unique device identifier
    user_code TEXT NOT NULL,            -- User's sync code (replaces passphrase)
    start_time INTEGER NOT NULL,        -- Unix timestamp in milliseconds
    end_time INTEGER,                   -- NULL if session is still active
    created_at INTEGER NOT NULL,        -- When record was created
    updated_at INTEGER NOT NULL,        -- Last modification time
    deleted_at INTEGER                  -- Soft delete timestamp (NULL if not deleted)
);

-- Pending operations table - for offline queue management
CREATE TABLE IF NOT EXISTS pending_operations (
    id TEXT PRIMARY KEY,                -- UUID for unique identification
    device_id TEXT NOT NULL,            -- Which device created this operation
    user_code TEXT NOT NULL,            -- User's sync code
    operation_type TEXT NOT NULL,       -- 'start_session', 'end_session', 'update_session', 'delete_session'
    session_id TEXT,                    -- Target session ID (if applicable)
    data TEXT NOT NULL,                 -- JSON payload with operation details
    timestamp INTEGER NOT NULL,         -- When operation was created
    applied INTEGER DEFAULT 0           -- Boolean: has this operation been applied?
);

-- User codes table - manages the sync codes (replaces KV store)
CREATE TABLE IF NOT EXISTS user_codes (
    code TEXT PRIMARY KEY,              -- The memorable sync code (e.g., "blue-cat-7")
    created_at INTEGER NOT NULL,        -- When this code was generated
    last_accessed INTEGER NOT NULL      -- Last time any device used this code
);

-- Create indexes separately (SQLite syntax)
CREATE INDEX IF NOT EXISTS idx_sessions_user_code ON sessions(user_code);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_code, end_time);

CREATE INDEX IF NOT EXISTS idx_pending_user_device ON pending_operations(user_code, device_id);
CREATE INDEX IF NOT EXISTS idx_pending_applied ON pending_operations(applied, timestamp);

CREATE INDEX IF NOT EXISTS idx_user_codes_last_accessed ON user_codes(last_accessed);