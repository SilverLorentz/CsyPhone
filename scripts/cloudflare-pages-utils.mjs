import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const PROJECT_NAME = 'sully-frontend';
export const DEFAULT_ACCOUNT_ID = '7545af8860a3ea387c50c288c7e03274';
export const EXPECTED_BUILD_COMMAND = 'npm run build';
export const EXPECTED_DESTINATION_DIR = 'dist';
export const EXPECTED_ROOT_DIR = '';
export const EXPECTED_PRODUCTION_BRANCH = 'main';
export const PRODUCTION_ENV_FILE = '.env.production.local';
export const PREVIEW_ENV_FILE = '.env.staging.local';
export const REQUIRED_PAGES_ENV_KEYS = ['VITE_CSYOS_BACKEND_URL', 'VITE_CSYOS_BACKEND_TOKEN'];
export const RECOMMENDED_PAGES_ENV_KEYS = ['VITE_CSYOS_FRONTEND_ORIGIN', 'VITE_CSYOS_TTS_WS_PROXY_URL'];

const PLACEHOLDER_PATTERN = /replace-me|<your-|<set-/i;
// Pages builds in the current wrangler-config path reliably expose secret_text
// variables to process.env, while plain_text backend URL was still omitted.
const SECRET_ENV_KEYS = new Set([
  'VITE_CSYOS_BACKEND_TOKEN',
  'VITE_CSYOS_BACKEND_URL',
]);

export function getCloudflareAccountId() {
  return process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;
}

export function getWranglerConfigPath() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml');
  }

  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, '.wrangler', 'config', 'default.toml');
  }

  const home = process.env.HOME;
  if (!home) {
    return null;
  }

  return path.join(home, '.config', '.wrangler', 'config', 'default.toml');
}

export async function readCloudflareToken() {
  const directToken =
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    process.env.CLOUDFLARE_OAUTH_TOKEN ||
    process.env.CF_OAUTH_TOKEN;

  if (directToken) {
    return directToken;
  }

  const configPath = getWranglerConfigPath();
  if (!configPath) {
    throw new Error(
      'Missing Cloudflare token. Set CLOUDFLARE_API_TOKEN or log in with `npx wrangler whoami` first.',
    );
  }

  const raw = await readFile(configPath, 'utf8');
  const oauthMatch = raw.match(/^oauth_token\s*=\s*"([^"]+)"/m);
  const apiMatch = raw.match(/^api_token\s*=\s*"([^"]+)"/m);
  const token = oauthMatch?.[1] || apiMatch?.[1];

  if (!token) {
    throw new Error(
      `No oauth_token or api_token found in ${configPath}. Run \`npx wrangler login\` first or export CLOUDFLARE_API_TOKEN.`,
    );
  }

  return token;
}

export async function readEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const map = new Map();

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      map.set(key, value);
    }

    return map;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function isPlaceholderValue(value) {
  return !value || PLACEHOLDER_PATTERN.test(value);
}

export function assertRequiredEnvValues(envMap, fileLabel, requiredKeys = REQUIRED_PAGES_ENV_KEYS) {
  if (!envMap) {
    throw new Error(`Missing env file: ${fileLabel}`);
  }

  const result = {};
  const missingKeys = [];
  for (const key of requiredKeys) {
    const value = envMap.get(key)?.trim() || '';
    if (isPlaceholderValue(value)) {
      missingKeys.push(key);
      continue;
    }
    result[key] = value;
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing required values in ${fileLabel}: ${missingKeys.join(', ')}`);
  }

  return result;
}

export async function fetchCloudflareResult(apiPath, { token, method = 'GET', body } = {}) {
  if (!token) {
    throw new Error('Missing Cloudflare API token.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4${apiPath}`, init);
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`Cloudflare API returned non-JSON for ${apiPath}: ${raw.slice(0, 200)}`);
    }
  }

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
      `${response.status} ${response.statusText}`;
    throw new Error(`Cloudflare API request failed for ${apiPath}: ${message}`);
  }

  return payload?.result ?? null;
}

export function getEnvKeysForConfig(config) {
  return Object.keys(config?.env_vars || {}).sort();
}

export function difference(expectedKeys, actualKeys) {
  const actualSet = new Set(actualKeys);
  return expectedKeys.filter((key) => !actualSet.has(key));
}

export function formatKeyList(keys) {
  return keys.length > 0 ? keys.join(', ') : '(none)';
}

export function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

export function parseFailureReason(logEntries) {
  const lines = logEntries.map((entry) => entry.line).filter(Boolean);
  const taggedLine = lines.find((line) => line.includes('[build env]'));
  if (taggedLine) {
    return stripAnsi(taggedLine);
  }

  const missingVarsLine = lines.find((line) => /Missing required .* variables/i.test(line));
  if (missingVarsLine) {
    return stripAnsi(missingVarsLine);
  }

  const failedLine = [...lines].reverse().find((line) => /^Failed:/i.test(line));
  return failedLine ? stripAnsi(failedLine) : null;
}

export function getPagesEnvVarBindingType(key) {
  return SECRET_ENV_KEYS.has(key) ? 'secret_text' : 'plain_text';
}

export function findPagesEnvKeysWithMismatchedType(config, nextEnvValues) {
  return Object.keys(nextEnvValues).filter((key) => {
    const currentType = config?.env_vars?.[key]?.type;
    return currentType && currentType !== getPagesEnvVarBindingType(key);
  });
}

export async function fetchPagesProject({ token, accountId = getCloudflareAccountId(), projectName = PROJECT_NAME } = {}) {
  return fetchCloudflareResult(`/accounts/${accountId}/pages/projects/${projectName}`, { token });
}

export async function listPagesDeployments({
  token,
  accountId = getCloudflareAccountId(),
  projectName = PROJECT_NAME,
  environment,
  perPage = 25,
} = {}) {
  const params = new URLSearchParams();
  if (environment) {
    params.set('env', environment);
  }
  if (perPage) {
    params.set('per_page', String(perPage));
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  return fetchCloudflareResult(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments${query}`,
    { token },
  );
}

export async function fetchPagesDeployment({
  token,
  deploymentId,
  accountId = getCloudflareAccountId(),
  projectName = PROJECT_NAME,
} = {}) {
  if (!deploymentId) {
    throw new Error('Missing deploymentId.');
  }

  return fetchCloudflareResult(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
    { token },
  );
}

export async function fetchPagesDeploymentLogs({
  token,
  deploymentId,
  accountId = getCloudflareAccountId(),
  projectName = PROJECT_NAME,
} = {}) {
  if (!deploymentId) {
    throw new Error('Missing deploymentId.');
  }

  return fetchCloudflareResult(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/history/logs`,
    { token },
  );
}

export function findLatestFailedGitProductionDeployment(deployments) {
  return (deployments || []).find(
    (deployment) =>
      deployment.environment === 'production' &&
      deployment.deployment_trigger?.type === 'github:push' &&
      deployment.latest_stage?.status === 'failure',
  );
}

function createPagesEnvVarBinding(key, value) {
  return {
    type: getPagesEnvVarBindingType(key),
    value,
  };
}

export function buildPagesEnvVars(values) {
  const envVars = {};
  for (const [key, value] of Object.entries(values)) {
    envVars[key] = createPagesEnvVarBinding(key, value);
  }
  return envVars;
}

function cloneDeploymentConfig(config) {
  const cloned = structuredClone(config || {});
  delete cloned.wrangler_config_hash;
  return cloned;
}

export function buildPatchedDeploymentConfig(currentConfig, nextEnvValues) {
  const merged = cloneDeploymentConfig(currentConfig);
  merged.env_vars = {
    ...(merged.env_vars || {}),
    ...buildPagesEnvVars(nextEnvValues),
  };
  return merged;
}

export function buildClearedDeploymentConfig(currentConfig, keysToClear) {
  const merged = cloneDeploymentConfig(currentConfig);
  merged.env_vars = {
    ...(merged.env_vars || {}),
  };
  for (const key of keysToClear) {
    merged.env_vars[key] = null;
  }
  return merged;
}

export async function patchPagesProjectDeploymentConfigs({
  token,
  project,
  productionEnvValues,
  previewEnvValues,
  accountId = getCloudflareAccountId(),
  projectName = PROJECT_NAME,
} = {}) {
  const resolvedProject =
    project || (await fetchPagesProject({ token, accountId, projectName }));
  const body = {
    deployment_configs: {
      preview: buildPatchedDeploymentConfig(
        resolvedProject.deployment_configs?.preview,
        previewEnvValues,
      ),
      production: buildPatchedDeploymentConfig(
        resolvedProject.deployment_configs?.production,
        productionEnvValues,
      ),
    },
  };

  return fetchCloudflareResult(`/accounts/${accountId}/pages/projects/${projectName}`, {
    token,
    method: 'PATCH',
    body,
  });
}

export async function clearPagesProjectEnvKeys({
  token,
  project,
  productionKeys = [],
  previewKeys = [],
  accountId = getCloudflareAccountId(),
  projectName = PROJECT_NAME,
} = {}) {
  const resolvedProject =
    project || (await fetchPagesProject({ token, accountId, projectName }));
  const body = {
    deployment_configs: {
      preview: buildClearedDeploymentConfig(
        resolvedProject.deployment_configs?.preview,
        previewKeys,
      ),
      production: buildClearedDeploymentConfig(
        resolvedProject.deployment_configs?.production,
        productionKeys,
      ),
    },
  };

  return fetchCloudflareResult(`/accounts/${accountId}/pages/projects/${projectName}`, {
    token,
    method: 'PATCH',
    body,
  });
}

export async function retryPagesDeployment({
  token,
  deploymentId,
  accountId = getCloudflareAccountId(),
  projectName = PROJECT_NAME,
} = {}) {
  if (!deploymentId) {
    throw new Error('Missing deploymentId.');
  }

  return fetchCloudflareResult(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}/retry`,
    {
      token,
      method: 'POST',
      body: {},
    },
  );
}

export async function waitForPagesDeployment({
  token,
  deploymentId,
  accountId = getCloudflareAccountId(),
  projectName = PROJECT_NAME,
  timeoutMs = 180000,
  pollIntervalMs = 5000,
} = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const deployment = await fetchPagesDeployment({
      token,
      deploymentId,
      accountId,
      projectName,
    });
    const latestStatus = deployment.latest_stage?.status;
    if (latestStatus === 'success' || latestStatus === 'failure') {
      return deployment;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for Pages deployment ${deploymentId} to finish.`);
}
