-- Enable pgvector extension for vector similarity search
-- NOTE: This extension must be enabled by a database administrator with superuser privileges.
-- On managed services (Neon, Supabase, Railway, etc.), enable it via their dashboard.
-- This migration creates the extension when permissions allow.

-- To enable manually as superuser:
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS vector;
