// Expands `{"md": ...}` prose references in a spec for a reader.
//
// A spec's `description` / `notes` / `intent` may point into a YAML texts
// file instead of holding the text inline (jsonui-cli shared/core/
// spec_texts.py is the definition):
//
//   {"md": "a.b.c"}                   -> <spec name>.texts.yaml, key path a.b.c
//   {"md": "shared/x.texts.yaml#a.b"} -> that file (relative to the spec)
//
// This is a READER, not the validator. It expands what it can and marks what
// it cannot; the YAML rules (string keys, no '.', no duplicates, ...) are
// enforced by `jsonui-doc validate spec`, and are deliberately not copied
// here — a second copy of a rule is the drift this codebase keeps removing.
//
// Each reference becomes `{"md": <as written>, "text": <the text>}` rather
// than the bare text: an agent reading the spec must see both what it says
// and WHERE it lives, or it edits the JSON and the YAML stays stale. The
// `text` key is not valid in a spec, so a copy pasted back is refused by the
// validator instead of silently kept.

import { existsSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { parse } from "yaml";

const TEXT_KEYS = new Set(["description", "notes", "intent"]);
const REF_KEY = "md";

export interface TextsExpansion {
  /** The spec with each reference expanded, or the input when it has none. */
  data: unknown;
  /** How many references were found / expanded. */
  found: number;
  expanded: number;
  /** One line per reference that could not be expanded. */
  problems: string[];
  /** Texts files read (relative to the spec's directory). */
  files: string[];
}

export function pairedTextsName(specFile: string): string {
  let name = basename(specFile);
  for (const suffix of [".spec.json", ".component.json", ".json"]) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  return `${name}.texts.yaml`;
}

function isReference(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    REF_KEY in (value as object)
  );
}

export function expandSpecTexts(data: unknown, specPath: string): TextsExpansion {
  const baseDir = dirname(specPath);
  const paired = pairedTextsName(specPath);
  const cache = new Map<string, unknown | Error>();
  const result: TextsExpansion = { data, found: 0, expanded: 0, problems: [], files: [] };

  const load = (rel: string): unknown | Error => {
    if (!cache.has(rel)) {
      const abs = join(baseDir, rel);
      if (!existsSync(abs)) {
        cache.set(rel, new Error(`${rel} does not exist`));
      } else {
        try {
          cache.set(rel, parse(readFileSync(abs, "utf-8")));
          result.files.push(rel);
        } catch (e: any) {
          cache.set(rel, new Error(`${rel} could not be parsed: ${e.message}`));
        }
      }
    }
    return cache.get(rel);
  };

  const expand = (ref: Record<string, unknown>, where: string): unknown => {
    result.found += 1;
    const target = ref[REF_KEY];
    if (typeof target !== "string" || !target.trim()) {
      result.problems.push(`${where}: malformed reference`);
      return ref;
    }
    const hash = target.indexOf("#");
    const file = hash >= 0 ? target.slice(0, hash) : paired;
    const key = hash >= 0 ? target.slice(hash + 1) : target;
    const doc = load(file);
    if (doc instanceof Error) {
      result.problems.push(`${where}: ${doc.message}`);
      return ref;
    }
    let node: unknown = doc;
    for (const part of key.split(".")) {
      node = typeof node === "object" && node !== null && !Array.isArray(node)
        ? (node as Record<string, unknown>)[part]
        : undefined;
    }
    if (typeof node !== "string") {
      result.problems.push(
        `${where}: '${file}#${key}' is ${node === undefined ? "not defined" : "not a text"}`);
      return ref;
    }
    result.expanded += 1;
    return { ...ref, text: node };
  };

  const walk = (node: unknown, path: string, inText: boolean): unknown => {
    if (Array.isArray(node)) {
      return node.map((v, i) => walk(v, `${path}[${i}]`, inText && !Array.isArray(v)));
    }
    if (typeof node === "object" && node !== null) {
      if (isReference(node)) {
        if (inText) return expand(node, path);
        // Outside a prose field the validator refuses it; a reader leaves it.
        return node;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = walk(v, path ? `${path}.${k}` : k, TEXT_KEYS.has(k));
      }
      return out;
    }
    return node;
  };

  const walked = walk(data, "", false);
  if (result.found > 0) result.data = walked;
  return result;
}
