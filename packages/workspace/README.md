# @wanex/workspace

Durable workspace change runtime for Wanex coding-agent style products.

Agents submit `ChangeSet` proposals. `WorkspaceRuntime` stores and applies them,
then records apply/undo receipts in the system-service durable store. Review,
isolation, Git/worktree, and durable task behavior remain focused modules under
the same optional Workspace owner.

## Coding Tools

Trusted coding hosts can import `@wanex/workspace/tools` and explicitly register
three tools in a Runtime `ToolRegistry`:

- `workspace_read_text` reads bounded UTF-8 text through canonical path
  confinement;
- `workspace_apply_changeset` applies bounded, conflict-checked changes through
  `WorkspaceRuntime`, preserving durable undo/reapply history;
- `workspace_exec` runs one trusted program alias with argv, a confined cwd,
  bounded output, timeout, and process-tree cancellation.

Registration requires an injected Workspace runtime, Runtime Execution host,
and program policy. No global/default registration or allow-all executable
policy exists. Model input cannot select a shell, executable path, environment,
stdin, or output ceiling. This boundary provides path and command policy, not
an OS filesystem/network sandbox.

The registered tools also contribute exact Runtime turn evidence. Workspace
root and limits bind read/exec tools, workspace identity and changeset limits
bind apply, and the sorted program alias policy binds exec. Changing any of
those values changes the tool configuration digest, so a pending turn cannot
silently resume against a different workspace or executable policy.

`LocalWorkspace`, Git/worktree reads, and coding tools share one canonical path
resolver. Absolute paths, traversal, NUL, Windows drive/UNC forms, and resolved
symlink or junction escapes fail closed; writes and deletes also reject a final
symlink target.
