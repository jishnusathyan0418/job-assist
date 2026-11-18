-- Schema-only snapshot of the original learning database; contains no user records.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "email" character varying(255) NOT NULL,
  "full_name" character varying(255) NOT NULL,
  "target_role" character varying(255),
  "location_pref" character varying(255),
  "remote_pref" character varying(50),
  "experience_level" character varying(50),
  "daily_limit" integer DEFAULT 10,
  "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_email_key" UNIQUE (email),
  CONSTRAINT "users_experience_level_check" CHECK (((experience_level)::text = ANY ((ARRAY['fresher'::character varying, 'junior'::character varying, 'mid'::character varying, 'senior'::character varying])::text[]))),
  CONSTRAINT "users_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_remote_pref_check" CHECK (((remote_pref)::text = ANY ((ARRAY['remote'::character varying, 'hybrid'::character varying, 'onsite'::character varying, 'any'::character varying])::text[])))
);

CREATE TABLE jobs (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "platform" character varying(100) NOT NULL,
  "platform_job_id" character varying(255),
  "company" character varying(255) NOT NULL,
  "title" character varying(255) NOT NULL,
  "location" character varying(255),
  "job_url" text NOT NULL,
  "description_raw" text,
  "description_structured" jsonb DEFAULT '{}'::jsonb,
  "status" character varying(50) DEFAULT 'discovered'::character varying,
  "discovered_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "jobs_job_url_key" UNIQUE (job_url),
  CONSTRAINT "jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "jobs_status_check" CHECK (((status)::text = ANY ((ARRAY['discovered'::character varying, 'analyzed'::character varying, 'matched'::character varying, 'ready_for_review'::character varying, 'applied'::character varying, 'interview'::character varying, 'rejected'::character varying, 'offer'::character varying, 'withdrawn'::character varying, 'manual_action_required'::character varying])::text[])))
);

CREATE TABLE applications (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "resume_version_id" uuid,
  "status" character varying(50) DEFAULT 'discovered'::character varying,
  "applied_at" timestamp without time zone,
  "notes" text,
  "match_score" numeric(5,2),
  "match_details" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "applications_job_id_fkey" FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT "applications_pkey" PRIMARY KEY (id),
  CONSTRAINT "applications_status_check" CHECK (((status)::text = ANY ((ARRAY['discovered'::character varying, 'matched'::character varying, 'ready_for_review'::character varying, 'application_started'::character varying, 'applied'::character varying, 'assessment'::character varying, 'interview'::character varying, 'rejected'::character varying, 'withdrawn'::character varying, 'offer'::character varying, 'manual_action_required'::character varying, 'failed'::character varying])::text[]))),
  CONSTRAINT "applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT "applications_user_id_job_id_key" UNIQUE (user_id, job_id)
);