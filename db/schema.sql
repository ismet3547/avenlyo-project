CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(slug) BETWEEN 2 AND 80),
  CHECK (slug = lower(slug))
);

CREATE TABLE IF NOT EXISTS app.business_profiles (
  workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id) ON DELETE CASCADE,
  industry text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT '',
  offer text NOT NULL DEFAULT '',
  faq text NOT NULL DEFAULT '',
  knowledge text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON app.users ((lower(email)));

CREATE TABLE IF NOT EXISTS app.workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_memberships_user_idx
  ON app.workspace_memberships (user_id, workspace_id);

CREATE TABLE IF NOT EXISTS app.agents (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '✦',
  role text NOT NULL DEFAULT '',
  goal text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  model text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS agents_workspace_updated_idx
  ON app.agents (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app.documents (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  extension text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-fA-F]{64}$'),
  status text NOT NULL CHECK (status IN ('processing', 'ready', 'error')),
  page_count integer,
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  extraction_method text,
  ocr_page_count integer NOT NULL DEFAULT 0 CHECK (ocr_page_count >= 0),
  error text,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, sha256)
);
CREATE INDEX IF NOT EXISTS documents_workspace_created_idx
  ON app.documents (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_workspace_status_idx
  ON app.documents (workspace_id, status);

CREATE TABLE IF NOT EXISTS app.chunks (
  workspace_id uuid NOT NULL,
  id text NOT NULL,
  document_id text NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  text text NOT NULL,
  token_count integer NOT NULL CHECK (token_count >= 0),
  page_start integer,
  page_end integer,
  embedding vector NOT NULL,
  embedding_model text NOT NULL DEFAULT 'legacy-unknown',
  embedding_dimensions integer NOT NULL CHECK (embedding_dimensions BETWEEN 1 AND 16000),
  extraction_method text NOT NULL DEFAULT 'native'
    CHECK (extraction_method IN ('native', 'ocr')),
  ocr_confidence real,
  search_vector tsvector GENERATED ALWAYS AS
    (to_tsvector('pg_catalog.simple', text)) STORED,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, document_id)
    REFERENCES app.documents(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS chunks_workspace_document_idx
  ON app.chunks (workspace_id, document_id);
CREATE INDEX IF NOT EXISTS chunks_semantic_scope_idx
  ON app.chunks (workspace_id, document_id, embedding_model, embedding_dimensions);
CREATE INDEX IF NOT EXISTS chunks_search_gin_idx
  ON app.chunks USING gin (search_vector);

CREATE TABLE IF NOT EXISTS app.agent_documents (
  workspace_id uuid NOT NULL,
  agent_id text NOT NULL,
  document_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, agent_id, document_id),
  FOREIGN KEY (workspace_id, agent_id)
    REFERENCES app.agents(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_id)
    REFERENCES app.documents(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_documents_document_idx
  ON app.agent_documents (workspace_id, document_id);

CREATE TABLE IF NOT EXISTS app.conversations (
  workspace_id uuid NOT NULL,
  id text NOT NULL,
  agent_id text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, agent_id)
    REFERENCES app.agents(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS conversations_agent_updated_idx
  ON app.conversations (workspace_id, agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app.chat_messages (
  workspace_id uuid NOT NULL,
  id text NOT NULL,
  conversation_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources_json jsonb,
  debug_json jsonb,
  tool_activities_json jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, conversation_id)
    REFERENCES app.conversations(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
  ON app.chat_messages (workspace_id, conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS app.tool_definitions (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('local', 'http', 'webhook', 'oauth_http')),
  risk_level text NOT NULL
    CHECK (risk_level IN ('read', 'sensitive_read', 'write', 'destructive', 'external_share')),
  approval_policy text NOT NULL CHECK (approval_policy IN ('never', 'always', 'writes')),
  input_schema jsonb NOT NULL,
  output_schema jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  builtin boolean NOT NULL DEFAULT true,
  platform_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.workspace_tools (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  tool_id text NOT NULL REFERENCES app.tool_definitions(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, tool_id)
);

CREATE TABLE IF NOT EXISTS app.agent_tools (
  workspace_id uuid NOT NULL,
  agent_id text NOT NULL,
  tool_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, agent_id, tool_id),
  FOREIGN KEY (workspace_id, agent_id)
    REFERENCES app.agents(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, tool_id)
    REFERENCES app.workspace_tools(workspace_id, tool_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app.crm_contacts (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  notes text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS crm_contacts_created_idx
  ON app.crm_contacts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_contacts_email_idx
  ON app.crm_contacts (workspace_id, email);

CREATE TABLE IF NOT EXISTS app.tool_runs (
  workspace_id uuid NOT NULL,
  id text NOT NULL,
  trace_id text NOT NULL,
  conversation_id text,
  message_id text,
  agent_id text NOT NULL,
  tool_id text NOT NULL,
  call_id text,
  status text NOT NULL
    CHECK (status IN ('proposed','approval_required','approved','rejected','running','success','failed','cancelled')),
  risk_level text NOT NULL
    CHECK (risk_level IN ('read','sensitive_read','write','destructive','external_share')),
  arguments_json jsonb NOT NULL,
  arguments_hash text NOT NULL CHECK (arguments_hash ~ '^[0-9a-fA-F]{64}$'),
  result_json jsonb,
  error_code text,
  idempotency_key text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, agent_id)
    REFERENCES app.agents(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, tool_id)
    REFERENCES app.workspace_tools(workspace_id, tool_id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, conversation_id)
    REFERENCES app.conversations(workspace_id, id)
    ON DELETE SET NULL (conversation_id),
  FOREIGN KEY (workspace_id, message_id)
    REFERENCES app.chat_messages(workspace_id, id)
    ON DELETE SET NULL (message_id)
);
CREATE INDEX IF NOT EXISTS tool_runs_conversation_idx
  ON app.tool_runs (workspace_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_runs_agent_idx
  ON app.tool_runs (workspace_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_runs_status_idx
  ON app.tool_runs (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS app.tool_approvals (
  workspace_id uuid NOT NULL,
  id text NOT NULL,
  tool_run_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('pending','approved','rejected','expired')),
  arguments_hash text NOT NULL CHECK (arguments_hash ~ '^[0-9a-fA-F]{64}$'),
  resume_items_json jsonb,
  approved_at timestamptz,
  rejected_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, tool_run_id),
  FOREIGN KEY (workspace_id, tool_run_id)
    REFERENCES app.tool_runs(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app.tool_run_attempts (
  workspace_id uuid NOT NULL,
  id text NOT NULL,
  tool_run_id text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  http_status integer,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failed')),
  error_code text,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, tool_run_id, attempt_number),
  FOREIGN KEY (workspace_id, tool_run_id)
    REFERENCES app.tool_runs(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tool_run_attempts_run_idx
  ON app.tool_run_attempts (workspace_id, tool_run_id, attempt_number);

CREATE TABLE IF NOT EXISTS app.tool_audit_events (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  tool_run_id text,
  event_type text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, tool_run_id)
    REFERENCES app.tool_runs(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tool_audit_events_run_idx
  ON app.tool_audit_events (workspace_id, tool_run_id, created_at ASC);

CREATE OR REPLACE FUNCTION app.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT current_setting('app.workspace_id')::uuid
$$;

REVOKE ALL ON FUNCTION app.current_workspace_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_workspace_id() TO avenlyo_runtime, avenlyo_importer;

ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspaces_workspace_isolation ON app.workspaces;
CREATE POLICY workspaces_workspace_isolation ON app.workspaces
  FOR ALL TO avenlyo_runtime, avenlyo_importer
  USING (id = app.current_workspace_id())
  WITH CHECK (id = app.current_workspace_id());

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'business_profiles','workspace_memberships','agents','documents','chunks',
    'agent_documents','conversations','chat_messages','workspace_tools','agent_tools',
    'crm_contacts','tool_runs','tool_approvals','tool_run_attempts','tool_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON app.%I', table_name || '_workspace_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON app.%I FOR ALL TO avenlyo_runtime, avenlyo_importer USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id())',
      table_name || '_workspace_isolation',
      table_name
    );
  END LOOP;
END
$$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;

GRANT USAGE ON SCHEMA app TO avenlyo_runtime, avenlyo_importer;
GRANT SELECT ON app.workspaces TO avenlyo_runtime;
GRANT SELECT ON app.tool_definitions TO avenlyo_runtime, avenlyo_importer;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.business_profiles,
  app.agents,
  app.documents,
  app.chunks,
  app.agent_documents,
  app.conversations,
  app.chat_messages,
  app.workspace_tools,
  app.agent_tools,
  app.crm_contacts,
  app.tool_runs,
  app.tool_approvals,
  app.tool_run_attempts,
  app.tool_audit_events
TO avenlyo_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.workspaces,
  app.business_profiles,
  app.workspace_memberships,
  app.agents,
  app.documents,
  app.chunks,
  app.agent_documents,
  app.conversations,
  app.chat_messages,
  app.workspace_tools,
  app.agent_tools,
  app.crm_contacts,
  app.tool_runs,
  app.tool_approvals,
  app.tool_run_attempts,
  app.tool_audit_events
TO avenlyo_importer;

ALTER SCHEMA app OWNER TO avenlyo_owner;
ALTER FUNCTION app.current_workspace_id() OWNER TO avenlyo_owner;

DO $$
DECLARE
  object_name text;
BEGIN
  FOR object_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind IN ('r','p','S','v','m')
  LOOP
    EXECUTE format('ALTER TABLE app.%I OWNER TO avenlyo_owner', object_name);
  END LOOP;
END
$$;

