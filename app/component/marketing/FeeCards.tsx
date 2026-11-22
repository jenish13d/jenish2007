/** The two payment channels and their fees, with the ₹1,000 worked example. */
export function FeeCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sl-card p-7">
        <p className="sl-kicker">StreamLounge QR &amp; page</p>
        <p className="mt-6 text-[56px] font-medium leading-none tracking-[-0.05em]">8%</p>
        <p className="sl-muted mt-2 text-[13px]">platform fee per superchat</p>
        <dl className="mt-7 space-y-2.5 border-t pt-5 text-[13.5px]" style={{ borderColor: "var(--sl-line)" }}>
          <Row k="Viewer pays" v="₹1,000" />
          <Row k="StreamLounge fee" v="₹80" />
          <Row k="Your share" v="₹920" strong />
        </dl>
        <p className="sl-faint mt-5 text-[12px] leading-5">Gateway charges and applicable taxes are shown separately in your finance reports.</p>
      </div>
      <div className="sl-card p-7">
        <p className="sl-kicker">Your own Razorpay link</p>
        <p className="mt-6 text-[56px] font-medium leading-none tracking-[-0.05em]">0%</p>
        <p className="sl-muted mt-2 text-[13px]">StreamLounge commission</p>
        <dl className="mt-7 space-y-2.5 border-t pt-5 text-[13.5px]" style={{ borderColor: "var(--sl-line)" }}>
          <Row k="Viewer pays" v="₹1,000" />
          <Row k="StreamLounge fee" v="₹0" />
          <Row k="Paid to" v="Your Razorpay" strong />
        </dl>
        <p className="sl-faint mt-5 text-[12px] leading-5">For links in your video descriptions. Razorpay&apos;s own charges and taxes apply on your account.</p>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="sl-muted">{k}</dt>
      <dd className={`sl-num ${strong ? "font-medium" : ""}`} style={strong ? { color: "var(--sl-fg)" } : undefined}>{v}</dd>
    </div>
  );
}

