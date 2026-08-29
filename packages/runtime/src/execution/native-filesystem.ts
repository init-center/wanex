import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ExecutionDirectoryEntry,
  ExecutionFileEffect,
  ExecutionFileMetadata,
  ExecutionFileSystem,
} from "./types.js";

interface NativeFileSystemRoot {
  readonly id: string;
  readonly path: string;
  readonly effects: ReadonlySet<ExecutionFileEffect>;
}

export class NativeExecutionFileSystem implements ExecutionFileSystem {
  readonly #roots: readonly NativeFileSystemRoot[];
  readonly #maxReadBytes: number;
  readonly #maxDirectoryEntries: number;
  readonly #assertOpen: () => void;

  private constructor(options: {
    readonly roots: readonly NativeFileSystemRoot[];
    readonly maxReadBytes: number;
    readonly maxDirectoryEntries: number;
    readonly assertOpen: () => void;
  }) {
    this.#roots = options.roots;
    this.#maxReadBytes = options.maxReadBytes;
    this.#maxDirectoryEntries = options.maxDirectoryEntries;
    this.#assertOpen = options.assertOpen;
  }

  static async create(options: {
    readonly roots: readonly {
      readonly id: string;
      readonly path: string;
      readonly effects: readonly ExecutionFileEffect[];
    }[];
    readonly maxReadBytes: number;
    readonly maxDirectoryEntries: number;
    readonly assertOpen: () => void;
  }): Promise<NativeExecutionFileSystem> {
    const roots: NativeFileSystemRoot[] = [];
    for (const root of options.roots) {
      if (!isAbsolute(root.path)) {
        throw new Error(
          `execution filesystem root must be absolute: ${root.id}`,
        );
      }
      const canonical = await realpath(resolve(root.path));
      if (roots.some((entry) => entry.id === root.id)) {
        throw new Error(`execution filesystem root is duplicated: ${root.id}`);
      }
      const overlap = roots.find(
        (entry) =>
          contained(entry.path, canonical) || contained(canonical, entry.path),
      );
      if (overlap !== undefined) {
        throw new Error(
          `execution filesystem roots overlap: ${overlap.id}, ${root.id}`,
        );
      }
      roots.push({
        id: root.id,
        path: canonical,
        effects: new Set(root.effects),
      });
    }
    return new NativeExecutionFileSystem({
      roots,
      maxReadBytes: options.maxReadBytes,
      maxDirectoryEntries: options.maxDirectoryEntries,
      assertOpen: options.assertOpen,
    });
  }

  async canonicalize(path: string): Promise<string> {
    this.#assertOpen();
    const root = await this.#authorize(path, "read", true);
    const canonical = await realpath(resolve(path));
    if (!contained(root.path, canonical)) throw accessDenied(path);
    return canonical;
  }

  async resolveWorkingDirectory(path: string): Promise<string> {
    this.#assertOpen();
    if (!isAbsolute(path) || path.includes("\0")) throw accessDenied(path);
    const canonical = await realpath(resolve(path));
    if (!this.#roots.some((root) => contained(root.path, canonical))) {
      throw accessDenied(path);
    }
    const metadata = await lstat(canonical);
    if (!metadata.isDirectory()) {
      throw new Error("execution process working directory is not a directory");
    }
    return canonical;
  }

  async metadata(path: string): Promise<ExecutionFileMetadata | null> {
    this.#assertOpen();
    await this.#authorize(path, "read", false);
    try {
      const value = await lstat(resolve(path));
      return {
        kind: value.isFile()
          ? "file"
          : value.isDirectory()
            ? "directory"
            : value.isSymbolicLink()
              ? "symlink"
              : "other",
        size: value.size,
        modifiedAt: value.mtimeMs,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async read(path: string): Promise<Uint8Array> {
    this.#assertOpen();
    await this.#authorize(path, "read", true);
    const metadata = await lstat(resolve(path));
    if (!metadata.isFile())
      throw new Error("execution filesystem path is not a file");
    if (metadata.size > this.#maxReadBytes) {
      throw new Error(
        `execution filesystem read exceeds ${this.#maxReadBytes} bytes`,
      );
    }
    const bytes = await readFile(resolve(path));
    if (bytes.byteLength > this.#maxReadBytes) {
      throw new Error(
        `execution filesystem read exceeds ${this.#maxReadBytes} bytes`,
      );
    }
    return bytes;
  }

  async readRange(
    path: string,
    options: { readonly offset: number; readonly length: number },
  ): Promise<Uint8Array> {
    this.#assertOpen();
    await this.#authorize(path, "read", true);
    validateReadRange(options);
    if (options.length > this.#maxReadBytes) {
      throw new Error(
        `execution filesystem read range exceeds ${this.#maxReadBytes} bytes`,
      );
    }
    const target = resolve(path);
    const metadata = await lstat(target);
    if (!metadata.isFile())
      throw new Error("execution filesystem path is not a file");
    if (options.offset >= metadata.size || options.length === 0)
      return new Uint8Array();
    const length = Math.min(options.length, metadata.size - options.offset);
    const handle = await open(target, "r");
    try {
      const buffer = Buffer.alloc(length);
      const result = await handle.read(buffer, 0, length, options.offset);
      return Uint8Array.from(buffer.subarray(0, result.bytesRead));
    } finally {
      await handle.close();
    }
  }

  async list(path: string): Promise<readonly ExecutionDirectoryEntry[]> {
    this.#assertOpen();
    await this.#authorize(path, "read", true);
    const entries = await readdir(resolve(path), { withFileTypes: true });
    if (entries.length > this.#maxDirectoryEntries) {
      throw new Error(
        `execution filesystem directory exceeds ${this.#maxDirectoryEntries} entries`,
      );
    }
    return entries
      .map((entry) => ({
        name: entry.name,
        kind: entry.isFile()
          ? ("file" as const)
          : entry.isDirectory()
            ? ("directory" as const)
            : entry.isSymbolicLink()
              ? ("symlink" as const)
              : ("other" as const),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async createDirectory(
    path: string,
    options: { readonly recursive?: boolean } = {},
  ): Promise<void> {
    this.#assertOpen();
    await this.#authorize(path, "create", false);
    await mkdir(resolve(path), { recursive: options.recursive ?? false });
  }

  async remove(
    path: string,
    options: { readonly recursive?: boolean } = {},
  ): Promise<void> {
    this.#assertOpen();
    const root = await this.#authorize(path, "remove", false);
    if (resolve(path) === root.path) {
      throw new Error("execution filesystem cannot remove an admitted root");
    }
    await rm(resolve(path), {
      recursive: options.recursive ?? false,
      force: false,
    });
  }

  async #authorize(
    input: string,
    effect: ExecutionFileEffect,
    requireTarget: boolean,
  ): Promise<NativeFileSystemRoot> {
    if (!isAbsolute(input) || input.includes("\0")) throw accessDenied(input);
    const target = resolve(input);
    let current = target;
    while (true) {
      try {
        const canonical = await realpath(current);
        const suffix = relative(current, target);
        const projected = resolve(canonical, suffix);
        const root = this.#roots.find(
          (entry) =>
            entry.effects.has(effect) && contained(entry.path, projected),
        );
        if (root === undefined) throw accessDenied(input);
        if (requireTarget && current !== target) {
          throw Object.assign(
            new Error("execution filesystem path does not exist"),
            {
              code: "ENOENT",
            },
          );
        }
        return root;
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const parent = dirname(current);
      if (parent === current) throw accessDenied(input);
      current = parent;
    }
  }
}

function validateReadRange(options: {
  readonly offset: number;
  readonly length: number;
}): void {
  if (!Number.isSafeInteger(options.offset) || options.offset < 0) {
    throw new Error(
      "execution filesystem read range offset must be a non-negative safe integer",
    );
  }
  if (!Number.isSafeInteger(options.length) || options.length <= 0) {
    throw new Error(
      "execution filesystem read range length must be a positive safe integer",
    );
  }
}

function contained(root: string, target: string): boolean {
  if (root === target) return true;
  const path = relative(root, target);
  return (
    path.length > 0 &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

function missing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function accessDenied(path: string): Error {
  return new Error(
    `execution filesystem access is outside admitted roots: ${path}`,
  );
}
