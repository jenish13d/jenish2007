// app/component/ThemeBackground.tsx
// Replaces the whole "BACKGROUND" block (blobs, particles, grain) in Dashboard.

export default function ThemeBackground() {
  return <div className="ss-bg" aria-hidden="true" />;
}

/* ------------------------------------------------------------------
   HOW TO WIRE IT INTO YOUR DASHBOARD

   1) globals.css:
        @import "./arounda-theme.css";   (adjust path)

   2) Delete the `particles` array and this whole block:
        <div className="fixed inset-0 pointer-events-none ...">
          ...blobs, particles.map, grain...
        </div>
      and put this in its place:
        <ThemeBackground />

   3) <main> className -> remove bg-[#0A2137]:
        className="ss-dashboard min-h-screen text-white overflow-hidden relative"

   4) Topbar:  bg-[#0A0E1F]/70  ->  ss-glass   (remove border-b colour classes)

   5) Hero card: replace
        border border-[#334155] bg-gradient-to-br from-[#111827]/95 ...
      with
        ss-glass ss-card
      Headline:
        <h1 className="text-5xl sm:text-7xl">
          Build your stream.<br />
          <span className="ss-gradient-text">Your way.</span>
        </h1>
      Badge: className="ss-glass ss-pill ... ss-eyebrow"

   6) Buttons: "Preview Page" -> ss-glass ss-pill px-4 py-2.5
               primary actions -> ss-btn-primary
               Logout          -> ss-glass ss-pill

   7) Interaction cards / stat tiles: add "ss-glass ss-card p-6"
      and swap accent colours in interactionDefinitions to the palette:
        #5B8BFF -> #4D8AFF,  #7C3AED -> #54438B,  #A78BFA -> #8E87B0

   8) Font: if you license Neue Haas Grotesk, load it in app/layout.tsx:

        import localFont from "next/font/local";
        const haas = localFont({
          src: [
            { path: "../fonts/NeueHaasGrotesk-Regular.woff2",  weight: "400" },
            { path: "../fonts/NeueHaasGrotesk-Medium.woff2",   weight: "500" },
            { path: "../fonts/NeueHaasGrotesk-Semibold.woff2", weight: "600" },
          ],
          variable: "--font-haas",
        });
        // <body className={haas.variable}>
        // then in the css: --ss-font: var(--font-haas), "Helvetica Neue", Inter, sans-serif;

      Without the licensed files it falls back to Helvetica Neue / Inter,
      which is the closest free look.
------------------------------------------------------------------- */
