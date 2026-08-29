import {
  MacosSeatbeltExecutionEnvironment,
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  type ExecutionEnvironment,
  type NativeExecutionEnvironmentOptions,
} from "@wanex/runtime/execution";

export type DesktopExecutionEnvironmentKind = "native" | "macos-seatbelt";

export function createDesktopExecutionEnvironment(options: {
  readonly kind: DesktopExecutionEnvironmentKind;
  readonly environmentId: string;
  readonly serviceBin: string;
}): ExecutionEnvironment {
  const childSupervisor = new NativeChildSupervisor({
    serviceBin: options.serviceBin,
  });
  if (options.kind === "macos-seatbelt") {
    return new MacosSeatbeltExecutionEnvironment({
      environmentId: options.environmentId,
      childSupervisor,
      nativeEnvironmentFactory: createNativeExecutionEnvironment,
    });
  }
  return createNativeExecutionEnvironment({
    environmentId: options.environmentId,
    managedProcess: true,
    strategy: {
      kind: "supervised",
      childSupervisor,
    },
  });
}

function createNativeExecutionEnvironment(
  options: NativeExecutionEnvironmentOptions,
): ExecutionEnvironment {
  return new NativeExecutionEnvironment(options);
}
