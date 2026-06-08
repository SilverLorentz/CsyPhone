import process from 'node:process';

import {
  fetchPagesDeploymentLogs,
  findLatestFailedGitProductionDeployment,
  getCloudflareAccountId,
  listPagesDeployments,
  parseFailureReason,
  readCloudflareToken,
  retryPagesDeployment,
  waitForPagesDeployment,
} from './cloudflare-pages-utils.mjs';

async function main() {
  const token = await readCloudflareToken();
  const accountId = getCloudflareAccountId();
  const requestedDeploymentId = process.argv[2] || '';

  const deployments = await listPagesDeployments({
    token,
    accountId,
    environment: 'production',
    perPage: 25,
  });
  const targetDeployment = requestedDeploymentId
    ? (deployments || []).find((deployment) => deployment.id === requestedDeploymentId)
    : findLatestFailedGitProductionDeployment(deployments);

  if (!targetDeployment) {
    throw new Error(
      requestedDeploymentId
        ? `Production deployment ${requestedDeploymentId} was not found.`
        : 'No failed Git-triggered production deployment was found to retry.',
    );
  }

  const sourceDeploymentId = targetDeployment.id;
  console.log(`Retrying Pages deployment ${sourceDeploymentId}...`);
  const retriedDeployment = await retryPagesDeployment({
    token,
    accountId,
    deploymentId: sourceDeploymentId,
  });

  console.log(`Retry accepted: ${retriedDeployment.id}`);
  const settledDeployment = await waitForPagesDeployment({
    token,
    accountId,
    deploymentId: retriedDeployment.id,
  });

  if (settledDeployment.latest_stage?.status === 'success') {
    console.log(
      `Pages deployment succeeded: ${settledDeployment.short_id} -> ${settledDeployment.url}`,
    );
    return;
  }

  const logs = await fetchPagesDeploymentLogs({
    token,
    accountId,
    deploymentId: settledDeployment.id,
  });
  const failureReason = parseFailureReason(logs?.data || []);
  throw new Error(
    failureReason
      ? `Retry failed for ${settledDeployment.short_id}: ${failureReason}`
      : `Retry failed for ${settledDeployment.short_id}.`,
  );
}

main().catch((error) => {
  console.error(`Pages deployment retry failed: ${error.message}`);
  process.exitCode = 1;
});
