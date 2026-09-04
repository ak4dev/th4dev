import * as fs from "fs";
import * as path from "path";

/** The only region CloudFront accepts ACM certificates from. */
export const STACK_REGION = "us-east-1";

/**
 * Deployment target configuration.
 *
 * Each entry in `deployments` represents one independent environment
 * (S3 bucket + CloudFront distribution + Route 53 alias records).
 *
 * `deploy-config.json` is written by `npm run configure` and is gitignored
 * (it holds account-specific hosted zone IDs); `deploy-config.example.json`
 * shows the shape.
 */
export interface DeploymentTarget {
  /** Unique identifier for this deployment (e.g. "prod", "dev", "staging") */
  id: string;
  /** Fully qualified domain name (e.g. "app.example.com") */
  domainName: string;
  /** Route 53 hosted zone domain (e.g. "example.com") */
  hostedZoneDomain: string;
  /** Route 53 hosted zone ID */
  hostedZoneId: string;
  /** S3 bucket name for the site assets */
  bucketName: string;
  /**
   * AWS region for the stack. CloudFront only accepts ACM certificates issued
   * in us-east-1, so this must be "us-east-1" (the default when omitted).
   */
  region?: string;
}

export interface DeployConfig {
  deployments: DeploymentTarget[];
}

const REQUIRED_FIELDS = [
  "id",
  "domainName",
  "hostedZoneDomain",
  "hostedZoneId",
  "bucketName",
] as const;

/**
 * Lower-cases a domain name and drops the optional trailing root dot, so
 * "App.Example.Com." and "app.example.com" compare equal.
 */
function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/\.$/, "");
}

export function loadConfig(
  configPath = path.resolve(__dirname, "..", "deploy-config.json"),
): DeployConfig {
  const config = JSON.parse(
    fs.readFileSync(configPath, "utf-8"),
  ) as DeployConfig | null;

  if (!Array.isArray(config?.deployments)) {
    throw new Error(
      "deploy-config.json must contain a `deployments` array. Run `npm run configure` first.",
    );
  }

  for (const d of config.deployments) {
    const name = d.id || "(unnamed)";
    if (REQUIRED_FIELDS.some((field) => !d[field])) {
      throw new Error(
        `Deployment "${name}" is missing required fields. Run \`npm run configure\` to fix.`,
      );
    }
    if (d.region !== undefined && d.region !== STACK_REGION) {
      throw new Error(
        `Deployment "${name}" has region "${d.region}", but CloudFront requires its ACM certificate in ${STACK_REGION}. Remove the region or set it to "${STACK_REGION}".`,
      );
    }
    const fqdn = normalizeDomain(d.domainName);
    const zone = normalizeDomain(d.hostedZoneDomain);
    if (fqdn !== zone && !fqdn.endsWith(`.${zone}`)) {
      throw new Error(
        `Deployment "${name}" has domainName "${d.domainName}", which is not inside hostedZoneDomain "${d.hostedZoneDomain}". The ACM certificate is DNS-validated in that hosted zone, so a mismatch synthesizes cleanly and then stalls the deploy waiting for a validation record that can never be written.`,
      );
    }
  }

  return config;
}
