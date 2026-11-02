/**
 * Tests for the source copy of the Pi extension.
 *
 * These tests do not start Pi or a model. They call the exported path helpers
 * and the extension factory with a small stand-in for ExtensionAPI. Session
 * integration belongs to the packaging step, when the file is installed at
 * `extensions/index.ts`.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension, {
	PERSONAS,
	STANDARDS,
	formatBundlePaths,
	packageRootFromExtension,
	resolveBundle,
	sourcePackageRoot,
} from "./index.ts";

const extensionFile = fileURLToPath(new URL("./index.ts", import.meta.url));
const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Create the minimum package tree accepted by resolveBundle. */
function writeBundle(): string {
	const root = mkdtempSync(join(tmpdir(), "t1-egm-"));
	temporaryRoots.push(root);
	mkdirSync(join(root, "skills", "egm-review"), { recursive: true });
	writeFileSync(join(root, "skills", "egm-review", "SKILL.md"), "# review\n");
	mkdirSync(join(root, "agents"), { recursive: true });
	for (const name of PERSONAS) writeFileSync(join(root, "agents", `${name}.md`), `# ${name}\n`);
	mkdirSync(join(root, "resources", "document_standards"), { recursive: true });
	for (const name of STANDARDS) {
		writeFileSync(join(root, "resources", "document_standards", `${name}-standard.md`), `# ${name}\n`);
	}
	return root;
}

describe("package paths", () => {
	it("counts the generated package root from extensions/index.ts", () => {
		expect(packageRootFromExtension("/installed/@turbineone/t1-egm/extensions/index.ts")).toBe(
			"/installed/@turbineone/t1-egm",
		);
	});

	it("resolves the source repository and its canonical shared files", () => {
		expect(sourcePackageRoot()).toBe(join(dirnameOf(extensionFile), ".."));
		const bundle = resolveBundle(sourcePackageRoot());
		// The two keys differ because the source filenames differ.
		expect(bundle.personas.zoom_out).toMatch(/\/agents\/zoom_out\.md$/);
		expect(bundle.standards["zoom-out"]).toMatch(/\/resources\/document_standards\/zoom-out-standard\.md$/);
		expect(formatBundlePaths(bundle)).toContain("Do not use a same-named file from the user's project.");
	});

	it("rejects an incomplete bundle instead of searching elsewhere", () => {
		const root = writeBundle();
		expect(resolveBundle(root).paths.skillsDir).toBe(join(root, "skills"));
		expect(() => resolveBundle(join(root, "missing"))).toThrow(/missing skills directory/);
	});
});

describe("extension registration", () => {
	function load(root: string) {
		const handlers = new Map<string, Function[]>();
		const pi = {
			on(event: string, handler: Function) {
				handlers.set(event, [...(handlers.get(event) ?? []), handler]);
				return () => undefined;
			},
		} as unknown as ExtensionAPI;
		extension(pi, root);
		return handlers;
	}

	it("always registers the skills directory and exposes absolute bundle paths", () => {
		const root = writeBundle();
		const handlers = load(root);
		expect(handlers.get("resources_discover")?.[0]?.({})).toEqual({
			skillPaths: [join(root, "skills")],
		});

		const event = { systemPromptOptions: { promptGuidelines: [] as string[] } };
		handlers.get("before_agent_start")?.[0]?.(event);
		expect(event.systemPromptOptions.promptGuidelines[0]).toContain(join(root, "agents", "zoom_out.md"));
	});

	it("does not register skills when the bundle is incomplete", () => {
		expect(() => load(mkdtempSync(join(tmpdir(), "t1-egm-empty-")))).toThrow(/missing skills directory/);
	});
});

function dirnameOf(path: string): string {
	return path.slice(0, path.lastIndexOf("/"));
}
