/**
 * Derived / static content that the MCP server exposes alongside attribute definitions.
 *
 * Ported from scripts/generate_specs.py. These values do not depend on
 * attribute_definitions.json — they encode platform conventions (modifier order,
 * binding syntax, cross-platform value mapping). Kept in TS so the MCP can serve
 * them at startup without any build step.
 */

// ----- categorizeCommonAttributes ----------------------------------------

const CATEGORY_KEYS: Record<string, Set<string>> = {
  sizing: new Set([
    "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
    "weight", "widthWeight", "heightWeight", "maxWidthWeight", "maxHeightWeight",
    "minWidthWeight", "minHeightWeight", "aspectWidth", "aspectHeight",
    "aspectRatio", "frame", "rect", "wrapContent",
  ]),
  spacing: new Set([
    "padding", "paddings", "paddingTop", "paddingBottom", "paddingLeft",
    "paddingRight", "paddingStart", "paddingEnd", "rightPadding", "leftPadding",
    "minTopPadding", "minBottomPadding", "minLeftPadding", "minRightPadding",
    "maxTopPadding", "maxBottomPadding", "maxLeftPadding", "maxRightPadding",
    "margins", "topMargin", "bottomMargin", "leftMargin", "rightMargin",
    "startMargin", "endMargin", "minTopMargin", "minBottomMargin",
    "minLeftMargin", "minRightMargin", "maxTopMargin", "maxBottomMargin",
    "maxLeftMargin", "maxRightMargin", "innerPadding", "insets", "insetHorizontal",
  ]),
  visual: new Set([
    "background", "tapBackground", "highlightBackground", "disabledBackground",
    "defaultBackground", "cornerRadius", "borderWidth", "borderColor",
    "borderStyle", "alpha", "opacity", "shadow", "clipToBounds", "tintColor",
    "effectStyle",
  ]),
  visibility: new Set(["visibility", "hidden"]),
  interaction: new Set([
    "onclick", "onClick", "onLongPress", "onPan", "onPinch", "canTap",
    "enabled", "userInteractionEnabled", "touchDisabledState",
    "touchEnabledViewIds",
  ]),
  layout: new Set([
    "centerInParent", "centerVertical", "centerHorizontal", "alignTop",
    "alignBottom", "alignLeft", "alignRight", "alignTopOfView",
    "alignBottomOfView", "alignLeftOfView", "alignRightOfView",
    "alignTopView", "alignBottomView", "alignLeftView", "alignRightView",
    "alignCenterVerticalView", "alignCenterHorizontalView", "toView",
    "gravity", "indexBelow", "indexAbove",
    "keyBottomView", "keyTopView", "keyLeftView", "keyRightView",
  ]),
  lifecycle: new Set(["onAppear", "onDisappear"]),
  accessibility: new Set(["id", "testId", "className", "tag"]),
  binding: new Set([
    "binding", "bind", "binding_id", "binding_group", "propertyName",
    "bindingScript", "data", "shared_data",
  ]),
};

export function categorizeCommonAttributes(commonAttrs: Record<string, any>): any {
  const categories: Record<string, Record<string, any>> = {
    sizing: {},
    spacing: {},
    visual: {},
    visibility: {},
    interaction: {},
    layout: {},
    lifecycle: {},
    accessibility: {},
    binding: {},
    other: {},
  };

  for (const [key, attrDef] of Object.entries(commonAttrs)) {
    if (key.startsWith("_")) continue;
    let placed = false;
    for (const [category, keys] of Object.entries(CATEGORY_KEYS)) {
      if (keys.has(key)) {
        categories[category][key] = attrDef;
        placed = true;
        break;
      }
    }
    if (!placed) categories.other[key] = attrDef;
  }

  // Drop empty categories
  const filtered: Record<string, Record<string, any>> = {};
  for (const [name, attrs] of Object.entries(categories)) {
    if (Object.keys(attrs).length > 0) filtered[name] = attrs;
  }

  return {
    description: "Common attributes shared across all components",
    source: "attribute_definitions.json common section",
    categories: filtered,
  };
}

// ----- modifier order (platform rendering) -------------------------------

export const MODIFIER_ORDER = {
  description:
    "Platform-specific modifier application order. Order affects rendering.",
  swift: {
    order: [
      "centerAlignment",
      "edgeAlignment",
      "padding",
      "frameConstraints (min/max)",
      "frameSize (width/height)",
      "insets/insetHorizontal",
      "background",
      "cornerRadius",
      "border",
      "margins",
      "alpha/opacity",
      "shadow",
      "clipping",
      "offset",
      "visibility (hidden/opacity ternary)",
      "safeAreaInsets",
      "disabled",
      "tag (for TabView)",
      "tintColor",
      "onClick/onTapGesture",
      "lifecycle (onAppear/onDisappear)",
      "confirmationDialog",
      "accessibilityIdentifier",
    ],
    criticalRules: [
      "background MUST come after padding (background includes padding area)",
      "border MUST come after cornerRadius (for rounded border)",
      "frame MUST come before margins (size before external spacing)",
      "Image: .resizable() must come first, then .aspectRatio",
      "Label: .leading alignment added to frame for textAlign to work",
    ],
  },
  kotlin: {
    order: [
      "testTag",
      "margins",
      "weight (caller applies)",
      "size (width/height, matchParent/wrapContent, min/max/aspectRatio)",
      "alpha/opacity",
      "shadow/elevation",
      "background (cornerRadius -> clip -> border -> bgColor)",
      "clickable",
      "padding",
      "alignment (RowScope/ColumnScope/BoxScope)",
    ],
    criticalRules: [
      "Modifier.then() chains left-to-right; order matters",
      "margins before size (outside to inside)",
      "cornerRadius must be applied as clip before background",
    ],
  },
  react: {
    note: "React uses Tailwind CSS classes; ordering is less strict",
    classOrder: [
      "layout (flex, flex-col/row)",
      "sizing (w-*, h-*)",
      "spacing (p-*, m-*)",
      "typography (text-*, font-*)",
      "visual (bg-*, rounded-*, border-*, shadow-*)",
      "opacity",
      "overflow",
      "cursor/interaction",
    ],
    dynamicStyles: "Values not mappable to Tailwind use inline style objects",
  },
};

// ----- binding rules -----------------------------------------------------

export const BINDING_RULES = {
  description: "JsonUI binding syntax rules",
  format: {
    bindingExpression: "@{propertyName}",
    negation: "@{!propertyName}",
    defaultValue: "@{propertyName ?? defaultValue}",
    nestedPath: "@{user.name} (Kotlin Dynamic Mode)",
  },
  directions: {
    "two-way": {
      description: "Component state changes reflect back to data model",
      swift: "$data.propertyName",
      kotlin: "mutableStateOf + updateData(mapOf(key to value))",
      react: "value={data.prop} + auto-generated onChange handler",
      applicableAttributes: [
        "TextField.text",
        "TextView.text",
        "Switch.isOn",
        "Toggle.isOn",
        "CheckBox.checked",
        "Slider.value",
        "Segment.selectedIndex",
        "Radio.selectedIndex",
        "SelectBox.selectedIndex",
        "TabView.selectedIndex",
      ],
    },
    "read-only": {
      description: "Display data values only (no write-back)",
      swift: "data.propertyName",
      kotlin: "data[propertyName]",
      react: "{data.propertyName}",
      applicableAttributes: [
        "Label.text",
        "*.width / *.height (frame values)",
        "*.enabled",
        "*.hidden / *.visibility",
        "*.background / *.fontColor",
        "*.fontSize",
        "*.opacity / *.alpha",
      ],
    },
  },
  criticalRules: [
    "Frame values (width, height, etc.) MUST be read-only (data.). $data. is NOT allowed",
    "Two-way binding is only for stateful input components",
    "React auto-generates onPropertyNameChange for two-way bindings",
    "Kotlin Dynamic uses updateData(mapOf(key to value)) for data updates",
    "onclick (lowercase) = selector format (string), onClick (camelCase) = binding format (@{handler})",
  ],
};

// ----- platform mapping (cross-platform value conversion) ----------------

export const PLATFORM_MAPPING = {
  description: "Cross-platform attribute value conversion mapping",
  values: {
    matchParent: {
      swift: ".infinity (frame maxWidth/maxHeight)",
      kotlin: "fillMaxWidth() / fillMaxHeight()",
      react: "w-full / h-full",
    },
    wrapContent: {
      swift: "Default (no frame specified)",
      kotlin: "wrapContentWidth() / wrapContentHeight()",
      react: "w-fit / h-fit",
    },
  },
  contentMode: {
    aspectFit: { swift: ".fit", kotlin: "ContentScale.Fit", react: "object-contain" },
    aspectFill: { swift: ".fill", kotlin: "ContentScale.Crop", react: "object-cover" },
    scaleToFill: {
      swift: ".fill (no aspectRatio)",
      kotlin: "ContentScale.FillBounds",
      react: "object-fill",
    },
  },
  textAlign: {
    left: { swift: ".leading", kotlin: "TextAlign.Start", react: "text-left" },
    center: { swift: ".center", kotlin: "TextAlign.Center", react: "text-center" },
    right: { swift: ".trailing", kotlin: "TextAlign.End", react: "text-right" },
  },
  fontWeight: {
    bold: { swift: ".bold", kotlin: "FontWeight.Bold", react: "font-bold" },
    light: { swift: ".light", kotlin: "FontWeight.Light", react: "font-light" },
    thin: { swift: ".thin", kotlin: "FontWeight.Thin", react: "font-thin" },
    medium: { swift: ".medium", kotlin: "FontWeight.Medium", react: "font-medium" },
    semibold: {
      swift: ".semibold",
      kotlin: "FontWeight.SemiBold",
      react: "font-semibold",
    },
  },
  orientation: {
    horizontal: { swift: "HStack", kotlin: "Row", react: "flex flex-row" },
    vertical: { swift: "VStack", kotlin: "Column", react: "flex flex-col" },
    none: { swift: "ZStack", kotlin: "Box", react: "relative" },
  },
  gravity: {
    center: {
      swift: ".center",
      kotlin: "Alignment.Center",
      react: "items-center justify-center",
    },
    centerHorizontal: {
      swift_vertical: ".center HStack alignment",
      kotlin_vertical: "Alignment.CenterHorizontally",
      react: "items-center (flex-col)",
    },
    centerVertical: {
      swift_horizontal: ".center VStack alignment",
      kotlin_horizontal: "Alignment.CenterVertically",
      react: "items-center (flex-row)",
    },
  },
  types: {
    String: { swift: "String", kotlin: "String", react: "string" },
    Int: { swift: "Int", kotlin: "Int", react: "number" },
    Float: { swift: "CGFloat", kotlin: "Float", react: "number" },
    Double: { swift: "Double", kotlin: "Double", react: "number" },
    Bool: { swift: "Bool", kotlin: "Boolean", react: "boolean" },
    Array: { swift: "[T]", kotlin: "List<T>", react: "T[]" },
    Dictionary: {
      swift: "[String: Any]",
      kotlin: "Map<String, Any>",
      react: "Record<string, any>",
    },
  },
};
