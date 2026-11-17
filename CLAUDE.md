# Working on smallbusiness-footprint

Follow [AGENTS.md](AGENTS.md) and the shared [agent guide](docs/AGENT-GUIDE.md) for repository instructions.

For workflow tasks, use the [generated flow index](docs/flows/README.md) and the relevant child/source links, reusing supplied current code when sufficient. Edit the runtime definition and accurate metadata; regenerate with `npm run docs:flows` or `npm run build`, then verify with `npm run check:flow-docs`. Generated README sections are build outputs. Automatic file watching / a Vitest documentation plugin is not implemented yet.

For applications using the library, follow the [application instruction templates](docs/APPLICATION-FLOW-BUILD.md#tell-coding-agents-where-to-start) and that application's own declared commands.
