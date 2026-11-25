-- 1. Sessions Table (Optional; 1 row per session_id when "session" rows are present)
CREATE TABLE IF NOT EXISTS sessions (
  session_id STRING NOT NULL,
  title STRING,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  final_metrics STRUCT<
    total_input_tokens INT64,
    total_output_tokens INT64,
    total_cache_read_tokens INT64,
    total_cache_write_tokens INT64,
    total_reasoning_tokens INT64,
    total_cost_usd FLOAT64,
    cost_source STRING,
    total_steps INT64,
    total_llm_calls INT64,
    total_duration_ms FLOAT64,
    granular ARRAY<STRUCT<
      model_name STRING,
      modality STRING,
      input_tokens INT64,
      output_tokens INT64,
      cache_read_tokens INT64,
      cache_write_tokens INT64,
      reasoning_tokens INT64,
      cost_usd FLOAT64
    >>,
    extensions JSON
  >,
  tags ARRAY<STRING>,
  extensions JSON
)
PARTITION BY DATE(end_time)
CLUSTER BY end_time, session_id;

-- 2. Trajectory Spine Table (1 row per trajectory_id)
CREATE TABLE IF NOT EXISTS trajectories (
  schema_version STRING NOT NULL,
  session_id STRING, -- Optional correlating session ID
  trajectory_id STRING NOT NULL,
  version STRING,
  parent_trajectory_id STRING,
  parent_reason STRING,
  parent_event_id STRING,
  parent_action_id STRING,
  parent_step_id INT64,
  parent_steps_excluded BOOL,
  ancestor_trajectory_ids ARRAY<STRING>,
  child_trajectory_ids ARRAY<STRING>,
  trajectory_depth INT64,
  title STRING,
  status STRING,
  error STRING,
  agent STRUCT<
    name STRING,
    version STRING,
    role STRING,
    identifier STRING,
    model STRUCT<
      name STRING,
      provider STRING,
      version STRING,
      reasoning_effort STRING,
      reasoning_budget FLOAT64,
      context_window_tokens INT64,
      supported_modalities ARRAY<STRING>,
      parameters JSON,
      identifier STRING,
      extensions JSON
    >,
    system_instructions STRING,
    skills ARRAY<STRUCT<
      name STRING,
      description STRING,
      version STRING,
      uri STRING,
      identifier STRING,
      type STRING,
      source STRUCT<
        digest STRING,
        uri STRING,
        media_type STRING,
        size_bytes INT64,
        filename STRING
      >,
      extensions JSON
    >>,
    subagents ARRAY<STRUCT<
      name STRING,
      description STRING,
      model_name STRING,
      system_instructions STRING,
      allowed_tools ARRAY<STRING>,
      identifier STRING,
      truncated_fields JSON, -- Map of field_name -> {original_bytes, strategy, blob}
      extensions JSON
    >>,
    mcp_servers ARRAY<STRUCT<
      name STRING,
      transport STRING,
      uri STRING,
      command STRING,
      args ARRAY<STRING>,
      version STRING,
      identifier STRING,
      tools ARRAY<STRING>,
      extensions JSON
    >>,
    tools ARRAY<STRUCT<
      name STRING,
      title STRING,
      description STRING,
      input_schema JSON,
      output_schema JSON,
      annotations JSON,
      executor STRING,
      mcp_server STRING,
      identifier STRING,
      extensions JSON
    >>,
    truncated_fields JSON, -- Map of field_name -> {original_bytes, strategy, blob}
    extensions JSON
  >,
  environments ARRAY<STRUCT<
    name STRING,
    os STRING,
    os_version STRING,
    arch STRING,
    cwd STRING,
    shell STRING,
    identifier STRING,
    sandbox STRUCT<
      type STRING,
      image STRING,
      network_restricted BOOL,
      filesystem_restricted BOOL,
      writable_roots ARRAY<STRING>,
      approval_mode STRING,
      extensions JSON
    >,
    vcs STRUCT<
      system STRING,
      repo_uri STRING,
      root_dir STRING,
      branch STRING,
      commit STRING,
      dirty BOOL,
      diff STRUCT<
        digest STRING,
        uri STRING,
        media_type STRING,
        size_bytes INT64,
        filename STRING
      >,
      extensions JSON
    >,
    extensions JSON
  >>,
  final_metrics STRUCT<
    total_input_tokens INT64,
    total_output_tokens INT64,
    total_cache_read_tokens INT64,
    total_cache_write_tokens INT64,
    total_reasoning_tokens INT64,
    total_cost_usd FLOAT64,
    cost_source STRING,
    total_steps INT64,
    total_llm_calls INT64,
    total_duration_ms FLOAT64,
    granular ARRAY<STRUCT<
      model_name STRING,
      modality STRING,
      input_tokens INT64,
      output_tokens INT64,
      cache_read_tokens INT64,
      cache_write_tokens INT64,
      reasoning_tokens INT64,
      cost_usd FLOAT64
    >>,
    extensions JSON
  >,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  step_count INT64,
  first_step_id INT64,
  tags ARRAY<STRING>,
  notes STRING,
  truncated_fields JSON, -- Map of field_name -> {original_bytes, strategy, blob}
  extensions JSON
)
PARTITION BY DATE(end_time)
CLUSTER BY end_time, trajectory_id;

-- 3. Steps Table (1 row per (trajectory_id, step_id))
CREATE TABLE IF NOT EXISTS steps (
  session_id STRING,
  trajectory_id STRING NOT NULL,
  step_id INT64 NOT NULL,
  event_ids ARRAY<STRING>,
  original_trajectory_id STRING, -- Non-null when step was copied from an earlier trajectory (or "(unknown)")
  original_trajectory_reason STRING, -- "subagent", "fork", "rewind", "retry", "candidate", "compaction", "continuation", "other"
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  source STRING,
  agent_name STRING,
  model STRUCT<
    name STRING,
    provider STRING,
    version STRING,
    reasoning_effort STRING,
    reasoning_budget FLOAT64,
    context_window_tokens INT64,
    supported_modalities ARRAY<STRING>,
    parameters JSON,
    identifier STRING,
    extensions JSON
  >,
  compaction STRUCT<
    trigger STRING,
    boundary STRING,
    event_id_start STRING,
    event_id_end STRING,
    step_id_start INT64,
    step_id_end INT64,
    summary STRING,
    tokens_before INT64,
    tokens_after INT64,
    compaction_trajectory_id STRING,
    extensions JSON
  >,
  -- Derived convenience text columns concatenating `content[].text` and raw `content[].reasoning.text`
  content_text STRING,
  content_reasoning STRING,
  content ARRAY<STRUCT<
    type STRING, -- "text", "reasoning", "data", "image", "audio", "video", "document", "action"
    text STRING,
    reasoning STRUCT<
      text STRING,
      summarized BOOL,
      signature STRING
    >,
    data JSON,
    source STRUCT<
      media_type STRING,
      uri STRING,
      digest STRING,
      size_bytes INT64,
      duration_sec FLOAT64,
      filename STRING
    >,
    action_id STRING,
    truncated_fields JSON, -- Map of field_name -> {original_bytes, strategy, blob}
    extensions JSON
  >>,
  citations ARRAY<STRUCT<
    uri STRING,
    title STRING,
    cited_text STRING,
    extensions JSON
  >>,
  error STRING,
  stop_reason STRING,
  metrics STRUCT<
    input_tokens INT64,
    output_tokens INT64,
    cache_read_tokens INT64,
    cache_write_tokens INT64,
    reasoning_tokens INT64,
    cost_usd FLOAT64,
    cost_source STRING,
    retry_count INT64,
    time_to_first_token_ms FLOAT64,
    duration_ms FLOAT64,
    response_id STRING,
    prompt_token_ids ARRAY<INT64>,
    completion_token_ids ARRAY<INT64>,
    logprobs ARRAY<FLOAT64>,
    granular ARRAY<STRUCT<
      model_name STRING,
      modality STRING,
      input_tokens INT64,
      output_tokens INT64,
      cache_read_tokens INT64,
      cache_write_tokens INT64,
      reasoning_tokens INT64,
      cost_usd FLOAT64
    >>,
    extensions JSON
  >,
  truncated_fields JSON, -- Map of field_name -> {original_bytes, strategy, blob}
  extensions JSON
)
CLUSTER BY trajectory_id, step_id;

-- 4. Actions Table (1 row per (trajectory_id, action_id), with strongly typed `canonical` STRUCT)
CREATE TABLE IF NOT EXISTS actions (
  action_id STRING NOT NULL,
  session_id STRING,
  trajectory_id STRING NOT NULL,
  step_id INT64 NOT NULL,
  original_trajectory_id STRING, -- Denormalized from owning step so queries can filter `original_trajectory_id IS NULL` directly
  event_ids ARRAY<STRING>,
  parent_action_id STRING,
  executor STRING, -- "client", "environment", "provider", "external"
  environment_name STRING, -- References EnvironmentDefinition.name in Trajectory.environments
  task_id STRING,
  task_detached BOOL,
  type STRING,
  errored BOOL,
  name STRING,
  uri STRING,
  arguments JSON,
  approval STRUCT<
    decision STRING,
    authority STRING,
    reason STRING,
    reviewer STRING,
    decision_time TIMESTAMP,
    extensions JSON
  >,
  -- Derived convenience text column concatenating `output[].text` for fast SQL LIKE / regex queries
  output_text STRING,
  output ARRAY<STRUCT<
    type STRING, -- "text", "reasoning", "data", "image", "audio", "video", "document"
    text STRING,
    reasoning STRUCT<
      text STRING,
      summarized BOOL,
      signature STRING
    >,
    data JSON,
    source STRUCT<
      media_type STRING,
      uri STRING,
      digest STRING,
      size_bytes INT64,
      duration_sec FLOAT64,
      filename STRING
    >,
    truncated_fields JSON, -- Map of field_name -> {original_bytes, strategy, blob}
    extensions JSON
  >>,
  canonical STRUCT<
    type STRING, -- "shell_command", "file_read", "file_write", "subagent", "mcp_tool", "multi", etc.
    reason STRING,
    mcp STRUCT<
      server_name STRING,
      server_identifier STRING,
      tool_name STRING
    >,
    multi JSON,
    subagent STRUCT<
      trajectory_id STRING,
      uri STRING,
      agent_name STRING,
      agent_identifier STRING,
      prompt STRING,
      usage STRUCT<
        total_input_tokens INT64,
        total_output_tokens INT64,
        total_cache_read_tokens INT64,
        total_cache_write_tokens INT64,
        total_reasoning_tokens INT64,
        total_cost_usd FLOAT64,
        cost_source STRING,
        total_steps INT64,
        total_llm_calls INT64,
        total_duration_ms FLOAT64,
        extensions JSON
      >
    >,
    message_send STRUCT<
      sender STRUCT<
        name STRING,
        trajectory_id STRING,
        identifier STRING
      >,
      recipients ARRAY<STRUCT<
        name STRING,
        trajectory_id STRING,
        identifier STRING
      >>,
      broadcast BOOL,
      task_id STRING,
      channel_id STRING,
      thread_id STRING,
      message_id STRING,
      message STRING
    >,
    message_read STRUCT<
      channel_id STRING,
      thread_id STRING,
      message_ids ARRAY<STRING>,
      senders ARRAY<STRUCT<
        name STRING,
        trajectory_id STRING,
        identifier STRING
      >>,
      wait BOOL
    >,
    elicitation STRUCT<
      question STRING,
      choices ARRAY<STRING>,
      requested_schema JSON
    >,
    timer STRUCT<
      duration_sec FLOAT64,
      cron_expression STRING,
      expire_time TIMESTAMP,
      prompt STRING
    >,
    synthetic_context STRUCT<
      source STRING
    >,
    task_status STRUCT<
      task_id STRING,
      wait BOOL,
      wait_timeout_sec FLOAT64
    >,
    task_list STRUCT<
      task_type STRING,
      include_completed BOOL
    >,
    task_stop STRUCT<
      task_id STRING,
      signal STRING,
      reason STRING
    >,
    shell_command STRUCT<
      task_id STRING,
      cwd STRING,
      command STRING,
      exit_code INT64
    >,
    shell_send_input STRUCT<
      task_id STRING,
      input STRING
    >,
    script_exec STRUCT<
      pid STRING,
      language STRING,
      path STRING,
      source STRING,
      arguments ARRAY<STRING>,
      exit_code INT64
    >,
    file_read STRUCT<
      scope STRING,
      path STRING,
      line_start INT64,
      line_end INT64,
      digest STRING
    >,
    file_write STRUCT<
      scope STRING,
      path STRING,
      operation STRING,
      diff STRING,
      before_digest STRING,
      after_digest STRING
    >,
    file_search STRUCT<
      scope STRING,
      query STRING,
      directory STRING,
      file_extensions ARRAY<STRING>
    >,
    file_list STRUCT<
      scope STRING,
      directory STRING,
      glob_pattern STRING,
      `recursive` BOOL
    >,
    file_move STRUCT<
      scope STRING,
      source STRING,
      destination STRING
    >,
    file_delete STRUCT<
      scope STRING,
      path STRING,
      `recursive` BOOL,
      before_digest STRING
    >,
    search STRUCT<
      query STRING,
      source STRING
    >,
    web_fetch STRUCT<
      method STRING,
      url STRING,
      headers JSON,
      request_body STRING,
      response_status INT64
    >,
    skill_activate STRUCT<
      skill_name STRING,
      skill_identifier STRING,
      prompt STRING
    >,
    skill_reference STRUCT<
      skill_name STRING,
      skill_identifier STRING,
      path STRING
    >,
    skill_script STRUCT<
      skill_name STRING,
      skill_identifier STRING,
      script_name STRING,
      arguments ARRAY<STRING>,
      cwd STRING
    >,
    generate_media STRUCT<
      modality STRING,
      prompt STRING,
      model STRUCT<
        name STRING,
        provider STRING,
        version STRING,
        reasoning_effort STRING,
        reasoning_budget FLOAT64,
        context_window_tokens INT64,
        supported_modalities ARRAY<STRING>,
        parameters JSON,
        identifier STRING,
        extensions JSON
      >,
      candidate_count INT64
    >,
    extension STRUCT<
      namespace STRING,
      data JSON
    >,
    resource_discovery STRUCT<
      query STRING,
      types ARRAY<STRING>
    >,
    extensions JSON
  >,
  model STRUCT<
    name STRING,
    provider STRING,
    version STRING,
    reasoning_effort STRING,
    reasoning_budget FLOAT64,
    context_window_tokens INT64,
    supported_modalities ARRAY<STRING>,
    parameters JSON,
    identifier STRING,
    extensions JSON
  >,
  metrics STRUCT<
    input_tokens INT64,
    output_tokens INT64,
    cache_read_tokens INT64,
    cache_write_tokens INT64,
    reasoning_tokens INT64,
    cost_usd FLOAT64,
    cost_source STRING,
    retry_count INT64,
    time_to_first_token_ms FLOAT64,
    duration_ms FLOAT64,
    response_id STRING,
    prompt_token_ids ARRAY<INT64>,
    completion_token_ids ARRAY<INT64>,
    logprobs ARRAY<FLOAT64>,
    granular ARRAY<STRUCT<
      model_name STRING,
      modality STRING,
      input_tokens INT64,
      output_tokens INT64,
      cache_read_tokens INT64,
      cache_write_tokens INT64,
      reasoning_tokens INT64,
      cost_usd FLOAT64
    >>,
    extensions JSON
  >,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  truncated_fields JSON, -- Map of field_name -> {original_bytes, strategy, blob}
  extensions JSON
)
CLUSTER BY trajectory_id, step_id;

-- 5. Extension Records Table (Optional; top-level "extension" NDJSON rows)
CREATE TABLE IF NOT EXISTS extension_records (
  namespace STRING NOT NULL,
  session_id STRING,
  trajectory_id STRING,
  data JSON
)
CLUSTER BY namespace, trajectory_id;

-- 6. Blobs Table (Content-addressed offloaded payloads keyed by `urn:sha256:<hex>`)
CREATE TABLE IF NOT EXISTS blobs (
  digest STRING NOT NULL,
  media_type STRING NOT NULL,
  size_bytes INT64,
  uri STRING,
  content_bytes BYTES,
  create_time TIMESTAMP
)
CLUSTER BY digest;
