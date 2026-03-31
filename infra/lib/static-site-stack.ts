import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import * as path from "path";
import type { DeploymentTarget } from "./config";

/**
 * Props for a single th4dev static site deployment.
 */
export interface StaticSiteStackProps extends cdk.StackProps {
  target: DeploymentTarget;
}

/**
 * Deploys a static Vite site to S3 behind CloudFront with a custom domain.
 *
 * Resources created:
 *  - S3 bucket (private, OAC-secured)
 *  - ACM certificate (DNS-validated in us-east-1 for CloudFront)
 *  - CloudFront distribution with custom domain + HTTPS
 *  - Route 53 A + AAAA alias records pointing at CloudFront
 *  - S3 deployment of the built frontend assets
 */
export class StaticSiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StaticSiteStackProps) {
    super(scope, id, {
      ...props,
      // CloudFront requires ACM certs in us-east-1; cross-region references
      // are handled automatically by CDK when using DnsValidatedCertificate
      // or by deploying the whole stack to us-east-1.
      crossRegionReferences: true,
    });

    const { target } = props;

    // ── S3 Bucket ──────────────────────────────────────────────────────

    this.bucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: target.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: false,
    });

    // ── Route 53 Hosted Zone Lookup ────────────────────────────────────

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        zoneName: target.hostedZoneDomain,
        hostedZoneId: target.hostedZoneId,
      },
    );

    // ── ACM Certificate (must be in us-east-1 for CloudFront) ──────────

    const certificate = new acm.Certificate(this, "SiteCertificate", {
      domainName: target.domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ── CloudFront Distribution ────────────────────────────────────────

    this.distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      domainNames: [target.domainName],
      certificate,
      defaultRootObject: "index.html",
      // SPA fallback: serve index.html for 403/404 so client-side routing works
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // ── Route 53 Alias Records ─────────────────────────────────────────

    new route53.ARecord(this, "AliasA", {
      zone: hostedZone,
      recordName: target.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution),
      ),
    });

    new route53.AaaaRecord(this, "AliasAAAA", {
      zone: hostedZone,
      recordName: target.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution),
      ),
    });

    // ── Deploy Site Assets ─────────────────────────────────────────────

    const distPath = path.resolve(__dirname, "..", "..", "dist");

    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(distPath)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });

    // ── Outputs ────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, "SiteUrl", {
      value: `https://${target.domainName}`,
      description: "Website URL",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront distribution ID",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
      description: "S3 bucket name",
    });
  }
}
