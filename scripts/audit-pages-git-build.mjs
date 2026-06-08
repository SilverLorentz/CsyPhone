import path from 'node:path';
import process from 'node:process';

import {
  EXPECTED_BUILD_COMMAND,
  EXPECTED_DESTINATION_DIR,
  EXPECTED_PRODUCTION_BRANCH,
  EXPECTED_ROOT_DIR,
  PREVIEW_ENV_FILE,
  PROJECT_NAME,
  PRODUCTION_ENV_FILE,
  RECOMMENDED_PAGES_ENV_KEYS,
  REQUIRED_PAGES_ENV_KEYS,
  difference,
  findPagesEnvKeysWithMismatchedType,
  fetchPagesDeployment,
  fetchPagesDeploymentLogs,
  fetchPagesProject,
  findLatestFailedGitProductionDeployment,
  formatKeyList,
  getCloudflareAccountId,
  getEnvKeysForConfig,
  listPagesDeployments,
  parseFailureReason,
  readCloudflareToken,
  readEnvFile,
} from './cloudflare-pages-utils.mjs';

async function main() {
  const accountId = getCloudflareAccountId();
  const token = await readCloudflareToken();

  const [project, deployments, localProductionEnv, localPreviewEnv] = await Promise.all([
    fetchPagesProject({ token, accountId, projectName: PROJECT_NAME }),
    listPagesDeployments({ token, accountId, projectName: PROJECT_NAME, perPage: 25 }),
    readEnvFile(path.join(process.cwd(), PRODUCTION_ENV_FILE)),
    readEnvFile(path.join(process.cwd(), PREVIEW_ENV_FILE)),
  ]);

  const productionEnvKeys = getEnvKeysForConfig(project.deployment_configs?.production);
  const previewEnvKeys = getEnvKeysForConfig(project.deployment_configs?.preview);
  const requiredProductionMissing = difference(REQUIRED_PAGES_ENV_KEYS, productionEnvKeys);
  const recommendedProductionMissing = difference(RECOMMENDED_PAGES_ENV_KEYS, productionEnvKeys);
  const requiredPreviewMissing = difference(REQUIRED_PAGES_ENV_KEYS, previewEnvKeys);
  const recommendedPreviewMissing = difference(RECOMMENDED_PAGES_ENV_KEYS, previewEnvKeys);
  const productionTypeMismatches = findPagesEnvKeysWithMismatchedType(
    project.deployment_configs?.production,
    Object.fromEntries(REQUIRED_PAGES_ENV_KEYS.map((key) => [key, 'present'])),
  );
  const previewTypeMismatches = findPagesEnvKeysWithMismatchedType(
    project.deployment_configs?.preview,
    Object.fromEntries(REQUIRED_PAGES_ENV_KEYS.map((key) => [key, 'present'])),
  );

  const previewSetting = project.source?.config?.preview_deployment_setting ?? 'unknown';
  const latestFailedGitProduction = findLatestFailedGitProductionDeployment(deployments);

  const canonicalDeploymentId = project.canonical_deployment?.id;
  const [canonicalDeployment, latestFailedLogs] = await Promise.all([
    canonicalDeploymentId
      ? fetchPagesDeployment({
          token,
          accountId,
          projectName: PROJECT_NAME,
          deploymentId: canonicalDeploymentId,
        })
      : Promise.resolve(null),
    latestFailedGitProduction
      ? fetchPagesDeploymentLogs({
          token,
          accountId,
          projectName: PROJECT_NAME,
          deploymentId: latestFailedGitProduction.id,
        })
      : Promise.resolve(null),
  ]);

  const failureReason = latestFailedLogs ? parseFailureReason(latestFailedLogs.data || []) : null;
  const localProductionKeys = localProductionEnv ? [...localProductionEnv.keys()].sort() : [];
  const localPreviewKeys = localPreviewEnv ? [...localPreviewEnv.keys()].sort() : [];
  const failures = [];
  const warnings = [];

  if (project.production_branch !== EXPECTED_PRODUCTION_BRANCH) {
    failures.push(
      `Production branch mismatch: expected ${EXPECTED_PRODUCTION_BRANCH}, got ${project.production_branch || '(none)'}.`,
    );
  }

  if (project.build_config?.build_command !== EXPECTED_BUILD_COMMAND) {
    failures.push(
      `Build command mismatch: expected "${EXPECTED_BUILD_COMMAND}", got "${project.build_config?.build_command || '(none)'}".`,
    );
  }

  if (project.build_config?.destination_dir !== EXPECTED_DESTINATION_DIR) {
    failures.push(
      `Output directory mismatch: expected "${EXPECTED_DESTINATION_DIR}", got "${project.build_config?.destination_dir || '(none)'}".`,
    );
  }

  if ((project.build_config?.root_dir || '') !== EXPECTED_ROOT_DIR) {
    failures.push(
      `Root directory mismatch: expected repo root, got "${project.build_config?.root_dir || '(none)'}".`,
    );
  }

  if (!project.source?.config?.production_deployments_enabled) {
    failures.push('Git production deployments are disabled in Cloudflare Pages.');
  }

  if (requiredProductionMissing.length > 0) {
    failures.push(
      `Pages production variables are missing required keys: ${requiredProductionMissing.join(', ')}.`,
    );
  }

  if (productionTypeMismatches.length > 0) {
    failures.push(
      `Pages production variables have mismatched binding types: ${productionTypeMismatches.join(', ')}.`,
    );
  }

  if (previewSetting !== 'none' && requiredPreviewMissing.length > 0) {
    failures.push(
      `Pages preview variables are missing required keys: ${requiredPreviewMissing.join(', ')}.`,
    );
  }

  if (previewSetting !== 'none' && previewTypeMismatches.length > 0) {
    failures.push(
      `Pages preview variables have mismatched binding types: ${previewTypeMismatches.join(', ')}.`,
    );
  }

  if (recommendedProductionMissing.length > 0) {
    warnings.push(
      `Pages production variables are missing recommended keys: ${recommendedProductionMissing.join(', ')}.`,
    );
  }

  if (previewSetting !== 'none' && recommendedPreviewMissing.length > 0) {
    warnings.push(
      `Pages preview variables are missing recommended keys: ${recommendedPreviewMissing.join(', ')}.`,
    );
  }

  if (
    canonicalDeployment?.deployment_trigger?.type === 'ad_hoc' &&
    latestFailedGitProduction?.deployment_trigger?.type === 'github:push'
  ) {
    warnings.push(
      'Canonical production deployment is currently an ad hoc upload, which means the site can be live while Git-triggered production builds are still broken.',
    );
  }

  console.log('Cloudflare Pages Git Build Audit');
  console.log(`Project: ${project.name}`);
  console.log(
    `Git source: ${project.source?.type || 'unknown'} ${project.source?.config?.owner || '(unknown)'}/${project.source?.config?.repo_name || '(unknown)'}`,
  );
  console.log(`Production branch: ${project.production_branch || '(none)'}`);
  console.log(
    `Automatic production deploys: ${project.source?.config?.production_deployments_enabled ? 'enabled' : 'disabled'}`,
  );
  console.log(`Preview deployment setting: ${previewSetting}`);
  console.log(
    `Build config: command="${project.build_config?.build_command || '(none)'}", output="${project.build_config?.destination_dir || '(none)'}", root="${project.build_config?.root_dir || '(repo root)'}"`,
  );
  console.log(`Pages production env keys: ${formatKeyList(productionEnvKeys)}`);
  console.log(`Pages preview env keys: ${formatKeyList(previewEnvKeys)}`);
  console.log(
    `Local ${PRODUCTION_ENV_FILE} keys: ${localProductionEnv ? formatKeyList(localProductionKeys) : '(file not found)'}`,
  );
  console.log(
    `Local ${PREVIEW_ENV_FILE} keys: ${localPreviewEnv ? formatKeyList(localPreviewKeys) : '(file not found)'}`,
  );

  if (canonicalDeployment) {
    console.log(
      `Canonical production deployment: ${canonicalDeployment.short_id} (${canonicalDeployment.deployment_trigger?.type || 'unknown'})`,
    );
  }

  if (latestFailedGitProduction) {
    const failedAt = latestFailedGitProduction.latest_stage?.ended_on || '(unknown time)';
    const commitHash =
      latestFailedGitProduction.deployment_trigger?.metadata?.commit_hash ||
      latestFailedGitProduction.short_id;
    console.log(
      `Latest failed Git production deployment: ${latestFailedGitProduction.short_id} (${String(commitHash).slice(0, 12)}) at ${failedAt}`,
    );
    if (failureReason) {
      console.log(`Failure reason: ${failureReason}`);
    }
  }

  if (failures.length > 0) {
    console.log('\nFailures');
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
  }

  if (warnings.length > 0) {
    console.log('\nWarnings');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.log(
      '\nAction: mirror the required VITE_* keys into Cloudflare Pages -> Settings -> Variables and Secrets for both Production and Preview, then rerun this audit.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nPages Git build configuration looks healthy.');
}

main().catch((error) => {
  console.error(`Pages Git build audit failed: ${error.message}`);
  process.exitCode = 1;
});
