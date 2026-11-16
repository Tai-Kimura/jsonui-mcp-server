import { readFileSync, existsSync, realpathSync } from "fs";
import { basename, dirname, join, resolve, isAbsolute, sep } from "path";

/**
 * Resolve symlinks on the longest existing prefix of an already lexically
 * resolved path. Non-existent trailing segments are kept as-is so validation
 * can run before existence checks without throwing; a dangling or missing
 * path can't leak data (the read fails afterwards).
 */
function realpathLongestExistingPrefix(path: string): string {
  let existing = path;
  const missingSuffix: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return path; // no existing prefix at all
    missingSuffix.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync(existing), ...missingSuffix);
}

export interface ProjectConfig {
  project_name: string;
  spec_directory: string;
  layouts_directory: string;
  styles_directory: string;
  images_directory: string;
  component_spec_directory: string;
  strings_file: string;
  type_map_file: string;
  platforms: Record<string, any>;
}

export class ServerConfig {
  private defaultProjectDir: string | undefined;

  constructor() {
    this.defaultProjectDir = process.env.JUI_PROJECT_DIR;
  }

  resolveProjectDir(override?: string): string {
    const dir = override || this.defaultProjectDir;
    if (!dir) {
      throw new Error(
        "No project directory specified. Set JUI_PROJECT_DIR environment variable or pass project_dir parameter."
      );
    }
    const resolved = resolve(dir);
    if (!existsSync(resolved)) {
      throw new Error(`Project directory does not exist: ${resolved}`);
    }
    return resolved;
  }

  readProjectConfig(projectDir: string): ProjectConfig {
    const configPath = join(projectDir, "jui.config.json");
    if (!existsSync(configPath)) {
      throw new Error(
        `jui.config.json not found in ${projectDir}. Run jui_init first.`
      );
    }
    return JSON.parse(readFileSync(configPath, "utf-8"));
  }

  resolveDir(config: ProjectConfig, field: keyof ProjectConfig, projectDir: string): string {
    const value = config[field];
    if (typeof value !== "string") return projectDir;
    if (isAbsolute(value)) return value;
    return join(projectDir, value);
  }

  validatePathInProject(filePath: string, projectDir: string): string {
    const resolved = isAbsolute(filePath) ? filePath : join(projectDir, filePath);
    // Realpath both sides so a symlink inside the project cannot smuggle the
    // path outside it (lexical resolve() does not follow symlinks).
    const normalizedProject = realpathLongestExistingPrefix(resolve(projectDir));
    const normalizedPath = realpathLongestExistingPrefix(resolve(resolved));
    // Compare on path-segment boundaries: a bare startsWith() would accept
    // sibling dirs like "<project>-evil".
    const isInside =
      normalizedPath === normalizedProject ||
      normalizedPath.startsWith(normalizedProject + sep);
    if (!isInside) {
      throw new Error(`Path traversal detected: ${filePath} is outside project directory`);
    }
    return normalizedPath;
  }
}
