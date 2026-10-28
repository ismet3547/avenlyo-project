import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertWorkspaceId,
  developmentWorkspaceContext,
} from "../../lib/db/tenant-context";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("development workspace context", () => {
  it("accepts a server-side UUID in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "AVENLYO_DEV_WORKSPACE_ID",
      "01900000-0000-7000-8000-000000000002",
    );

    expect(developmentWorkspaceContext()).toEqual({
      workspaceId: "01900000-0000-7000-8000-000000000002",
      source: "development",
    });
  });

  it("fails closed in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "AVENLYO_DEV_WORKSPACE_ID",
      "01900000-0000-7000-8000-000000000002",
    );

    expect(() => developmentWorkspaceContext()).toThrow(/Production/);
  });

  it("rejects malformed workspace IDs", () => {
    expect(() => assertWorkspaceId("workspace-from-client")).toThrow(/Geçersiz/);
  });
});
