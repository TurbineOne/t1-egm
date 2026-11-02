# Pi package for the TurbineOne fork

Status: Downstream design note. Not an upstream EGM design approval.
Author: TurbineOne. Date: 2026-08-14.

Repository: https://github.com/TurbineOne/t1-egm

## Purpose

Install this fork in Pi as one npm package, `@turbineone/t1-egm`, without
turning the source repository into the package.

The skills need shared files that are not inside any skill directory:
reviewer personas in `agents/` and rubrics in `resources/document_standards/`.
The Agent Skills specification makes a skill's own `references/`, `scripts/`,
and `assets/` relative to that skill. It does not provide a skill-to-skill
dependency. Copying the personas into an `egm-shared` skill, or into every
skill, would create a second copy and let the fork drift from its own
canonical files.

The package is the shared boundary. Skills remain the workflows. Personas and
standards remain package data beside those skills. A small Pi extension
resolves their installed paths.

This note records the implementation plan for a repository TurbineOne
controls. It does not propose a change to
`google/elephant-goldfish-model`, and it does not follow that repository's
issue and design-review gates.

## Goals

- Publish the built Pi directory as a versioned GitHub Release asset. The
  sandbox downloads and unpacks that asset, then installs the local directory
  with `pi install /opt/t1-egm/egm-pi`.
- Keep `skills/`, `agents/`, and `resources/` as the canonical source files.
  Downstream edits happen there, once.
- Generate the published directory from an allowlist. Do not publish tests,
  the website, design documents, workflows, or host-specific manifests.
- Resolve personas and standards from the installed package, never from a
  same-named file in the user's project.
- Register the packaged skills unconditionally. Their existing
  `disable-model-invocation: true` setting keeps invocation explicit.
- Prove the archive contents and the extension's path resolution with tests.
- Pause for review after each implementation step.

## Non-goals

- Do not add a root `package.json` to the source repository.
- Do not support `pi install git:github.com/TurbineOne/t1-egm`. A git install
  clones this development tree and would not contain the generated package
  layout.
- Do not compile the extension. Pi loads TypeScript through jiti. A compiled
  copy can bypass Pi's host module mapping.
- Do not register named Pi subagents. Pi does not load `agents/*.md` as
  subagent types. Goldfish reviews spawn a general-purpose subagent and tell
  it to read the resolved persona file first.
- Do not copy personas into skill-local `references/` directories.
- Do not publish automatically in the first implementation. Publication is a
  manual maintainer action after the generated directory has been inspected.
- Do not require an npm organization, a private npm package, or CodeArtifact
  for the sandbox install. Do not expect `pi install` to download a GitHub
  Release asset itself.
- Do not treat a successful package build as Pi support. Support means
  `/egm-brainstorm`, `/egm-draft`, and `/egm-review` have run end to end
  through the installed package. Until that run is recorded, the docs say
  "Pi package," not "supported on Pi."

## Why a generated package

`pi install` uses the repository root as the package root. It has no
subdirectory argument. Making this source root a Pi package would publish the
development tree and couple Pi discovery to files that are not part of the
runtime.

The existing `scripts/pack_plugin.py` already copies a host runtime from an
allowlist and rejects symlinks and development files. The Pi target should
reuse that boundary rather than invent a second one. The generated directory
is what the release archive contains. The source repository remains the place
where skills and personas are edited.

## Published layout

```text
egm-pi/
├── package.json
├── extensions/index.ts
├── skills/
├── agents/
├── resources/
├── docs/
├── LICENSE
└── README.md
```

`extensions/` and `skills/` are Pi's conventional discovery directories, so
the generated manifest does not need a `pi` key. `agents/` and `resources/`
are not Pi resource types. They are included through the manifest's `files`
list and read by the extension.

The extension source lives at `pi-egm/index.ts` in this repository. The
packager copies it to `extensions/index.ts`. Its package root is therefore the
parent of its installed directory, not a path counted from the source tree:

```typescript
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
```

That resolution works only in the generated layout. Tests that import the
source file directly must supply the source root explicitly.

## Package identity

| Field | Value |
| --- | --- |
| name | `@turbineone/t1-egm` |
| repository | `https://github.com/TurbineOne/t1-egm` |
| version | The fork's `plugin.json` version at build time |
| license | Apache-2.0 |
| access | restricted, until TurbineOne chooses otherwise |

The published version comes from this fork's `plugin.json`, not from
upstream's release history. A published version is never reused after a skill,
persona, standard, or extension change. The package has no runtime
`dependencies`. `@earendil-works/pi-coding-agent` and `typebox` are peer
dependencies because Pi supplies them through its extension module map.

The local test manifest under `pi-egm/` may install those peers and Vitest as
development dependencies. The packager must not copy that manifest. It writes
the published `package.json` itself.

## Extension behavior

The extension does three things:

1. Register the packaged `skills/` directory through Pi resource discovery,
   using the computed package root. Registration does not depend on session
   state.
2. Resolve `agents/<name>.md` and
   `resources/document_standards/<name>.md` to absolute paths inside the
   package, and include those paths in prompt guidance.
3. Fail closed when a requested persona or standard is absent. It must not
   search the user's workspace for a similarly named file.

There is no `/toggle-egm` command. Every EGM skill already sets
`disable-model-invocation: true`, so Pi omits it from automatic skill
selection while leaving `/skill:name` available. That is the required
invocation boundary. Nested workflows read the other skill files in-thread;
they do not depend on automatic skill invocation. A prompt filter cannot
disable an explicit skill command, so the extension does not hide skills per
session.

The extension does not execute reviews, call a model, or grant permissions.
Reviewer isolation remains the host's subagent behavior. If Pi cannot provide
a fresh subagent context, the existing skill rule applies: stop rather than
review in the parent context.

## Skill path note

The shared delegation text currently tells a host to resolve `agents/` from
the plugin root, including Codex's rule of three directories above `SKILL.md`.
That rule is false for this npm layout. The skills need a Pi-specific note:

- The installed package root contains `skills/`, `agents/`, `resources/`, and
  `docs/` as siblings.
- Resolve bundled personas and standards from paths supplied by the extension,
  or from that package root.
- Do not substitute a file from the user's project for a bundled persona or
  standard.

This is a change to shared skill text because the current instruction would
send Pi to the wrong directory. It should be narrowly worded so Claude and
Codex continue to use their existing plugin-root rules.

## Builder and publication

Add `--target pi` to `scripts/pack_plugin.py`. It emits `egm-pi/` and
`egm-pi.zip` with the current reproducibility rules: sorted entries, fixed
timestamps, mode `0644`, and no symlinks.

The Pi output contains the shared runtime allowlist plus the generated
extension and `package.json`. It does not contain `.claude-plugin/`,
`.codex-plugin/`, tests, `site/`, `.github/`, or `docs/designs/`.

`scripts/prepare_release.py` includes the Pi archive in the checksum manifest.
The ZIP remains the inspectable local artifact. The sandbox distribution is a
separate release asset containing the generated `egm-pi/` directory, not the
source repository.

A maintainer builds that asset from the existing packager, tags the reviewed
commit, and publishes it with `gh release create`. The sandbox downloads the
asset for that tag and verifies its checksum. `pi install` cannot download a
GitHub Release asset. It accepts an npm package, a git repository, or a local
path. The sandbox therefore unpacks the asset and passes the resulting
directory to `pi install`. That records the path and loads the package without
contacting npm. It also does not require `npm install`: the package has no
runtime dependencies, and Pi supplies its peer dependencies.

```sh
gh release download v0.1.0 --repo TurbineOne/t1-egm --pattern egm-pi.zip
sha256sum -c egm-pi.zip.sha256
unzip egm-pi.zip -d /opt/t1-egm
pi install /opt/t1-egm/egm-pi
```

The release contains one archive. `pi-egm/` is the extension source directory
in this repository. `pack_plugin.py` copies its code into the generated
`egm-pi/` directory and writes `egm-pi.zip`. `scripts/package-release.sh`
publishes that ZIP and its SHA-256. It does not create a second tarball or a
second package. Do not publish the GitHub source
tarball as the package: it contains the development tree and still requires
the packager at install time. A `git:` install is also wrong here, because Pi
clones the repository and expects the package at its root.

npm publication is not part of this route. A restricted npm organization would
cost money, and CodeArtifact would require a short-lived token during sandbox
creation. Neither belongs in the non-interactive sandbox install.

## Tests

Archive tests extend `tests/unit/test_packaging.py`:

- seven skills, nine personas, five standards, the extension, and the
  generated manifest are present;
- tests, site files, workflows, design documents, and Claude or Codex
  manifests are absent;
- repeated builds are byte-identical;
- the package version equals `plugin.json`;
- a missing extension source or an escaping packaged path fails the build.

Extension tests use Vitest and the extension factory. They assert
unconditional skill registration, path resolution, and failure on an
incomplete bundle. They do not run a model or the Goldfish workflow.

A later live run of `/egm-brainstorm`, `/egm-draft`, and `/egm-review`
through the installed package is recorded in this fork's README. That record
is the support evidence. The packaging tests are not.

## Implementation sequence

Each step stops for review before the next one starts.

0. Write this design note and index it from `docs/designs/README.md`.
1. Add `pi-egm/index.ts` and its Vitest suite.
2. Add the `pi` packager target and archive tests.
3. Include the Pi archive in release preparation and checksums.
4. Add the Pi path note to the shared skill delegation text and document the
   install command.
5. Build and inspect the package. Publish it manually only after that
   inspection is accepted.

Step 5 does not run during implementation unless it is separately requested.
Publication is not required to review the code.

## Change log

### 2026-11-01 21:44 MST

Replaced npm publication with a GitHub Release asset for sandbox installs.
The sandbox must install the package non-interactively during creation, and
this fork should not pay for a restricted npm organization.

`pi install npm:@turbineone/t1-egm` delegates to the host npm registry. A
private package therefore needs either an npm organization plan or another
authenticated registry. CodeArtifact can host the package, but its
authorization token expires and would have to be present during every sandbox
build. Embedding that token in the install URL or repository is inappropriate.

Pi's installer confirms the usable boundary. It accepts `npm:`, a git
repository, or a local path. It does not download a GitHub Release asset, and
`pi install git:github.com/TurbineOne/t1-egm` would clone the development tree
instead of the built package. The sandbox therefore downloads and unpacks the
release asset itself, then runs `pi install` on the unpacked `egm-pi/`
directory. That records a local path and loads the package without npm
authentication or `npm install`, since the package has no runtime dependencies.

Publishing the generated directory as a release asset keeps the build in the
reviewed release step. Cloning the source repository in every sandbox would
download tests, docs, and the packager, and would repeat the build during
sandbox creation. The release asset avoids both.

### 2026-11-01 20:18 MST

Removed `/toggle-egm` and the session-based skill filter after checking Pi's
implementation. The original design used the command to disable automatic
invocation. Pi already does that for every EGM skill because each sets
`disable-model-invocation: true`: those skills are omitted from
`<available_skills>`, while `/skill:name` still loads them from the resource
loader.

The toggle could not provide that boundary anyway. `before_agent_start` can
remove skills from the prompt list, but explicit skill commands do not consult
that list. Hiding them there also became redundant once the frontmatter
behavior was confirmed. `resources_discover` therefore always returns the
package's `skills/` directory.

Nested work remains valid. Reviewer subagents are launched with the host's
subagent tool and persona files, which are not skills. When one EGM skill
needs another, the existing instructions read its `SKILL.md` in-thread rather
than invoking it through the skill tool, which may refuse a disabled skill.
The extension's remaining prompt guidance only supplies the absolute paths of
the shared personas and standards.
