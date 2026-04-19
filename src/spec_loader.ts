import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface ComponentSpec {
  name: string;
  description: string;
  aliases: string[];
  platforms: Record<string, boolean>;
  attributes: Record<string, any>;
  bindingBehavior: Record<string, any>;
  platformSpecific: Record<string, any>;
  rules: string[];
}

export class SpecLoader {
  private specsDir: string;
  private components: Map<string, ComponentSpec> = new Map();
  private commonAttributes: any = null;
  private modifierOrder: any = null;
  private bindingRules: any = null;
  private platformMapping: any = null;
  private aliasMap: Map<string, string> = new Map();

  constructor(specsDir: string) {
    this.specsDir = specsDir;
    this.load();
  }

  private load(): void {
    // Load shared specs
    this.commonAttributes = this.loadJson("common_attributes.json");
    this.modifierOrder = this.loadJson("modifier_order.json");
    this.bindingRules = this.loadJson("binding_rules.json");
    this.platformMapping = this.loadJson("platform_mapping.json");

    // Load component specs
    const componentsDir = join(this.specsDir, "components");
    const files = readdirSync(componentsDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const spec = this.loadJson(join("components", file)) as ComponentSpec;
      const key = spec.name.toLowerCase();
      this.components.set(key, spec);

      // Register aliases
      for (const alias of spec.aliases || []) {
        this.aliasMap.set(alias.toLowerCase(), key);
      }
    }
  }

  private loadJson(relativePath: string): any {
    const fullPath = join(this.specsDir, relativePath);
    return JSON.parse(readFileSync(fullPath, "utf-8"));
  }

  getComponent(name: string): ComponentSpec | null {
    const key = name.toLowerCase();
    const resolved = this.aliasMap.get(key) || key;
    return this.components.get(resolved) || null;
  }

  getComponentWithCommon(name: string): any {
    const comp = this.getComponent(name);
    if (!comp) return null;

    return {
      ...comp,
      commonAttributes: this.commonAttributes,
    };
  }

  getAttribute(name: string): any {
    // Search in common attributes first
    if (this.commonAttributes?.categories) {
      for (const [category, attrs] of Object.entries(
        this.commonAttributes.categories
      )) {
        const attrMap = attrs as Record<string, any>;
        if (attrMap[name]) {
          return {
            name,
            category,
            scope: "common",
            definition: attrMap[name],
            components: "all",
          };
        }
      }
    }

    // Search in component-specific attributes
    const results: any[] = [];
    for (const [, comp] of this.components) {
      if (comp.attributes[name]) {
        results.push({
          name,
          scope: "component",
          component: comp.name,
          definition: comp.attributes[name],
          bindingBehavior: comp.bindingBehavior?.[name],
        });
      }
    }

    if (results.length === 1) return results[0];
    if (results.length > 1) return { name, matches: results };
    return null;
  }

  searchComponents(query: string): any[] {
    const q = query.toLowerCase();
    const results: any[] = [];

    for (const [, comp] of this.components) {
      let score = 0;
      const matches: string[] = [];

      // Check component name
      if (comp.name.toLowerCase().includes(q)) {
        score += 10;
        matches.push(`name: ${comp.name}`);
      }

      // Check description
      if (comp.description.toLowerCase().includes(q)) {
        score += 5;
        matches.push(`description: ${comp.description}`);
      }

      // Check aliases
      for (const alias of comp.aliases) {
        if (alias.toLowerCase().includes(q)) {
          score += 8;
          matches.push(`alias: ${alias}`);
        }
      }

      // Check attribute names
      for (const attrName of Object.keys(comp.attributes)) {
        if (attrName.toLowerCase().includes(q)) {
          score += 3;
          matches.push(`attribute: ${attrName}`);
        }
      }

      // Check rules
      for (const rule of comp.rules) {
        if (rule.toLowerCase().includes(q)) {
          score += 2;
          matches.push(`rule: ${rule}`);
        }
      }

      if (score > 0) {
        results.push({ component: comp.name, score, matches });
      }
    }

    // Also search common attributes
    if (this.commonAttributes?.categories) {
      for (const [category, attrs] of Object.entries(
        this.commonAttributes.categories
      )) {
        const attrMap = attrs as Record<string, any>;
        for (const [attrName, attrDef] of Object.entries(attrMap)) {
          if (
            attrName.toLowerCase().includes(q) ||
            (attrDef as any)?.description?.toLowerCase().includes(q)
          ) {
            results.push({
              component: "common",
              score: 4,
              matches: [`common.${category}.${attrName}`],
            });
          }
        }
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  getModifierOrder(platform?: string): any {
    if (platform) {
      return this.modifierOrder?.[platform] || null;
    }
    return this.modifierOrder;
  }

  getBindingRules(): any {
    return this.bindingRules;
  }

  getPlatformMapping(category?: string): any {
    if (category) {
      return this.platformMapping?.[category] || null;
    }
    return this.platformMapping;
  }

  listComponents(): string[] {
    return Array.from(this.components.values()).map((c) => c.name);
  }
}
