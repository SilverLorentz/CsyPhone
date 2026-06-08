import path from 'node:path';
import process from 'node:process';

import {
  PREVIEW_ENV_FILE,
  PRODUCTION_ENV_FILE,
  PROJECT_NAME,
  REQUIRED_PAGES_ENV_KEYS,
  assertRequiredEnvValues,
  clearPagesProjectEnvKeys,
  fetchPagesProject,
  findPagesEnvKeysWithMismatchedType,
  formatKeyList,
  getCloudflareAccountId,
  getEnvKeysForConfig,
  patchPagesProjectDeploymentConfigs,
  readCloudflareToken,
  readEnvFile,
} from './cloudflare-pages-utils.mjs';

async function main() {
  const token = await readCloudflareToken();
  const accountId = getCloudflareAccountId();
  const productionEnvPath = path.join(process.cwd(), PRODUCTION_ENV_FILE);
  const previewEnvPath = path.join(process.cwd(), PREVIEW_ENV_FILE);

  const [productionEnvMap, previewEnvMap, currentProject] = await Promise.all([
    readEnvFile(productionEnvPath),
    readEnvFile(previewEnvPath),
    fetchPagesProject({ token, accountId, projectName: PROJECT_NAME }),
  ]);

  const productionEnvValues = assertRequiredEnvValues(
    productionEnvMap,
    PRODUCTION_ENV_FILE,
    REQUIRED_PAGES_ENV_KEYS,
  );
  const previewEnvValues = assertRequiredEnvValues(
    previewEnvMap,
    PREVIEW_ENV_FILE,
    REQUIRED_PAGES_ENV_KEYS,
  );

  console.log(`Syncing Cloudflare Pages env vars for ${PROJECT_NAME}`);
  console.log(`Account: ${accountId}`);
  console.log(
    `Production keys to sync: ${formatKeyList(Object.keys(productionEnvValues).sort())}`,
  );
  console.log(`Preview keys to sync: ${formatKeyList(Object.keys(previewEnvValues).sort())}`);
  console.log(
    `Current Pages production env keys: ${formatKeyList(getEnvKeysForConfig(currentProject.deployment_configs?.production))}`,
  );
  console.log(
    `Current Pages preview env keys: ${formatKeyList(getEnvKeysForConfig(currentProject.deployment_configs?.preview))}`,
  );

  const productionKeysToRecreate = findPagesEnvKeysWithMismatchedType(
    currentProject.deployment_configs?.production,
    productionEnvValues,
  );
  const previewKeysToRecreate = findPagesEnvKeysWithMismatchedType(
    currentProject.deployment_configs?.preview,
    previewEnvValues,
  );

  let projectForWrite = currentProject;
  if (productionKeysToRecreate.length > 0 || previewKeysToRecreate.length > 0) {
    console.log(
      `Recreating mismatched production key types: ${formatKeyList(productionKeysToRecreate)}`,
    );
    console.log(
      `Recreating mismatched preview key types: ${formatKeyList(previewKeysToRecreate)}`,
    );
    projectForWrite = await clearPagesProjectEnvKeys({
      token,
      project: currentProject,
      productionKeys: productionKeysToRecreate,
      previewKeys: previewKeysToRecreate,
      accountId,
      projectName: PROJECT_NAME,
    });
  }

  const updatedProject = await patchPagesProjectDeploymentConfigs({
    token,
    project: projectForWrite,
    productionEnvValues,
    previewEnvValues,
    accountId,
    projectName: PROJECT_NAME,
  });

  console.log('Cloudflare Pages env var sync complete.');
  console.log(
    `Updated Pages production env keys: ${formatKeyList(getEnvKeysForConfig(updatedProject.deployment_configs?.production))}`,
  );
  console.log(
    `Updated Pages preview env keys: ${formatKeyList(getEnvKeysForConfig(updatedProject.deployment_configs?.preview))}`,
  );
}

main().catch((error) => {
  console.error(`Pages env sync failed: ${error.message}`);
  process.exitCode = 1;
});
