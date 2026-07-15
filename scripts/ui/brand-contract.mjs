// CCX-006 approved LegalEase visual contract. This module contains configuration
// only: it reads no environment, request, application state, storage, or network.

const list = (values) => Object.freeze([...values]);
const record = (values) => Object.freeze({ ...values });

export const PRODUCT_NAME = "LegalEase Command Center";
export const SHORT_PRODUCT_NAME = "Command Center";
export const APPROVED_WHITE_LOGO_PATH = "assets/brand/logos/legalease-logo-white-2025.png";
export const APPROVED_VISUAL_REFERENCE_PATH = "docs/ux-vnext/reference/command-center-vnext-approved-direction.png";
export const TOKEN_STYLESHEET_PATH = "assets/ui/tokens.css";
export const DESIGN_SYSTEM_SHOWCASE_PATH = "/__vnext/design-system";

export const OFFICIAL_COLORS = record({
  navy950: record({ value: "#071E33", role: "Primary application shell" }),
  navy900: record({ value: "#0B2942", role: "Raised dark surface and hover" }),
  navy800: record({ value: "#123A59", role: "Secondary dark detail" }),
  teal500: record({ value: "#78D2CB", role: "Soft selected state" }),
  teal600: record({ value: "#52BEB7", role: "Selected border and icon" }),
  teal100: record({ value: "#E8F7F5", role: "Quiet selected tint" }),
  orange600: record({ value: "#F04800", role: "Restrained primary-action accent" }),
  orange700: record({ value: "#D84100", role: "Pressed action accent" }),
  orange100: record({ value: "#FFF0E8", role: "Quiet attention tint" }),
  page: record({ value: "#F4F7F8", role: "Application canvas" }),
  surface: record({ value: "#FFFFFF", role: "Primary work surface" }),
  surfaceWarm: record({ value: "#FCFDFD", role: "Warm quiet surface" }),
  border: record({ value: "#DCE5E8", role: "Subtle border" }),
  text: record({ value: "#142433", role: "Primary text" }),
  textMuted: record({ value: "#60717D", role: "Muted text with normal-size contrast" })
});

export const APPROVED_FONT_STACK = list([
  "Geist",
  "Inter",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "sans-serif"
]);

export const LOGO_USAGE_RULES = list([
  "Render the approved PNG directly on deep navy shell surfaces.",
  "Preserve the transparent background and source aspect ratio.",
  "Keep clear space around the border and letters.",
  "Do not crop, stretch, redraw, recolor, outline, or retype the wordmark.",
  "Do not substitute the reference-image wordmark or fabricate a monogram."
]);

export const ACCESSIBILITY_EXPECTATIONS = list([
  "Normal text and controls meet WCAG AA contrast.",
  "Focus is visible for every interactive control.",
  "Status meaning is present in text and never depends on color alone.",
  "Touch targets are at least 44 pixels where practical.",
  "Reduced-motion preferences remove non-essential motion."
]);

export const BRAND_ASSETS = record({
  shellLogo: record({
    name: "Official all-white LegalEase wordmark",
    path: APPROVED_WHITE_LOGO_PATH,
    context: "Deep navy application shell and open mobile navigation drawer"
  }),
  visualReference: record({
    name: "Approved Command Center vNext direction",
    path: APPROVED_VISUAL_REFERENCE_PATH,
    context: "Hierarchy, tone, density, and color-balance reference only"
  }),
  tokens: record({
    name: "LegalEase vNext design tokens",
    path: TOKEN_STYLESHEET_PATH,
    context: "All new vNext component and shell styling"
  })
});

export const brandContract = record({
  productName: PRODUCT_NAME,
  shortProductName: SHORT_PRODUCT_NAME,
  approvedWhiteLogoPath: APPROVED_WHITE_LOGO_PATH,
  approvedVisualReferencePath: APPROVED_VISUAL_REFERENCE_PATH,
  tokenStylesheetPath: TOKEN_STYLESHEET_PATH,
  showcasePath: DESIGN_SYSTEM_SHOWCASE_PATH,
  officialColors: OFFICIAL_COLORS,
  logoUsageRules: LOGO_USAGE_RULES,
  approvedFontStack: APPROVED_FONT_STACK,
  accessibilityExpectations: ACCESSIBILITY_EXPECTATIONS,
  assets: BRAND_ASSETS
});
