import { describe, expect, it } from "vitest";
import type {
  CodingAgentHostClient,
  RemoteCodingAgentHostComposition,
  RemoteCodingAgentHostCompositionOptions,
  RemoteCodingEventStream,
} from "@wanex/coding/host";
import type { ResolvedSecret } from "@wanex/runtime/secrets";
import type { RemoteConnectionProfile } from "../src/remote/profile.js";
import {
  createRemoteCodingConnection,
  createRemoteCodingConnectionManager,
} from "../src/remote/connection.js";
import type { RemoteConnectionProfileCatalog } from "../src/remote/profiles.js";

describe("Desktop remote Coding connection", () => {
  it("returns after handshake while the event stream connects asynchronously", async () => {
    const profile = testProfile("async");
    const profiles = testProfiles(profile, "remote-secret");
    let captured: RemoteCodingAgentHostCompositionOptions | undefined;
    let eventOptions: Parameters<
      RemoteCodingAgentHostComposition["startEvents"]
    >[0];
    const client = {} as CodingAgentHostClient;
    const composition = fakeComposition(client, (options, nextEventOptions) => {
      captured = options;
      eventOptions = nextEventOptions;
    });
    const connection = createRemoteCodingConnection({
      profile,
      profiles,
      clientId: "desktop-test.async",
      createComposition: async (options) => composition(options),
    });
    const events: string[] = [];
    connection.subscribe((event) => {
      events.push(event.kind === "state-changed" ? event.state : event.reason);
    });

    const connected = await connection.connect();

    expect(connected).toBe(client);
    expect(connection.state).toBe("connecting");
    expect(captured?.messageUrl).toBe(profile.endpoint);
    expect(await captured?.getBearerToken()).toBe("remote-secret");
    expect(events).toContain("connecting");

    eventOptions?.onStateChange?.("open");
    expect(connection.state).toBe("connected");
    await connection.close();
    expect(connection.state).toBe("closed");
  });

  it("projects canonical reread signals and can explicitly restart a closed stream", async () => {
    const profile = testProfile("reconnect");
    const profiles = testProfiles(profile, "reconnect-secret");
    const eventOptions: Parameters<
      RemoteCodingAgentHostComposition["startEvents"]
    >[0][] = [];
    const streams: FakeStream[] = [];
    const client = {} as CodingAgentHostClient;
    const connection = createRemoteCodingConnection({
      profile,
      profiles,
      createComposition: async () => ({
        client,
        startEvents(options) {
          eventOptions.push(options);
          const stream = new FakeStream({ options });
          streams.push(stream);
          options?.onStateChange?.("connecting");
          return stream;
        },
        async close() {
          streams.at(-1)?.close();
        },
      }),
    });
    const reasons: string[] = [];
    connection.subscribe((event) => {
      if (event.kind === "canonical-read-required") reasons.push(event.reason);
    });

    await connection.connect();
    eventOptions[0]?.onStateChange?.("open");
    await connection.reconnectEvents();
    expect(streams).toHaveLength(2);
    eventOptions[1]?.onStateChange?.("open");
    eventOptions[1]?.onCanonicalReadRequired?.("gap");
    streams[1]?.close();
    await streams[1]?.closed;
    expect(connection.state).toBe("unavailable");
    expect(reasons).toEqual(["gap"]);

    await connection.reconnectEvents();
    expect(streams).toHaveLength(3);
    eventOptions[2]?.onStateChange?.("open");
    expect(connection.state).toBe("connected");
    await connection.close();
  });

  it("does not restart an event stream when close wins a reconnect race", async () => {
    const profile = testProfile("close-race");
    const profiles = testProfiles(profile, "close-race-secret");
    const streams: BlockingStream[] = [];
    let startCount = 0;
    const connection = createRemoteCodingConnection({
      profile,
      profiles,
      createComposition: async () => ({
        client: {} as CodingAgentHostClient,
        startEvents(options) {
          startCount += 1;
          const stream = new BlockingStream({ options });
          streams.push(stream);
          options?.onStateChange?.("connecting");
          return stream;
        },
        async close() {
          streams.at(-1)?.release();
        },
      }),
    });

    await connection.connect();
    const reconnect = connection.reconnectEvents();
    await Promise.resolve();
    const closing = connection.close();
    streams[0]?.release();

    await expect(reconnect).rejects.toThrow(
      "remote Coding connection is closed",
    );
    await closing;
    expect(startCount).toBe(1);
  });

  it("reuses one connection per profile and closes all managed connections", async () => {
    const profile = testProfile("managed");
    const profiles = testProfiles(profile, "managed-secret");
    let compositionCount = 0;
    const manager = createRemoteCodingConnectionManager({
      profiles,
      createComposition: async () => {
        compositionCount += 1;
        return {
          client: {} as CodingAgentHostClient,
          startEvents() {
            const stream = new FakeStream();
            stream.open();
            return stream;
          },
          async close() {},
        };
      },
    });

    const [first, second] = await Promise.all([
      manager.connect(profile.profileId),
      manager.connect(profile.profileId),
    ]);
    expect(second).toBe(first);
    expect(compositionCount).toBe(1);
    expect(manager.get(profile.profileId)).toBe(first);

    await manager.close();
    expect(first.state).toBe("closed");
    expect(manager.get(profile.profileId)).toBeUndefined();
  });
});

function testProfile(profileId: string): RemoteConnectionProfile {
  return {
    profileId,
    name: profileId,
    endpoint: `https://${profileId}.example.test/v1/agent-host/message`,
    credentialConfigured: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function testProfiles(
  profile: RemoteConnectionProfile,
  credential: string,
): RemoteConnectionProfileCatalog {
  return {
    async list() {
      return [profile];
    },
    async read(profileId) {
      return profileId === profile.profileId ? profile : null;
    },
    async resolveCredential(profileId) {
      return profileId === profile.profileId
        ? resolvedSecret(credential)
        : null;
    },
    async reconcileCredentialRetirement() {
      return false;
    },
    async save() {
      return profile;
    },
    async remove() {},
  };
}

function resolvedSecret(value: string): ResolvedSecret {
  let disposed = false;
  return {
    ref: "wanex-keychain://test/remote",
    provider: "test",
    get disposed() {
      return disposed;
    },
    reveal() {
      if (disposed) throw new Error("secret is disposed");
      return value;
    },
    dispose() {
      disposed = true;
    },
    toJSON() {
      throw new Error("secret must not be serialized");
    },
  };
}

function fakeComposition(
  client: CodingAgentHostClient,
  capture: (
    options: RemoteCodingAgentHostCompositionOptions,
    eventOptions: Parameters<
      RemoteCodingAgentHostComposition["startEvents"]
    >[0],
  ) => void,
): (
  options: RemoteCodingAgentHostCompositionOptions,
) => RemoteCodingAgentHostComposition {
  return (options) => ({
    client,
    startEvents(eventOptions) {
      capture(options, eventOptions);
      eventOptions?.onStateChange?.("connecting");
      return new FakeStream({ options: eventOptions });
    },
    async close() {},
  });
}

class FakeStream implements RemoteCodingEventStream {
  readonly ready = Promise.resolve();
  readonly closed: Promise<void>;
  readonly #resolveClosed: () => void;
  readonly #options:
    | Parameters<RemoteCodingAgentHostComposition["startEvents"]>[0]
    | undefined;
  #closed = false;

  constructor(
    input: {
      readonly options?: Parameters<
        RemoteCodingAgentHostComposition["startEvents"]
      >[0];
    } = {},
  ) {
    this.#options = input.options;
    let resolveClosed!: () => void;
    this.closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#options?.onStateChange?.("closed");
    this.#resolveClosed();
  }

  open(): void {
    this.#options?.onStateChange?.("open");
  }
}

class BlockingStream implements RemoteCodingEventStream {
  readonly ready = Promise.resolve();
  readonly closed: Promise<void>;
  readonly #resolveClosed: () => void;
  readonly #options:
    | Parameters<RemoteCodingAgentHostComposition["startEvents"]>[0]
    | undefined;
  #released = false;

  constructor(input: {
    readonly options?: Parameters<
      RemoteCodingAgentHostComposition["startEvents"]
    >[0];
  }) {
    this.#options = input.options;
    let resolveClosed!: () => void;
    this.closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;
  }

  close(): void {
    this.#options?.onStateChange?.("closed");
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    this.#resolveClosed();
  }
}
