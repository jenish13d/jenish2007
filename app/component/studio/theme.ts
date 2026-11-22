/**
 * Legacy hook point. The studio vocabulary (`.st-*`) is now defined once, in
 * app/sl.css, on the StreamLounge design tokens. Pages that still inject
 * STUDIO_CSS get only a few page-level resets.
 */
export const STUDIO_CSS = `
.st-root { position: relative; }
.st-main { position: relative; min-width: 0; }
`;
