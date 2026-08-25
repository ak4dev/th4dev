#!/usr/bin/env node

/**
 * CDK App entry point.
 *
 * Reads deploy-config.json and creates one StaticSiteStack per deployment
 * target. Each stack is independent and can be deployed/destroyed separately.
 *
 * Usage:
 *   npx cdk deploy --all          # deploy every target
 *   npx cdk deploy Th4Dev-prod    # deploy only "prod"
 *   npx cdk diff                  # preview all changes
 */

import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { StaticSiteStack } from "../lib/static-site-stack";
import { loadConfig, STACK_REGION } from "../lib/config";

const app = new cdk.App();

let config;
try {
  config = loadConfig();
} catch (err) {
  const problem =
    (err as NodeJS.ErrnoException).code === "ENOENT"
      ? "No deploy-config.json found."
      : `Could not load deploy-config.json: ${err instanceof Error ? err.message : String(err)}`;
  console.error(
    `⚠ ${problem}\n  Run \`npm run configure\` to set up deployment targets.\n`,
  );
  process.exit(1);
}

for (const target of config.deployments) {
  const stackName = `Th4Dev-${target.id}`;

  new StaticSiteStack(app, stackName, {
    target,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      // loadConfig() guarantees this is us-east-1, where CloudFront needs the cert
      region: target.region ?? STACK_REGION,
    },
    description: `th4dev static site: ${target.domainName}`,
    tags: {
      Project: "th4dev",
      Environment: target.id,
      ManagedBy: "cdk",
    },
  });
}

app.synth();
