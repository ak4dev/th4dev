import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadConfig, type DeploymentTarget } from "../lib/config";

const testTarget: DeploymentTarget = {
  id: "test",
  domainName: "app.example.com",
  hostedZoneDomain: "example.com",
  hostedZoneId: "Z0123456789ABCDEF",
  bucketName: "th4dev-test",
};

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

  /** Returns a loader for a single deployment built from `testTarget`. */
  function loaderForTarget(
    name: string,
    overrides: Partial<DeploymentTarget>,
  ): () => unknown {
    return loaderFor(name, { deployments: [{ ...testTarget, ...overrides }] });
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
    expect(loaderForTarget("region", { region: "eu-west-1" })).toThrow(
      /us-east-1/,
    );
    expect(loaderForTarget("region-ok", { region: "us-east-1" })).not.toThrow();
  });

  test("throws when domainName is outside its hosted zone", () => {
    expect(
      loaderForTarget("outside", {
        domainName: "app.example.com",
        hostedZoneDomain: "other.com",
      }),
    ).toThrow(/not inside hostedZoneDomain/);
  });

  test("throws when domainName only shares a suffix with the zone", () => {
    // "notexample.com" ends with "example.com" but is a different zone
    expect(
      loaderForTarget("suffix", {
        domainName: "app.notexample.com",
        hostedZoneDomain: "example.com",
      }),
    ).toThrow(/not inside hostedZoneDomain/);
  });

  test("accepts a subdomain of the hosted zone", () => {
    expect(
      loaderForTarget("sub", {
        domainName: "app.example.com",
        hostedZoneDomain: "example.com",
      }),
    ).not.toThrow();
    expect(
      loaderForTarget("deep-sub", {
        domainName: "a.b.example.com",
        hostedZoneDomain: "example.com",
      }),
    ).not.toThrow();
  });

  test("accepts an apex domain equal to the hosted zone", () => {
    expect(
      loaderForTarget("apex", {
        domainName: "example.com",
        hostedZoneDomain: "example.com",
      }),
    ).not.toThrow();
  });

  test("accepts case and trailing-dot variants", () => {
    expect(
      loaderForTarget("case", {
        domainName: "App.Example.COM",
        hostedZoneDomain: "example.com",
      }),
    ).not.toThrow();
    expect(
      loaderForTarget("dotted", {
        domainName: "app.example.com.",
        hostedZoneDomain: "example.com.",
      }),
    ).not.toThrow();
    expect(
      loaderForTarget("dotted-apex", {
        domainName: "EXAMPLE.com.",
        hostedZoneDomain: "example.com",
      }),
    ).not.toThrow();
  });
});
