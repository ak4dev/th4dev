import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as fs from "fs";
import * as path from "path";
import { StaticSiteStack } from "../lib/static-site-stack";
import type { DeploymentTarget } from "../lib/config";

const distPath = path.resolve(__dirname, "..", "..", "dist");

const testTarget: DeploymentTarget = {
  id: "test",
  domainName: "app.example.com",
  hostedZoneDomain: "example.com",
  hostedZoneId: "Z0123456789ABCDEF",
  bucketName: "th4dev-test",
  region: "us-east-1",
};

function createStack(target: DeploymentTarget = testTarget): Template {
  const app = new cdk.App();
  const stack = new StaticSiteStack(app, "TestStack", {
    target,
    env: { account: "123456789012", region: target.region },
  });
  return Template.fromStack(stack);
}

// CDK S3 BucketDeployment requires the asset path to exist.
// Ensure a dist/ folder exists (may be a real build or a stub).
let createdDummyDist = false;
beforeAll(() => {
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
    fs.writeFileSync(path.join(distPath, "index.html"), "<html></html>");
    createdDummyDist = true;
  }
});
afterAll(() => {
  if (createdDummyDist) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }
});

describe("StaticSiteStack", () => {
  let template: Template;

  beforeAll(() => {
    template = createStack();
  });

  test("creates an S3 bucket with block public access", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "th4dev-test",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test("creates a CloudFront distribution", () => {
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  test("CloudFront distribution uses the custom domain name", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Aliases: ["app.example.com"],
      },
    });
  });

  test("CloudFront has SPA error response fallbacks", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          }),
        ]),
      },
    });
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          }),
        ]),
      },
    });
  });

  test("creates an ACM certificate for the domain", () => {
    template.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: "app.example.com",
    });
  });

  test("creates Route 53 A record", () => {
    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "app.example.com.",
      Type: "A",
    });
  });

  test("creates Route 53 AAAA record", () => {
    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "app.example.com.",
      Type: "AAAA",
    });
  });

  test("outputs include the site URL", () => {
    template.hasOutput("SiteUrl", {
      Value: "https://app.example.com",
    });
  });

  test("outputs include the distribution ID", () => {
    template.hasOutput("DistributionId", Match.anyValue());
  });

  test("outputs include the bucket name", () => {
    template.hasOutput("BucketName", Match.anyValue());
  });
});

describe("StaticSiteStack — multiple targets", () => {
  test("each target produces an independent stack", () => {
    const app = new cdk.App();
    const targetA: DeploymentTarget = {
      ...testTarget,
      id: "prod",
      domainName: "prod.example.com",
      bucketName: "th4dev-prod",
    };
    const targetB: DeploymentTarget = {
      ...testTarget,
      id: "dev",
      domainName: "dev.example.com",
      bucketName: "th4dev-dev",
    };

    const stackA = new StaticSiteStack(app, "Th4Dev-prod", {
      target: targetA,
      env: { account: "123456789012", region: "us-east-1" },
    });
    const stackB = new StaticSiteStack(app, "Th4Dev-dev", {
      target: targetB,
      env: { account: "123456789012", region: "us-east-1" },
    });

    const templateA = Template.fromStack(stackA);
    const templateB = Template.fromStack(stackB);

    templateA.hasResourceProperties("AWS::S3::Bucket", { BucketName: "th4dev-prod" });
    templateB.hasResourceProperties("AWS::S3::Bucket", { BucketName: "th4dev-dev" });

    templateA.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: { Aliases: ["prod.example.com"] },
    });
    templateB.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: { Aliases: ["dev.example.com"] },
    });
  });

  test("stacks can target different Route 53 zones", () => {
    const app = new cdk.App();
    const targetA: DeploymentTarget = {
      id: "site-a",
      domainName: "app.alpha.com",
      hostedZoneDomain: "alpha.com",
      hostedZoneId: "ZAAAA",
      bucketName: "th4dev-alpha",
      region: "us-east-1",
    };
    const targetB: DeploymentTarget = {
      id: "site-b",
      domainName: "app.beta.io",
      hostedZoneDomain: "beta.io",
      hostedZoneId: "ZBBBB",
      bucketName: "th4dev-beta",
      region: "us-east-1",
    };

    const stackA = new StaticSiteStack(app, "Th4Dev-alpha", {
      target: targetA,
      env: { account: "123456789012", region: "us-east-1" },
    });
    const stackB = new StaticSiteStack(app, "Th4Dev-beta", {
      target: targetB,
      env: { account: "123456789012", region: "us-east-1" },
    });

    const templateA = Template.fromStack(stackA);
    const templateB = Template.fromStack(stackB);

    templateA.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "app.alpha.com.",
      Type: "A",
    });
    templateB.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "app.beta.io.",
      Type: "A",
    });
  });
});

describe("config validation", () => {
  test("loadConfig throws on missing deployments array", () => {
    const configPath = path.resolve(__dirname, "..", "deploy-config.json");
    const original = fs.readFileSync(configPath, "utf-8");
    try {
      fs.writeFileSync(configPath, JSON.stringify({ wrong: true }));
      // Clear ALL cached modules so loadConfig re-reads from disk
      const configJsonPath = require.resolve("../deploy-config.json");
      const configModulePath = require.resolve("../lib/config");
      delete require.cache[configJsonPath];
      delete require.cache[configModulePath];
      const freshModule = require("../lib/config");
      expect(() => freshModule.loadConfig()).toThrow("deployments");
    } finally {
      fs.writeFileSync(configPath, original);
      const configJsonPath = require.resolve("../deploy-config.json");
      const configModulePath = require.resolve("../lib/config");
      delete require.cache[configJsonPath];
      delete require.cache[configModulePath];
    }
  });
});
