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
import { loadConfig } from "../lib/config";

const app = new cdk.App();

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(
    "⚠ No deploy-config.json found (or it is invalid).\n" +
    "  Run `npm run configure` to set up deployment targets.\n"
  );
  process.exit(1);
}

for (const target of config.deployments) {
  const stackName = `Th4Dev-${target.id}`;

  new StaticSiteStack(app, stackName, {
    target,
    env: {
      // CloudFront certs must be in us-east-1; deploy whole stack there
      // unless user specified a different region for the bucket.
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: target.region || "us-east-1",
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
