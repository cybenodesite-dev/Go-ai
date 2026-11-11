export type Provider = {
  id: string;
  name: string;
  base_url: string;
  enabled: number;
  created_at: string;
  keys_count: number;
  active_keys: number;
  exhausted_keys: number;
  disabled_keys: number;
  models_count: number;
  selected_models: number;
  total_usage: number;
};

export type ApiKey = {
  id: string;
  provider_id: string;
  label: string;
  key_value: string;
  status: "active" | "exhausted" | "disabled" | string;
  usage_count: number;
  error_count: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type ModelRow = {
  id: string;
  provider_id: string;
  model_id: string;
  selected: number;
  created_at: string;
  provider_name?: string;
  provider_enabled?: number;
};

export type GatewayKey = {
  id: string;
  name: string;
  key_value: string;
  enabled: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
};

export type LogRow = {
  id: string;
  gateway_key_name: string;
  provider_name: string;
  api_key_label: string;
  model: string;
  status: "success" | "error" | string;
  status_code: number | null;
  attempts: number;
  latency_ms: number | null;
  stream: number;
  error_message: string | null;
  created_at: string;
};

export type Stats = {
  providers: number;
  enabled_providers: number;
  total_keys: number;
  active_keys: number;
  exhausted_keys: number;
  disabled_keys: number;
  total_key_usage: number;
  total_models: number;
  selected_models: number;
  gateway_keys: number;
  total_requests: number;
  success_requests: number;
  failover_saves: number;
  requests_24h: number;
};

export type KeyUsageRow = {
  id: string;
  provider_id: string;
  provider_name: string;
  label: string;
  status: string;
  usage_count: number;
  error_count: number;
};
