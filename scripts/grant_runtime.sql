-- Run as the migration owner with psql:
-- psql "$MIGRATION_DATABASE_URL" -v runtime_role=job_demo -f scripts/grant_runtime.sql
-- Create the login role and set its password separately through your provider.
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, jobs, applications, application_status_history, owner_sessions, login_attempts, resumes, user_jobs, user_sessions, auth_attempts, job_board_cache
TO :"runtime_role";
-- No schema ownership, role administration, or migration privileges are granted.
