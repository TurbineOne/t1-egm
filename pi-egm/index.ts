// Copyright 2026 TurbineOne.
// SPDX-License-Identifier: Apache-2.0

/**
 * Pi extension for the TurbineOne EGM package.
 *
 * Pi discovers `extensions/` and `skills/` as package resources. It does not
 * discover `agents/` or `resources/`, so this extension is the path boundary
 * between the installed package and the shared EGM files.
 *
 * The source copy lives at `pi-egm/index.ts`. The packager copies it to
 * `extensions/index.ts`; path resolution assumes that generated layout.
 * Tests of the source copy pass the repository root explicitly.
 *
 * Every packaged skill sets `disable-model-invocation: true`. Pi therefore
 * omits them from automatic skill selection while still exposing their
 * explicit `/skill:name` commands. No session toggle is needed for that
 * behavior.
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Published package name. Also used in errors and prompt guidance. */
export const PACKAGE_NAME = "@turbineone/t1-egm";

/**
 * Persona short names.
 *
 * These match the existing filenames in `agents/`. Those files use snake case
 * (`zoom_out.md`), so their lookup keys use snake case too.
 */
export const PERSONAS = [
	"bootstrap_orchestrator",
	"codebase_details",
	"comprehension",
	"design_critic",
	"implementation_readiness",
	"structural",
	"style",
	"synthesizer",
	"zoom_out",
] as const;

/**
 * Standard short names.
 *
 * These match the existing filenames in `resources/document_standards/`.
 * Those files already use dashes (`zoom-out-standard.md`), so their lookup
 * keys use dashes too. The difference from `PERSONAS` is only the naming
 * already present in the source files; this extension does not rename either
 * set.
 */
export const STANDARDS = [
	"feature-spec",
	"heilmeier",
	"implementation-readiness",
	"re-implementation",
	"zoom-out",
] as const;

export interface PackagePaths {
	/** Installed package root, or the source repository root in tests. */
	root: string;
	skillsDir: string;
	agentsDir: string;
	standardsDir: string;
}

export interface ResolvedBundle {
	paths: PackagePaths;
	/**
	 * Absolute persona paths keyed by the snake-case filename stem,
	 * such as `zoom_out` for `agents/zoom_out.md`.
	 */
	personas: Record<string, string>;
	/**
	 * Absolute standard paths keyed by the dashed filename stem,
	 * such as `zoom-out` for `zoom-out-standard.md`.
	 */
	standards: Record<string, string>;
}

/**
 * Package root for the generated layout.
 *
 * `extensions/index.ts` is one directory below the package root. Do not count
 * directories from a `SKILL.md`: skill depth can change, but this file's
 * installed location cannot.
 */
export function packageRootFromExtension(extensionFile: string): string {
	return dirname(dirname(extensionFile));
}

/**
 * Repository root while this file still lives at `pi-egm/index.ts`.
 * Runtime code uses the generated-layout helper instead.
 */
export function sourcePackageRoot(): string {
	return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Resolve the shared EGM files from one package root.
 *
 * Persona and standard keys intentionally follow their existing filenames:
 * snake case for personas and dashes for standards. Throws if any required
 * directory or file is missing. Callers must not catch that failure and
 * continue with files from the user's project.
 */
export function resolveBundle(root: string): ResolvedBundle {
	const paths: PackagePaths = {
		root,
		skillsDir: join(root, "skills"),
		agentsDir: join(root, "agents"),
		standardsDir: join(root, "resources", "document_standards"),
	};
	requireDirectory(paths.skillsDir, "skills");
	requireDirectory(paths.agentsDir, "agents");
	requireDirectory(paths.standardsDir, "resources/document_standards");

	const personas: Record<string, string> = {};
	for (const name of PERSONAS) {
		personas[name] = requireFile(join(paths.agentsDir, `${name}.md`), `agents/${name}.md`);
	}
	const standards: Record<string, string> = {};
	for (const name of STANDARDS) {
		const relative = `resources/document_standards/${name}-standard.md`;
		standards[name] = requireFile(join(paths.standardsDir, `${name}-standard.md`), relative);
	}
	if (!hasSkillDirectory(paths.skillsDir)) {
		throw new Error(`${PACKAGE_NAME}: no skills found in ${paths.skillsDir}`);
	}
	return { paths, personas, standards };
}

/**
 * Prompt guidance containing the only paths a model should use for bundled
 * personas and standards. The names retain the filename convention of each
 * directory. The absolute paths make project files with the same names
 * irrelevant.
 */
export function formatBundlePaths(bundle: ResolvedBundle): string {
	const personas = Object.entries(bundle.personas)
		.map(([name, path]) => `- ${name}: ${path}`)
		.join("\n");
	const standards = Object.entries(bundle.standards)
		.map(([name, path]) => `- ${name}: ${path}`)
		.join("\n");
	return [
		`${PACKAGE_NAME} package root: ${bundle.paths.root}`,
		"Resolve bundled personas and standards from these absolute paths.",
		"Persona names use their snake-case filenames. Standard names use their dashed filenames.",
		"Do not use a same-named file from the user's project.",
		"",
		"Personas:",
		personas,
		"",
		"Standards:",
		standards,
	].join("\n");
}

function hasSkillDirectory(skillsDir: string): boolean {
	return readdirSync(skillsDir).some((entry) => statSync(join(skillsDir, entry)).isDirectory());
}

function requireDirectory(path: string, label: string): void {
	let info;
	try {
		info = statSync(path);
	} catch {
		throw new Error(`${PACKAGE_NAME}: missing ${label} directory: ${path}`);
	}
	if (!info.isDirectory()) {
		throw new Error(`${PACKAGE_NAME}: ${label} is not a directory: ${path}`);
	}
}

function requireFile(path: string, label: string): string {
	let info;
	try {
		info = statSync(path);
	} catch {
		throw new Error(`${PACKAGE_NAME}: missing ${label}: ${path}`);
	}
	if (!info.isFile()) {
		throw new Error(`${PACKAGE_NAME}: ${label} is not a file: ${path}`);
	}
	return resolve(path);
}

/**
 * Register the packaged skills and expose their shared files.
 *
 * `packageRoot` is optional because the installed file can derive it. Tests
 * pass the source repository root because this file is not yet in
 * `extensions/`.
 *
 * A missing bundle throws during extension load. That is intentional: an
 * incomplete package must not silently review against files found elsewhere.
 */
export default function egmExtension(
	pi: ExtensionAPI,
	packageRoot = packageRootFromExtension(fileURLToPath(import.meta.url)),
): void {
	const bundle = resolveBundle(packageRoot);

	// Always expose the packaged skills. Their frontmatter prevents automatic
	// invocation; explicit `/skill:name` commands remain available.
	pi.on("resources_discover", () => ({ skillPaths: [bundle.paths.skillsDir] }));

	// The prompt guidance is path resolution, not skill advertisement. It tells
	// an explicitly invoked workflow where its shared personas and standards are.
	pi.on("before_agent_start", (event) => {
		event.systemPromptOptions.promptGuidelines = [
			...event.systemPromptOptions.promptGuidelines,
			formatBundlePaths(bundle),
		];
	});
}
