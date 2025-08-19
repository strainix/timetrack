-- Cloudflare D1 Database Schema for Time Tracker - INDEXES ONLY
-- Run this AFTER creating tables with schema-tables.sql

-- Indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_user_code ON sessions(user_code);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_code, end_time);

-- Indexes for pending_operations table
CREATE INDEX IF NOT EXISTS idx_pending_user_device ON pending_operations(user_code, device_id);
CREATE INDEX IF NOT EXISTS idx_pending_applied ON pending_operations(applied, timestamp);

-- Indexes for user_codes table
CREATE INDEX IF NOT EXISTS idx_user_codes_last_accessed ON user_codes(last_accessed);