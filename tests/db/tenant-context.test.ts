import { afterEach, describe, expect, it } from "vitest";
import {
  assertWorkspaceId,
  developmentWorkspaceContext,
} from "../../lib/db/tenant-context";

const originalNodeEnv = process.env.NODE_ENV;
const originalWorkspace = process.env.AVENLYO_DEV_WORKSPACE_ID;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalWorkspace === undefined) delete process.env.AVENLYO_DEV_WORKSPACE_ID;
  else process.env.AVENLYO_DEV_WORKSPACE_ID = originalWorkspace;
});

describe("development workspace context", () => {
  it("accepts a server-side UUID in development", () => {
    process.env.NODE_ENV = "development";
    process.env.AVENLYO_DEV_WORKSPACE_ID = "01900000-0000-7000-8000-000000000002";
    expect(developmentWorkspaceContext()).toEqual({
      workspaceId: "01900000-0000-7000-8000-000000000002",
      source: "development",
    });
  });

  it("fails closed in production", () => {
    process.env.NODE_ENV = "production";
    process.env.AVENLYO_DEV_WORKSPACE_ID = "01900000-0000-7000-8000-000000000002";
    expect(() => developmentWorkspaceContext()).toThrow(/Production/);
  });

  it("rejects malformed workspace IDs", () => {
    expect(() => assertWorkspaceId("workspace-from-client")).toThrow(/Geçersiz/);
  });
});
