import { resolveSystemServiceBinary } from "@wanex/runtime/bootstrap";

export interface LocalSystemServiceEnvironment {
  readonly WANEX_SYSTEM_SERVICE_BIN?: string;
}

export type LocalSystemServiceSource =
  | {
      readonly kind: "installed";
      readonly env?: LocalSystemServiceEnvironment;
    }
  | {
      readonly kind: "artifact";
      readonly manifest: unknown;
      readonly artifactDir: string;
      readonly checkExecutable?: boolean;
    };

export interface ResolvedLocalSystemService {
  readonly path: string;
  readonly targetId?: string;
}

export async function resolveLocalSystemService(
  source: LocalSystemServiceSource,
): Promise<ResolvedLocalSystemService> {
  const resolved = await resolveSystemServiceBinary(
    source.kind === "installed"
      ? { ...(source.env === undefined ? {} : { env: source.env }) }
      : {
          manifest: source.manifest,
          artifactDir: source.artifactDir,
          ...(source.checkExecutable === undefined
            ? {}
            : { checkExecutable: source.checkExecutable }),
        },
  );
  return {
    path: resolved.path,
    ...(resolved.target === undefined ? {} : { targetId: resolved.target.id }),
  };
}
