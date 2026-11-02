# Copyright 2026 Google LLC.
# SPDX-License-Identifier: Apache-2.0

"""Build runtime folders and reproducible ZIPs without development files."""

import argparse
import json
from pathlib import Path
import tempfile
import zipfile

SHARED = (
    "plugin.json", "LICENSE", "README.md",
    "skills/*/SKILL.md", "skills/*/agents/openai.yaml",
    "skills/*/assets/*.svg", "skills/*/assets/*.png", "skills/*/references/*.md",
    "skills/*/references/*.json", "agents/*.md", "resources/*.md",
    "resources/document_standards/*.md", "docs/index.md", "docs/getting_started.md",
    "docs/harnesses.md", "docs/claude.md", "docs/codex.md", "docs/faq.md",
    "docs/privacy.md", "docs/releases.md",
    "assets/*.svg", "assets/*.png", "docs/assets/*.svg", "docs/assets/*.png",
)
HOST = {
    "claude": (".claude-plugin/plugin.json", ".claude-plugin/icon.png",
               ".claude-plugin/agents/*.md"),
    "openai": (".codex-plugin/plugin.json",),
}
TARGETS = (*HOST, "pi")
PI_PACKAGE_NAME = "@turbineone/t1-egm"
PI_REPOSITORY = "https://github.com/TurbineOne/t1-egm"
PI_EXTENSION_SOURCE = Path("pi-egm/index.ts")
PI_EXTENSION_DESTINATION = Path("extensions/index.ts")
SKILLS = (
    "egm-bootstrap", "egm-brainstorm", "egm-draft", "egm-drift-report",
    "egm-resolve", "egm-review", "egm-review-loop",
)
REQUIRED_SHARED = (
    "plugin.json", "LICENSE", "README.md", "assets/icon.svg",
    "docs/index.md", "docs/getting_started.md", "docs/harnesses.md",
    "docs/claude.md", "docs/codex.md", "docs/faq.md", "docs/privacy.md",
    "resources/README.md", "resources/execution_instructions.md",
    "skills/egm-bootstrap/references/worker-return.schema.json",
    "skills/egm-bootstrap/references/templates.md",
    "skills/egm-draft/references/design_doc.md",
) + tuple(
    f"skills/{skill}/{name}"
    for skill in SKILLS
    for name in ("SKILL.md", "agents/openai.yaml", "assets/icon.svg")
) + tuple(
    f"agents/{name}.md" for name in (
        "bootstrap_orchestrator", "codebase_details", "comprehension",
        "design_critic", "implementation_readiness", "structural", "style",
        "synthesizer", "zoom_out",
    )
) + tuple(
    f"resources/document_standards/{name}-standard.md" for name in (
        "feature-spec", "heilmeier", "implementation-readiness",
        "re-implementation", "zoom-out",
    )
)


def _prepare_output(root: Path, target: str, output: Path) -> tuple[Path, Path, Path]:
  """Validate and create the destination shared by every target."""
  root = root.resolve()
  folder = output.resolve() / f"egm-{target}"
  archive = folder.with_suffix(".zip")
  if any(path.exists() or path.is_symlink() for path in (folder, archive)):
    raise ValueError("Output folder or ZIP already exists")
  if folder == root or root.is_relative_to(folder):
    raise ValueError("Output must not contain the source tree")
  output.mkdir(parents=True, exist_ok=True)
  folder.mkdir()
  return root, folder, archive


def _collect_source_files(root: Path, patterns: tuple[str, ...]) -> set[Path]:
  """Return allowlisted files, rejecting links and paths outside the source."""
  files = set()
  for pattern in patterns:
    for path in root.glob(pattern):
      relative = path.relative_to(root)
      if any((root / Path(*relative.parts[:i])).is_symlink()
             for i in range(1, len(relative.parts) + 1)):
        raise ValueError(f"Symlink in runtime path: {relative}")
      if not path.resolve().is_relative_to(root):
        raise ValueError(f"Path outside source: {relative}")
      if path.is_file():
        files.add(relative)
  return files


def _write_entry(folder: Path, bundle: zipfile.ZipFile, relative: Path, data: bytes) -> None:
  """Write one deterministic file to both the runtime folder and ZIP."""
  destination = folder / relative
  destination.parent.mkdir(parents=True, exist_ok=True)
  destination.write_bytes(data)
  destination.chmod(0o644)
  info = zipfile.ZipInfo(relative.as_posix(), (1980, 1, 1, 0, 0, 0))
  info.create_system = 3
  info.external_attr = 0o100644 << 16
  info.compress_type = zipfile.ZIP_DEFLATED
  bundle.writestr(info, data)


def _write_runtime(
    root: Path, folder: Path, archive: Path, files: dict[Path, bytes],
) -> tuple[Path, Path]:
  """Write a validated file set without replacing an archive claimed during staging."""
  with tempfile.TemporaryDirectory(prefix=".egm-", dir=folder.parent) as temporary:
    staged = Path(temporary) / archive.name
    with zipfile.ZipFile(staged, "x", zipfile.ZIP_DEFLATED) as bundle:
      for relative, data in sorted(files.items()):
        _write_entry(folder, bundle, relative, data)
    # Windows exclusive file creation can follow a dangling symlink. Linking
    # the completed ZIP claims the final directory entry without following it.
    archive.hardlink_to(staged)
  return folder, archive


def _pi_package_manifest(root: Path) -> dict[str, object]:
  """Build the published Pi manifest from the fork's canonical plugin version."""
  version = json.loads((root / "plugin.json").read_text(encoding="utf-8")).get("version")
  if not isinstance(version, str) or not version:
    raise ValueError("Missing package version")
  return {
      "name": PI_PACKAGE_NAME,
      "version": version,
      "description": "TurbineOne EGM skills and shared reviewer resources for Pi.",
      "license": "Apache-2.0",
      "repository": PI_REPOSITORY,
      "type": "module",
      "files": ["extensions", "skills", "agents", "resources", "docs", "LICENSE", "README.md"],
      "peerDependencies": {
          "@earendil-works/pi-coding-agent": "*",
          "typebox": "*",
      },
  }


def _build_pi(root: Path, output: Path) -> tuple[Path, Path]:
  """Build the Pi package without host manifests or the extension test manifest."""
  root, folder, archive = _prepare_output(root, "pi", output)
  files = _collect_source_files(root, SHARED)
  for name in REQUIRED_SHARED:
    if Path(name) not in files:
      raise ValueError(f"Missing required file: {name}")
  extension = _collect_source_files(root, (PI_EXTENSION_SOURCE.as_posix(),))
  if PI_EXTENSION_SOURCE not in extension:
    raise ValueError(f"Missing required file: {PI_EXTENSION_SOURCE}")
  portable = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
  openai = portable.get("extensions", {}).get("com.openai", {})
  if portable.get("hooks") or openai.get("hooks"):
    raise ValueError("Directory packages cannot contain hooks")
  for metadata in (portable, openai):
    if any(metadata.get(key) for key in ("mcpServers", "mcp", "apps")):
      raise ValueError("This runtime builder does not package MCP or app dependencies")
  packaged = {relative: (root / relative).read_bytes() for relative in files}
  packaged[Path("package.json")] = (
      json.dumps(_pi_package_manifest(root), indent=2) + "\n"
  ).encode()
  packaged[PI_EXTENSION_DESTINATION] = (root / PI_EXTENSION_SOURCE).read_bytes()
  return _write_runtime(root, folder, archive, packaged)


def build(root: Path, target: str, output: Path) -> tuple[Path, Path]:
  """Write a new runtime folder and ZIP; refuse unsafe inputs or overwrites."""
  if target == "pi":
    return _build_pi(root, output)
  if target not in HOST:
    raise ValueError(f"Unknown target: {target}")
  root = root.resolve()
  folder = output.resolve() / f"egm-{target}"
  archive = folder.with_suffix(".zip")
  if any(path.exists() or path.is_symlink() for path in (folder, archive)):
    raise ValueError("Output folder or ZIP already exists")
  if folder == root or root.is_relative_to(folder):
    raise ValueError("Output must not contain the source tree")
  files = _collect_source_files(root, SHARED + HOST[target])
  for name in REQUIRED_SHARED + (HOST[target][0],):
    if Path(name) not in files:
      raise ValueError(f"Missing required file: {name}")
  manifest = json.loads((root / HOST[target][0]).read_text())
  portable = json.loads((root / "plugin.json").read_text())
  openai = portable.get("extensions", {}).get("com.openai", {})
  if manifest.get("hooks") or portable.get("hooks") or openai.get("hooks"):
    raise ValueError("Directory packages cannot contain hooks")
  for metadata in (manifest, portable, openai):
    if any(metadata.get(key) for key in ("mcpServers", "mcp", "apps")):
      raise ValueError("This runtime builder does not package MCP or app dependencies")
  agents = manifest.get("agents", [])
  if not isinstance(agents, (str, list)):
    raise ValueError(f"Invalid manifest agents: {agents!r}")
  references = [agents] if isinstance(agents, str) else list(agents)
  interface = openai.get("interface", {})
  if target == "openai":
    interface = interface or manifest.get("interface", {})
    for key in ("composerIcon", "logo"):
      if not interface.get(key):
        raise ValueError(f"Missing OpenAI interface reference: {key}")
      references.append(interface[key])
  else:
    references.append(manifest.get("icon", "./.claude-plugin/icon.png"))
  for reference in references:
    path = Path(reference)
    if path.is_absolute() or ".." in path.parts or path not in files:
      raise ValueError(f"Unbundled manifest reference: {reference}")
  output.mkdir(parents=True, exist_ok=True)
  folder.mkdir()
  packaged = {relative: (root / relative).read_bytes() for relative in files}
  return _write_runtime(root, folder, archive, packaged)


if __name__ == "__main__":
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--target", required=True, choices=TARGETS)
  parser.add_argument("--output", required=True, type=Path)
  args = parser.parse_args()
  runtime, bundle = build(Path(__file__).resolve().parents[1],
                          args.target, args.output)
  print(f"Runtime: {runtime}\nZIP: {bundle}")
