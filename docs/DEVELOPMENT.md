# Development

The maintained setup and commands are in [README](../README.md).
Run all declared checks on a standalone clone; no sibling source checkout is required.
Use isolated fixtures and never credentials or paid GPU jobs in automated tests.

Custom Remotion rendering requires Linux bubblewrap, a working systemd user
manager with cgroup v2, and the pinned pnpm runtime. The worker receives only
public dependencies, this render's media and a scratch directory; its network
namespace is isolated and its environment is cleared. Stills and previews: 2 GiB RAM,
2 CPU cores, 5 minutes. Final videos: 4 GiB RAM, 4 CPU cores, 15 minutes. Always no
swap, 256 tasks and 512 MiB per output. Missing isolation fails closed.
Provision Chrome Headless Shell with Remotion's ensureBrowser before production
traffic; ATTELIER_REMOTION_BROWSER may pin its executable. The gated renderer
tests exercise the sandbox and render a still of every built-in format from its
example spec, using synthetic media and no model API:

```sh
ATTELIER_TEST_COMPOSITION_RENDER=1 pnpm --filter @attelier/motion test
```

The [repository contract](https://github.com/attelierai/attelier_app/blob/main/docs/REPOSITORIES.md)
defines package ownership, versioned archives and runtime boundaries.
Colocated tests verify modules; tests/ verifies integration and release structure.
