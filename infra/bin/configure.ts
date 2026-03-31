#!/usr/bin/env ts-node

/**
 * Interactive configuration wizard.
 *
 * Prompts the user for deployment target details and writes them to
 * `deploy-config.json`. Can be re-run to add, edit, or remove targets.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { DeployConfig, DeploymentTarget } from "../lib/config";

const CONFIG_PATH = path.resolve(__dirname, "..", "deploy-config.json");

function loadExisting(): DeployConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as DeployConfig;
  } catch {
    return { deployments: [] };
  }
}

function save(config: DeployConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`\n✅ Saved ${config.deployments.length} deployment(s) to deploy-config.json`);
}

async function ask(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

async function askYesNo(rl: readline.Interface, question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(rl, `${question} ${hint}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

async function promptTarget(rl: readline.Interface, existing?: DeploymentTarget): Promise<DeploymentTarget> {
  console.log("\n--- Deployment Target Configuration ---");

  const id = await ask(rl, "  Deployment ID (e.g. prod, dev, staging)", existing?.id);
  const domainName = await ask(rl, "  Domain name (e.g. app.example.com)", existing?.domainName);
  const hostedZoneDomain = await ask(
    rl,
    "  Route 53 hosted zone domain (e.g. example.com)",
    existing?.hostedZoneDomain,
  );
  const hostedZoneId = await ask(rl, "  Route 53 hosted zone ID", existing?.hostedZoneId);
  const bucketName = await ask(
    rl,
    "  S3 bucket name",
    existing?.bucketName || `th4dev-${id}`,
  );
  const region = await ask(rl, "  AWS region", existing?.region || "us-east-1");

  return { id, domainName, hostedZoneDomain, hostedZoneId, bucketName, region };
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   th4dev — Deployment Configuration      ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const config = loadExisting();

  if (config.deployments.length > 0) {
    console.log(`Found ${config.deployments.length} existing deployment(s):`);
    config.deployments.forEach((d, i) => {
      console.log(`  ${i + 1}. [${d.id}] ${d.domainName} → s3://${d.bucketName} (${d.region})`);
    });

    const editExisting = await askYesNo(rl, "\nEdit existing deployments?", false);
    if (editExisting) {
      for (let i = 0; i < config.deployments.length; i++) {
        const d = config.deployments[i];
        const edit = await askYesNo(rl, `  Edit [${d.id}] ${d.domainName}?`, false);
        if (edit) {
          config.deployments[i] = await promptTarget(rl, d);
        }
        const remove = !edit && await askYesNo(rl, `  Remove [${d.id}]?`, false);
        if (remove) {
          config.deployments.splice(i, 1);
          i--;
        }
      }
    }
  }

  let addMore = true;
  while (addMore) {
    const target = await promptTarget(rl);
    config.deployments.push(target);
    addMore = await askYesNo(rl, "Add another deployment target?", false);
  }

  save(config);
  rl.close();

  console.log("\nNext steps:");
  console.log("  1. Build the frontend: cd .. && npm run build");
  console.log("  2. Deploy all stacks:  cd infra && npx cdk deploy --all");
  console.log("  3. Or deploy one:      npx cdk deploy Th4Dev-<id>\n");
}

main().catch((err) => {
  console.error("Configuration failed:", err);
  process.exit(1);
});
