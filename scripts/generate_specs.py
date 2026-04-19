#!/usr/bin/env python3
"""Generate spec JSON files from attribute_definitions.json and converter knowledge."""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
SPECS_DIR = os.path.join(PROJECT_DIR, "specs")
COMPONENTS_DIR = os.path.join(SPECS_DIR, "components")
ATTR_DEF_PATH = os.path.expanduser(
    "~/resource/jsonui-cli/shared/core/attribute_definitions.json"
)

# Converter knowledge: binding directions, platform specifics, rules
COMPONENT_METADATA = {
    "Label": {
        "description": "Text display component",
        "aliases": ["Text"],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {
                "view": "Text",
                "partialAttributes": "Supports styled text ranges via partialAttributes array",
                "alignment": ".leading alignment added to frame for textAlign to work"
            },
            "kotlin": {
                "composable": "Text",
                "partialAttributes": "AnnotatedString with SpanStyle for styled ranges"
            },
            "react": {
                "element": "<span>",
                "lineClamping": "lines:1 -> truncate, lines:2+ -> line-clamp-N"
            }
        },
        "rules": [
            "text attribute supports interpolation with @{binding} syntax",
            "partialAttributes allows styling ranges within text",
            "linkable enables auto-detection of URLs",
            "Frame alignment must be .leading for textAlign to work correctly (Swift)"
        ]
    },
    "TextField": {
        "description": "Text input field",
        "aliases": ["EditText", "Input"],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["text"],
        "platformSpecific": {
            "swift": {
                "view": "TextField / SecureField (when input='password')",
                "focusManagement": "@FocusState variable generated, nextFocusId for chain",
                "caretColor": "tintColor or caretAttributes.color"
            },
            "kotlin": {
                "composable": "OutlinedTextField / BasicTextField",
                "focusManagement": "FocusManager.requestFocus(nextFocusId)",
                "inputType": "KeyboardOptions based on contentType/input"
            },
            "react": {
                "element": "<input type=\"...\"/>",
                "autoHandler": "text binding auto-generates onPropChange handler",
                "inputMapping": "email->email, password->password, number->number, phone->tel"
            }
        },
        "rules": [
            "input='password' switches to SecureField in SwiftUI",
            "fieldId + nextFocusId creates focus chain across fields",
            "text binding MUST be two-way ($data. in Swift)",
            "React auto-generates onXxxChange from text binding"
        ]
    },
    "Button": {
        "description": "Tappable button component",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {
                "view": "StateAwareButtonView (not plain Button+Text)",
                "asyncSupport": "isAsync flag for async operations with loading state"
            },
            "kotlin": {
                "composable": "Button with Text content",
                "asyncSupport": "isAsync with CoroutineScope(Dispatchers.Main)"
            },
            "react": {
                "element": "<button> or <Link><button> (Next.js navigation)",
                "stateStyles": "hover/active/disabled via Tailwind prefixes"
            }
        },
        "rules": [
            "Uses StateAwareButtonView in Swift (not plain Text+Button)",
            "Width/height are passed to view for background fill",
            "onclick (lowercase) = selector format, onClick (camelCase) = binding format",
            "Supports async operations with loading state and spinner"
        ]
    },
    "Image": {
        "description": "Local image component",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {
                "view": "Image (with .resizable().aspectRatio())",
                "priority": "srcName > src > defaultImage",
                "circleImage": "type='CircleImage' adds .clipShape(Circle())"
            },
            "kotlin": {
                "composable": "Image with painterResource",
                "contentScale": "ContentScale.Fit/Crop/FillBounds"
            },
            "react": {
                "element": "<img/>",
                "objectFit": "aspectfit->contain, aspectfill->cover, scaletofill->fill"
            }
        },
        "rules": [
            ".resizable() must come first, then .aspectRatio (Swift)",
            "CircleImage type adds circular clipping",
            "contentMode maps differently per platform"
        ]
    },
    "NetworkImage": {
        "description": "Remote/network image component",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {
                "view": "AsyncImage or custom NetworkImageView",
                "defaultContentMode": ".center for matchParent"
            },
            "kotlin": {
                "composable": "AsyncImage (Coil)"
            },
            "react": {
                "element": "<img/> with src binding"
            }
        },
        "rules": [
            "Default contentMode is .center for matchParent (Swift)",
            "Supports placeholder/error images via defaultImage"
        ]
    },
    "View": {
        "description": "Container view (HStack/VStack/ZStack)",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {
                "view": "HStack/VStack/ZStack based on orientation",
                "weightedChildren": "Special body splitting for weighted layouts",
                "relativePositioning": "ZStack with alignment for relative layouts"
            },
            "kotlin": {
                "composable": "Row/Column/Box based on orientation",
                "relativePositioning": "ConstraintLayout if children have alignXyzOfView"
            },
            "react": {
                "element": "<div> with flex classes",
                "orientation": "horizontal->flex-row, vertical->flex-col, none->relative"
            }
        },
        "rules": [
            "orientation determines layout: horizontal->HStack/Row, vertical->VStack/Column, none->ZStack/Box",
            "Children with alignXyzOfView trigger relative/constraint layout",
            "bottomToTop/rightToLeft reverses child order",
            "distribution: fillEqually/fill/equalSpacing affects child arrangement"
        ]
    },
    "ScrollView": {
        "description": "Scrollable container",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "ScrollView(.horizontal/.vertical)"},
            "kotlin": {"composable": "LazyColumn/LazyRow or verticalScroll/horizontalScroll"},
            "react": {"element": "<div> with overflow-auto/scroll"}
        },
        "rules": [
            "orientation determines scroll direction",
            "showsIndicator controls scrollbar visibility"
        ]
    },
    "Collection": {
        "description": "List/grid collection with data binding",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {
                "view": "LazyVStack/LazyHStack for performance",
                "sections": "Section-based with headers/footers",
                "flowLayout": "Flow layout support"
            },
            "kotlin": {
                "composable": "LazyColumn/LazyRow/LazyVerticalGrid",
                "sections": "Section-based with column count per section"
            },
            "react": {
                "element": "map() with component references",
                "cellFormat": "sections[].cell or cellClasses for component routing"
            }
        },
        "rules": [
            "items binding connects to data source array",
            "Sections support different cell types per section",
            "cellIdProperty extracts unique keys from item data",
            "scrollTo binding enables programmatic scrolling"
        ]
    },
    "Switch": {
        "description": "Toggle switch (iOS style)",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["isOn", "value", "checked", "bind"],
        "platformSpecific": {
            "swift": {"view": "Toggle with switch style"},
            "kotlin": {"composable": "Switch"},
            "react": {"element": "Hidden checkbox + styled span (iOS-style toggle)"}
        },
        "rules": [
            "State binding priority: isOn > value > checked > bind",
            "Two-way binding updates via $data. (Swift) or updateData (Kotlin)",
            "onValueChange/onToggle for state change callback"
        ]
    },
    "Toggle": {
        "description": "Toggle control (checkbox style)",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["isOn", "value", "checked", "bind"],
        "platformSpecific": {
            "swift": {"view": "Toggle"},
            "kotlin": {"composable": "Checkbox or Switch"},
            "react": {"element": "<input type=\"checkbox\">"}
        },
        "rules": [
            "Similar to Switch but may render differently per platform",
            "State binding priority: isOn > value > checked > bind"
        ]
    },
    "CheckBox": {
        "description": "Checkbox input",
        "aliases": ["Check", "Checkbox"],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["checked", "isOn", "value", "bind"],
        "platformSpecific": {
            "swift": {"view": "Toggle with checkbox style"},
            "kotlin": {"composable": "Checkbox or IconToggleButton (custom icons)"},
            "react": {"element": "<input type=\"checkbox\">"}
        },
        "rules": [
            "Kotlin supports custom icon/selectedIcon via IconToggleButton",
            "checked is primary binding attribute"
        ]
    },
    "Radio": {
        "description": "Radio button group",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["selectedIndex"],
        "platformSpecific": {
            "swift": {"view": "Custom radio button implementation"},
            "kotlin": {"composable": "RadioButton in Row/Column"},
            "react": {"element": "<input type=\"radio\">"}
        },
        "rules": ["selectedIndex tracks currently selected option"]
    },
    "SelectBox": {
        "description": "Dropdown/picker selection",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["selectedIndex"],
        "platformSpecific": {
            "swift": {"view": "Picker"},
            "kotlin": {"composable": "ExposedDropdownMenuBox"},
            "react": {"element": "<select>"}
        },
        "rules": ["selectedIndex tracks currently selected option"]
    },
    "Segment": {
        "description": "Segmented control",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["selectedIndex"],
        "platformSpecific": {
            "swift": {"view": "Picker with segmented style"},
            "kotlin": {"composable": "TabRow or custom segment"},
            "react": {"element": "Button group with useState for selectedIndex"}
        },
        "rules": [
            "Without binding, React auto-generates useState for selectedIndex",
            "selectedIndex tracks active segment"
        ]
    },
    "Slider": {
        "description": "Slider/range input",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["value", "bind"],
        "platformSpecific": {
            "swift": {"view": "Slider"},
            "kotlin": {"composable": "Slider with step calculation"},
            "react": {"element": "<input type=\"range\">"}
        },
        "rules": [
            "value/bind is two-way binding",
            "minimumValue/maximumValue define range (default 0-100)",
            "step defines discrete steps"
        ]
    },
    "Progress": {
        "description": "Progress bar/indicator",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "ProgressView"},
            "kotlin": {"composable": "LinearProgressIndicator / CircularProgressIndicator"},
            "react": {"element": "<progress> or <div> with width percentage"}
        },
        "rules": ["value represents progress (0.0 to 1.0)"]
    },
    "Indicator": {
        "description": "Activity indicator / loading spinner",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "ProgressView (indeterminate)"},
            "kotlin": {"composable": "CircularProgressIndicator"},
            "react": {"element": "Animated spinner div"}
        },
        "rules": []
    },
    "CircleView": {
        "description": "Circular shape view",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "Circle()"},
            "kotlin": {"composable": "Box with CircleShape clip"},
            "react": {"element": "<div> with rounded-full"}
        },
        "rules": []
    },
    "GradientView": {
        "description": "Gradient background view",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "LinearGradient / RadialGradient"},
            "kotlin": {"composable": "Brush.linearGradient / radialGradient"},
            "react": {"element": "<div> with background: linear-gradient(...)"}
        },
        "rules": ["colors array defines gradient stops"]
    },
    "Blur": {
        "description": "Blur effect view",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": False, "kotlin_dynamic": False, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": ".blur() modifier or UIVisualEffectView"},
            "react": {"element": "<div> with backdrop-blur class"}
        },
        "rules": []
    },
    "IconLabel": {
        "description": "Icon with label combination",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "Label with systemImage"},
            "kotlin": {"composable": "Row with Icon + Text"},
            "react": {"element": "<span> with icon + text"}
        },
        "rules": []
    },
    "Web": {
        "description": "Web view / embedded browser",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "WKWebView wrapper"},
            "kotlin": {"composable": "AndroidView with WebView"},
            "react": {"element": "<iframe>"}
        },
        "rules": ["url attribute specifies the web page to load"]
    },
    "SafeAreaView": {
        "description": "Safe area respecting container",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": False
        },
        "twoWayBindings": [],
        "platformSpecific": {
            "swift": {"view": "Respects safeAreaInsets"},
            "kotlin": {"composable": "Respects WindowInsets"}
        },
        "rules": ["Ensures content doesn't overlap with system UI"]
    },
    "TabView": {
        "description": "Tab-based navigation container",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["selectedIndex"],
        "platformSpecific": {
            "swift": {"view": "TabView with tag-based selection"},
            "kotlin": {"composable": "Scaffold with BottomNavigation"},
            "react": {"element": "Tab buttons + conditional content rendering"}
        },
        "rules": ["Each tab child uses tag for identification"]
    },
    "TextView": {
        "description": "Multi-line text input",
        "aliases": [],
        "platforms": {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        },
        "twoWayBindings": ["text"],
        "platformSpecific": {
            "swift": {"view": "TextEditor"},
            "kotlin": {"composable": "OutlinedTextField with multiline"},
            "react": {"element": "<textarea>"}
        },
        "rules": [
            "text binding is two-way",
            "Multi-line input (unlike TextField which is single-line by default)"
        ]
    },
    "EditText": {
        "description": "Text input (Android naming convention)",
        "aliases": [],
        "platforms": {
            "swift_generated": False, "swift_dynamic": False,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": False
        },
        "twoWayBindings": ["text"],
        "platformSpecific": {
            "kotlin": {"composable": "OutlinedTextField"}
        },
        "rules": ["Android-specific alias for TextField functionality"]
    },
    "Input": {
        "description": "Generic input (React naming convention)",
        "aliases": [],
        "platforms": {
            "swift_generated": False, "swift_dynamic": False,
            "kotlin_generated": False, "kotlin_dynamic": False, "react": True
        },
        "twoWayBindings": ["value"],
        "platformSpecific": {
            "react": {"element": "<input>"}
        },
        "rules": ["React-specific input component"]
    }
}


def load_attribute_definitions():
    with open(ATTR_DEF_PATH, "r") as f:
        return json.load(f)


def generate_component_spec(name, attrs, common_attrs, metadata):
    meta = metadata.get(name, {})
    spec = {
        "name": name,
        "description": meta.get("description", f"{name} component"),
        "aliases": meta.get("aliases", []),
        "platforms": meta.get("platforms", {
            "swift_generated": True, "swift_dynamic": True,
            "kotlin_generated": True, "kotlin_dynamic": True, "react": True
        }),
        "attributes": {},
        "bindingBehavior": {},
        "platformSpecific": meta.get("platformSpecific", {}),
        "rules": meta.get("rules", [])
    }

    two_way = set(meta.get("twoWayBindings", []))

    for attr_name, attr_def in attrs.items():
        if attr_name.startswith("_"):
            continue
        spec["attributes"][attr_name] = attr_def

        # Determine binding direction
        attr_type = attr_def.get("type", "")
        has_binding = False
        if isinstance(attr_type, list):
            has_binding = "binding" in attr_type
        elif attr_type == "binding":
            has_binding = True

        if has_binding:
            direction = "two-way" if attr_name in two_way else "read-only"
            spec["bindingBehavior"][attr_name] = {"direction": direction}

    return spec


def generate_common_attributes(common_attrs):
    categories = {
        "sizing": {},
        "spacing": {},
        "visual": {},
        "visibility": {},
        "interaction": {},
        "layout": {},
        "lifecycle": {},
        "accessibility": {},
        "binding": {},
        "other": {}
    }

    sizing_keys = {"width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
                   "weight", "widthWeight", "heightWeight", "maxWidthWeight", "maxHeightWeight",
                   "minWidthWeight", "minHeightWeight", "aspectWidth", "aspectHeight",
                   "aspectRatio", "frame", "rect", "wrapContent"}
    spacing_keys = {"padding", "paddings", "paddingTop", "paddingBottom", "paddingLeft",
                    "paddingRight", "paddingStart", "paddingEnd", "rightPadding", "leftPadding",
                    "minTopPadding", "minBottomPadding", "minLeftPadding", "minRightPadding",
                    "maxTopPadding", "maxBottomPadding", "maxLeftPadding", "maxRightPadding",
                    "margins", "topMargin", "bottomMargin", "leftMargin", "rightMargin",
                    "startMargin", "endMargin", "minTopMargin", "minBottomMargin",
                    "minLeftMargin", "minRightMargin", "maxTopMargin", "maxBottomMargin",
                    "maxLeftMargin", "maxRightMargin", "innerPadding", "insets", "insetHorizontal"}
    visual_keys = {"background", "tapBackground", "highlightBackground", "disabledBackground",
                   "defaultBackground", "cornerRadius", "borderWidth", "borderColor",
                   "borderStyle", "alpha", "opacity", "shadow", "clipToBounds", "tintColor",
                   "effectStyle"}
    visibility_keys = {"visibility", "hidden"}
    interaction_keys = {"onclick", "onClick", "onLongPress", "onPan", "onPinch", "canTap",
                        "enabled", "userInteractionEnabled", "touchDisabledState",
                        "touchEnabledViewIds"}
    layout_keys = {"centerInParent", "centerVertical", "centerHorizontal", "alignTop",
                   "alignBottom", "alignLeft", "alignRight", "alignTopOfView",
                   "alignBottomOfView", "alignLeftOfView", "alignRightOfView",
                   "alignTopView", "alignBottomView", "alignLeftView", "alignRightView",
                   "alignCenterVerticalView", "alignCenterHorizontalView", "toView",
                   "gravity", "indexBelow", "indexAbove",
                   "keyBottomView", "keyTopView", "keyLeftView", "keyRightView"}
    lifecycle_keys = {"onAppear", "onDisappear"}
    accessibility_keys = {"id", "testId", "className", "tag"}
    binding_keys = {"binding", "bind", "binding_id", "binding_group", "propertyName",
                    "bindingScript", "data", "shared_data"}

    for key, attr_def in common_attrs.items():
        if key.startswith("_"):
            continue
        if key in sizing_keys:
            categories["sizing"][key] = attr_def
        elif key in spacing_keys:
            categories["spacing"][key] = attr_def
        elif key in visual_keys:
            categories["visual"][key] = attr_def
        elif key in visibility_keys:
            categories["visibility"][key] = attr_def
        elif key in interaction_keys:
            categories["interaction"][key] = attr_def
        elif key in layout_keys:
            categories["layout"][key] = attr_def
        elif key in lifecycle_keys:
            categories["lifecycle"][key] = attr_def
        elif key in accessibility_keys:
            categories["accessibility"][key] = attr_def
        elif key in binding_keys:
            categories["binding"][key] = attr_def
        else:
            categories["other"][key] = attr_def

    return {
        "description": "Common attributes shared across all components",
        "source": "attribute_definitions.json common section",
        "categories": {k: v for k, v in categories.items() if v}
    }


def generate_modifier_order():
    return {
        "description": "Platform-specific modifier application order. Order affects rendering.",
        "swift": {
            "order": [
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
                "accessibilityIdentifier"
            ],
            "criticalRules": [
                "background MUST come after padding (background includes padding area)",
                "border MUST come after cornerRadius (for rounded border)",
                "frame MUST come before margins (size before external spacing)",
                "Image: .resizable() must come first, then .aspectRatio",
                "Label: .leading alignment added to frame for textAlign to work"
            ]
        },
        "kotlin": {
            "order": [
                "testTag",
                "margins",
                "weight (caller applies)",
                "size (width/height, matchParent/wrapContent, min/max/aspectRatio)",
                "alpha/opacity",
                "shadow/elevation",
                "background (cornerRadius -> clip -> border -> bgColor)",
                "clickable",
                "padding",
                "alignment (RowScope/ColumnScope/BoxScope)"
            ],
            "criticalRules": [
                "Modifier.then() chains left-to-right; order matters",
                "margins before size (outside to inside)",
                "cornerRadius must be applied as clip before background"
            ]
        },
        "react": {
            "note": "React uses Tailwind CSS classes; ordering is less strict",
            "classOrder": [
                "layout (flex, flex-col/row)",
                "sizing (w-*, h-*)",
                "spacing (p-*, m-*)",
                "typography (text-*, font-*)",
                "visual (bg-*, rounded-*, border-*, shadow-*)",
                "opacity",
                "overflow",
                "cursor/interaction"
            ],
            "dynamicStyles": "Values not mappable to Tailwind use inline style objects"
        }
    }


def generate_binding_rules():
    return {
        "description": "JsonUI binding syntax rules",
        "format": {
            "bindingExpression": "@{propertyName}",
            "negation": "@{!propertyName}",
            "defaultValue": "@{propertyName ?? defaultValue}",
            "nestedPath": "@{user.name} (Kotlin Dynamic Mode)"
        },
        "directions": {
            "two-way": {
                "description": "Component state changes reflect back to data model",
                "swift": "$data.propertyName",
                "kotlin": "mutableStateOf + updateData(mapOf(key to value))",
                "react": "value={data.prop} + auto-generated onChange handler",
                "applicableAttributes": [
                    "TextField.text",
                    "TextView.text",
                    "Switch.isOn",
                    "Toggle.isOn",
                    "CheckBox.checked",
                    "Slider.value",
                    "Segment.selectedIndex",
                    "Radio.selectedIndex",
                    "SelectBox.selectedIndex",
                    "TabView.selectedIndex"
                ]
            },
            "read-only": {
                "description": "Display data values only (no write-back)",
                "swift": "data.propertyName",
                "kotlin": "data[propertyName]",
                "react": "{data.propertyName}",
                "applicableAttributes": [
                    "Label.text",
                    "*.width / *.height (frame values)",
                    "*.enabled",
                    "*.hidden / *.visibility",
                    "*.background / *.fontColor",
                    "*.fontSize",
                    "*.opacity / *.alpha"
                ]
            }
        },
        "criticalRules": [
            "Frame values (width, height, etc.) MUST be read-only (data.). $data. is NOT allowed",
            "Two-way binding is only for stateful input components",
            "React auto-generates onPropertyNameChange for two-way bindings",
            "Kotlin Dynamic uses updateData(mapOf(key to value)) for data updates",
            "onclick (lowercase) = selector format (string), onClick (camelCase) = binding format (@{handler})"
        ]
    }


def generate_platform_mapping():
    return {
        "description": "Cross-platform attribute value conversion mapping",
        "values": {
            "matchParent": {
                "swift": ".infinity (frame maxWidth/maxHeight)",
                "kotlin": "fillMaxWidth() / fillMaxHeight()",
                "react": "w-full / h-full"
            },
            "wrapContent": {
                "swift": "Default (no frame specified)",
                "kotlin": "wrapContentWidth() / wrapContentHeight()",
                "react": "w-fit / h-fit"
            }
        },
        "contentMode": {
            "aspectFit": {"swift": ".fit", "kotlin": "ContentScale.Fit", "react": "object-contain"},
            "aspectFill": {"swift": ".fill", "kotlin": "ContentScale.Crop", "react": "object-cover"},
            "scaleToFill": {"swift": ".fill (no aspectRatio)", "kotlin": "ContentScale.FillBounds", "react": "object-fill"}
        },
        "textAlign": {
            "left": {"swift": ".leading", "kotlin": "TextAlign.Start", "react": "text-left"},
            "center": {"swift": ".center", "kotlin": "TextAlign.Center", "react": "text-center"},
            "right": {"swift": ".trailing", "kotlin": "TextAlign.End", "react": "text-right"}
        },
        "fontWeight": {
            "bold": {"swift": ".bold", "kotlin": "FontWeight.Bold", "react": "font-bold"},
            "light": {"swift": ".light", "kotlin": "FontWeight.Light", "react": "font-light"},
            "thin": {"swift": ".thin", "kotlin": "FontWeight.Thin", "react": "font-thin"},
            "medium": {"swift": ".medium", "kotlin": "FontWeight.Medium", "react": "font-medium"},
            "semibold": {"swift": ".semibold", "kotlin": "FontWeight.SemiBold", "react": "font-semibold"}
        },
        "orientation": {
            "horizontal": {"swift": "HStack", "kotlin": "Row", "react": "flex flex-row"},
            "vertical": {"swift": "VStack", "kotlin": "Column", "react": "flex flex-col"},
            "none": {"swift": "ZStack", "kotlin": "Box", "react": "relative"}
        },
        "gravity": {
            "center": {"swift": ".center", "kotlin": "Alignment.Center", "react": "items-center justify-center"},
            "centerHorizontal": {
                "swift_vertical": ".center HStack alignment",
                "kotlin_vertical": "Alignment.CenterHorizontally",
                "react": "items-center (flex-col)"
            },
            "centerVertical": {
                "swift_horizontal": ".center VStack alignment",
                "kotlin_horizontal": "Alignment.CenterVertically",
                "react": "items-center (flex-row)"
            }
        },
        "types": {
            "String": {"swift": "String", "kotlin": "String", "react": "string"},
            "Int": {"swift": "Int", "kotlin": "Int", "react": "number"},
            "Float": {"swift": "CGFloat", "kotlin": "Float", "react": "number"},
            "Double": {"swift": "Double", "kotlin": "Double", "react": "number"},
            "Bool": {"swift": "Bool", "kotlin": "Boolean", "react": "boolean"},
            "Array": {"swift": "[T]", "kotlin": "List<T>", "react": "T[]"},
            "Dictionary": {"swift": "[String: Any]", "kotlin": "Map<String, Any>", "react": "Record<string, any>"}
        }
    }


def main():
    print("Loading attribute_definitions.json...")
    attr_defs = load_attribute_definitions()

    os.makedirs(COMPONENTS_DIR, exist_ok=True)

    common_attrs = attr_defs.get("common", {})

    # Generate component specs
    for comp_name, comp_attrs in attr_defs.items():
        if comp_name.startswith("_") or comp_name == "common":
            continue
        if not isinstance(comp_attrs, dict):
            continue

        spec = generate_component_spec(comp_name, comp_attrs, common_attrs, COMPONENT_METADATA)
        filename = comp_name.lower().replace(" ", "_") + ".json"
        filepath = os.path.join(COMPONENTS_DIR, filename)

        with open(filepath, "w") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)
        print(f"  Generated: specs/components/{filename}")

    # Generate common_attributes.json
    common_spec = generate_common_attributes(common_attrs)
    with open(os.path.join(SPECS_DIR, "common_attributes.json"), "w") as f:
        json.dump(common_spec, f, indent=2, ensure_ascii=False)
    print("  Generated: specs/common_attributes.json")

    # Generate modifier_order.json
    with open(os.path.join(SPECS_DIR, "modifier_order.json"), "w") as f:
        json.dump(generate_modifier_order(), f, indent=2, ensure_ascii=False)
    print("  Generated: specs/modifier_order.json")

    # Generate binding_rules.json
    with open(os.path.join(SPECS_DIR, "binding_rules.json"), "w") as f:
        json.dump(generate_binding_rules(), f, indent=2, ensure_ascii=False)
    print("  Generated: specs/binding_rules.json")

    # Generate platform_mapping.json
    with open(os.path.join(SPECS_DIR, "platform_mapping.json"), "w") as f:
        json.dump(generate_platform_mapping(), f, indent=2, ensure_ascii=False)
    print("  Generated: specs/platform_mapping.json")

    print("\nDone! All spec files generated.")


if __name__ == "__main__":
    main()
