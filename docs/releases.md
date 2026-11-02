# Versioned releases

The canonical version is `plugin.json`'s `version`. Every host manifest that
declares an EGM version must match it, including experimental adapters such as
Cursor when present. Marketplace catalogs without a version field do not need
one. Version synchronization does not add a host to release support; other host
adapters still need explicit packaging and verification.

While EGM is pre-1.0, use patch bumps for compatible fixes and minor bumps for
features or incompatible workflow changes. Explain breaking changes in release
notes. Version 1.0 requires a stable contract for skill names, parameters, output
paths, and report formats. Do not change published artifacts under the same tag.

## Prepare a candidate

1. Update `plugin.json`, `.claude-plugin/plugin.json`, and
   `.codex-plugin/plugin.json` in a reviewed PR. Also update any other versioned
   host manifests present, including `.cursor-plugin/plugin.json`, to the same
   version.
2. Regenerate `distributions/claude` using the runtime builder and run
   `pytest tests/unit`. Include any migration notes in the PR.
3. After merge, a maintainer creates and pushes an annotated `vMAJOR.MINOR.PATCH`
   tag on the selected main commit. Never move an existing release tag.
4. Run **Prepare draft release** from `main`, supplying that existing tag.
   The tagged commit must include the release scripts and pass unit tests.
5. Review the draft's three runtime ZIPs, `SHA256SUMS`, and source commit.
   Verify both ZIP attestations as described below. Replace
   placeholder notes with changes, compatibility/migration details, and exact
   artifact host-verification evidence. Unverified hosts remain unverified.
6. Publish the draft manually only after review. Directory publication is separate.

The workflow does not create tags, overwrite releases, publish automatically,
or run paid live tests. A duplicate release attempt fails instead of replacing
an existing release. Fix a failed build before creating a new candidate version.
For local preparation, use a fresh output directory:

```sh
python scripts/prepare_release.py --tag v0.1.0 --commit "$(git rev-parse HEAD)" --output /tmp/egm-0.1.0-candidate
```

The local command checks manifest versions and builds the Claude, OpenAI, and
Pi archives. It does not verify the caller-supplied source SHA, Git tag
ancestry, or tests. Those checks belong to the workflow. Publish only
workflow-built candidates after exact-artifact checks. Local builds remain
diagnostic candidates. To build only the Pi package, run `python3
scripts/pack_plugin.py --target pi --output /tmp/egm-pi-package` and inspect
`/tmp/egm-pi-package/egm-pi`.
Exact installed-bundle verification remains tracked in
[#60](https://github.com/google/elephant-goldfish-model/issues/60).

## Publish the Pi package

Publish `@turbineone/t1-egm` manually from the generated `egm-pi/` directory.
Do not run `npm publish` from the repository root or from `pi-egm/`. The root is
not the package, and `pi-egm/package.json` is only the private test manifest.
The release workflow does not publish to npm and must not receive an npm token.

1. Run `pytest tests/unit` from the repository root and `npm test` from `pi-egm/`.
2. Build a fresh package with `python3 scripts/pack_plugin.py --target pi
   --output /tmp/egm-pi-package`, or extract the reviewed `egm-pi-VERSION.zip`.
3. Inspect `/tmp/egm-pi-package/egm-pi/package.json`. Confirm the name is
   `@turbineone/t1-egm`, the version equals `plugin.json`, and `dependencies` is
   absent. Confirm `extensions/index.ts`, seven `skills/*/SKILL.md` files, nine
   `agents/*.md` files, and five document standards are present.
4. Confirm that the version has never been published. Do not reuse a version
   after changing a skill, persona, standard, or extension file.
5. Authenticate with `npm login`, using an account that can publish the
   `@turbineone` scope. Do not write the token into the repository.
6. From the generated directory, preview and then publish:

```sh
cd /tmp/egm-pi-package/egm-pi
npm publish --access restricted --dry-run
npm publish --access restricted
```

Use restricted access unless TurbineOne has explicitly approved a public
package. After publication, install it in a clean Pi session with `pi install
npm:@turbineone/t1-egm@<version>` and run `/skill:egm-brainstorm`,
`/skill:egm-draft`, and `/skill:egm-review`. Record that result separately.
Publication does not by itself establish Pi workflow support.

## Verify downloads

Download all three ZIPs and `SHA256SUMS` into one directory. With GitHub CLI installed,
run these commands from that directory:

```sh
sha256sum -c SHA256SUMS
for archive in egm-claude-*.zip egm-openai-*.zip; do
  gh attestation verify "$archive" --repo google/elephant-goldfish-model \
    --signer-workflow google/elephant-goldfish-model/.github/workflows/release.yml \
    --source-ref refs/heads/main || exit 1
done
```

The workflow signs both ZIP digests and stores provenance in GitHub before
creating a draft. Signing failure blocks draft creation. Local preparation does
not create attestations. The build job uses `id-token: write` to request a signing
certificate and `attestations: write` to store the result. It cannot write releases.

The provenance identifies the workflow run from `main`. The tagged source checked
out during that run can be a different commit. Check the release notes for that
source SHA and inspect the workflow run before publication. Attestations do not
establish host support or prove that the code is safe.
