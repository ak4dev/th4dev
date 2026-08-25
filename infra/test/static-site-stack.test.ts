import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { StaticSiteStack } from "../lib/static-site-stack";
import { loadConfig, type DeploymentTarget } from "../lib/config";

const distPath = path.resolve(__dirname, "..", "..", "dist");
const env = { account: "123456789012", region: "us-east-1" };

const testTarget: DeploymentTarget = {
  id: "test",
  domainName: "app.example.com",
  hostedZoneDomain: "example.com",
  hostedZoneId: "Z0123456789ABCDEF",
  bucketName: "th4dev-test",
};

/**
 * Builds one stack per override set in a shared app and returns their
 * templates. All stacks are constructed before the first synth because the
 * construct tree must not change once Template.fromStack() has run.
 */
function synth(...overrides: Partial<DeploymentTarget>[]): Template[] {
  const app = new cdk.App();
  return overrides
    .map((o) => {
      const target = { ...testTarget, ...o };
      return new StaticSiteStack(app, `Th4Dev-${target.id}`, { target, env });
    })
    .map((stack) => Template.fromStack(stack));
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
    [template] = synth({});
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
    for (const ErrorCode of [403, 404]) {
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode,
              ResponseCode: 200,
              ResponsePagePath: "/index.html",
            }),
          ]),
        },
      });
    }
  });

  test("attaches a security response headers policy", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          StrictTransportSecurity: Match.objectLike({ Override: true }),
          ContentTypeOptions: Match.objectLike({ Override: true }),
          FrameOptions: Match.objectLike({ FrameOption: "DENY" }),
        }),
      }),
    });
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ResponseHeadersPolicyId: Match.anyValue(),
        }),
      }),
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

  test("uploads hashed assets as immutable and never prunes them", () => {
    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      Exclude: ["*"],
      Include: ["assets/*"],
      Prune: false,
      SystemMetadata: {
        "cache-control": "public, max-age=31536000, immutable",
      },
      DistributionId: Match.absent(),
    });
  });

  test("uploads index.html as no-cache and invalidates CloudFront", () => {
    template.resourceCountIs("Custom::CDKBucketDeployment", 2);
    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      Exclude: ["assets/*"],
      Prune: false,
      SystemMetadata: { "cache-control": "no-cache, must-revalidate" },
      DistributionId: Match.anyValue(),
      DistributionPaths: ["/*"],
    });
  });

  test("publishes index.html only after the hashed assets", () => {
    const [assetsId] = Object.keys(
      template.findResources("Custom::CDKBucketDeployment", {
        Properties: { Include: ["assets/*"] },
      }),
    );
    template.hasResource("Custom::CDKBucketDeployment", {
      Properties: { Exclude: ["assets/*"] },
      DependsOn: Match.arrayWith([assetsId]),
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

  test("rejects a stack region other than us-east-1", () => {
    expect(
      () =>
        new StaticSiteStack(new cdk.App(), "Th4Dev-eu", {
          target: testTarget,
          env: { ...env, region: "eu-west-1" },
        }),
    ).toThrow(/must be deployed to us-east-1/);
  });
});

describe("StaticSiteStack — multiple targets", () => {
  test("each target produces an independent stack", () => {
    const [prod, dev] = synth(
      { id: "prod", domainName: "prod.example.com", bucketName: "th4dev-prod" },
      { id: "dev", domainName: "dev.example.com", bucketName: "th4dev-dev" },
    );

    prod.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "th4dev-prod",
    });
    dev.hasResourceProperties("AWS::S3::Bucket", { BucketName: "th4dev-dev" });
    prod.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: { Aliases: ["prod.example.com"] },
    });
    dev.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: { Aliases: ["dev.example.com"] },
    });
  });

  test("stacks can target different Route 53 zones", () => {
    const [alpha, beta] = synth(
      {
        id: "alpha",
        domainName: "app.alpha.com",
        hostedZoneDomain: "alpha.com",
        hostedZoneId: "ZAAAA",
        bucketName: "th4dev-alpha",
      },
      {
        id: "beta",
        domainName: "app.beta.io",
        hostedZoneDomain: "beta.io",
        hostedZoneId: "ZBBBB",
        bucketName: "th4dev-beta",
      },
    );

    alpha.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "app.alpha.com.",
      Type: "A",
    });
    beta.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "app.beta.io.",
      Type: "A",
    });
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "th4dev-"));
  });
  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Writes `contents` to a temp config file and returns a loader for it. */
  function loaderFor(name: string, contents: unknown): () => unknown {
    const file = path.join(tmpDir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(contents));
    return () => loadConfig(file);
  }

  test("accepts the committed example config", () => {
    const example = path.resolve(__dirname, "..", "deploy-config.example.json");
    expect(loadConfig(example).deployments).toHaveLength(1);
  });

  test("throws when the file is missing", () => {
    expect(() => loadConfig(path.join(tmpDir, "absent.json"))).toThrow(
      /ENOENT/,
    );
  });

  test("throws on missing deployments array", () => {
    expect(loaderFor("no-array", { wrong: true })).toThrow("deployments");
  });

  test("throws on a target missing required fields", () => {
    expect(loaderFor("partial", { deployments: [{ id: "prod" }] })).toThrow(
      'Deployment "prod" is missing required fields',
    );
  });

  test("throws on a region other than us-east-1", () => {
    expect(
      loaderFor("region", {
        deployments: [{ ...testTarget, region: "eu-west-1" }],
      }),
    ).toThrow(/us-east-1/);
    expect(
      loaderFor("region-ok", {
        deployments: [{ ...testTarget, region: "us-east-1" }],
      }),
    ).not.toThrow();
  });
});
