import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as fs from "fs";
import * as path from "path";
import { StaticSiteStack } from "../lib/static-site-stack";
import { type DeploymentTarget } from "../lib/config";

/**
 * The exact Content-Security-Policy the distribution must serve. Spelled out
 * here rather than imported so a change to the stack has to be made twice,
 * deliberately: `style-src 'unsafe-inline'` is load-bearing for Radix's
 * scroll lock and html2canvas, and `connect-src https:` for the
 * user-configurable stock API endpoint.
 */
const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src https:; " +
  "frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; " +
  "frame-ancestors 'none'";

const EXPECTED_PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

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
 * The feature flags cdk.json pins, so these templates are synthesized with
 * exactly the configuration `cdk synth`/`cdk deploy` uses.
 */
const cdkContext = (
  JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "cdk.json"), "utf-8"),
  ) as { context: Record<string, unknown> }
).context;

/**
 * Builds one stack per override set in a shared app and returns their
 * templates. All stacks are constructed before the first synth because the
 * construct tree must not change once Template.fromStack() has run.
 */
function synth(...overrides: Partial<DeploymentTarget>[]): Template[] {
  const app = new cdk.App({ context: cdkContext });
  return overrides
    .map((o) => {
      const target = { ...testTarget, ...o };
      return new StaticSiteStack(app, `Th4Dev-${target.id}`, { target, env });
    })
    .map((stack) => Template.fromStack(stack));
}

/**
 * The slice of a synthesized AWS::CloudFront::ResponseHeadersPolicy that
 * contentSecurityPolicy() reads. `Template.findResources` is typed as a bag of
 * `any`, so name the shape once here rather than walking it untyped.
 */
interface ResponseHeadersPolicyResource {
  Properties: {
    ResponseHeadersPolicyConfig: {
      SecurityHeadersConfig: {
        ContentSecurityPolicy: { ContentSecurityPolicy: string };
      };
    };
  };
}

/** Reads the Content-Security-Policy out of a synthesized template. */
function contentSecurityPolicy(template: Template): string {
  const [policy] = Object.values(
    template.findResources("AWS::CloudFront::ResponseHeadersPolicy"),
  ) as ResponseHeadersPolicyResource[];
  return policy.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
    .ContentSecurityPolicy.ContentSecurityPolicy;
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

  test("bucket policy denies non-TLS requests", () => {
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Action: "s3:*",
            Principal: { AWS: "*" },
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          }),
        ]),
      }),
    });
  });

  test("distribution is hardened", () => {
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
    // The bucket is private: the origin is reached through an OAC, not a
    // legacy origin access identity and not public read.
    template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https",
          Compress: true,
          // AWS managed CachingOptimized policy
          CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
        }),
        ViewerCertificate: Match.objectLike({
          MinimumProtocolVersion: "TLSv1.2_2021",
          SslSupportMethod: "sni-only",
        }),
        HttpVersion: "http2and3",
        Origins: Match.arrayWith([
          Match.objectLike({
            OriginAccessControlId: Match.anyValue(),
            S3OriginConfig: { OriginAccessIdentity: "" },
          }),
        ]),
      }),
    });
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
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 31536000,
            IncludeSubdomains: true,
            Override: true,
            // Not preloaded: the header alone is reversible, submitting the
            // domain to the browser preload list is not.
            Preload: Match.absent(),
          },
          ContentTypeOptions: Match.objectLike({ Override: true }),
          FrameOptions: { FrameOption: "DENY", Override: true },
          ReferrerPolicy: {
            ReferrerPolicy: "strict-origin-when-cross-origin",
            Override: true,
          },
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

  test("serves the expected Content-Security-Policy", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: {
            ContentSecurityPolicy: EXPECTED_CSP,
            Override: true,
          },
        }),
      }),
    });
  });

  test("Content-Security-Policy keeps the sources the app needs", () => {
    const csp = contentSecurityPolicy(template);
    // Radix's scroll lock (react-style-singleton) and html2canvas's document
    // clone both write inline styles
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    // the stock quote endpoint is user-configurable
    expect(csp).toContain("connect-src https:");
    // html2canvas rasterises the chart through a data: URL image, jsPDF
    // hands the file over as a blob
    expect(csp).toContain("img-src 'self' data: blob:");
    // html2canvas clones the document into a hidden about:blank iframe
    expect(csp).toContain("frame-src 'self'");
    // no inline scripts in the built index.html, and nothing to embed
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("denies every optional browser capability", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        CustomHeadersConfig: {
          Items: [
            {
              Header: "Permissions-Policy",
              Value: EXPECTED_PERMISSIONS_POLICY,
              Override: true,
            },
          ],
        },
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
