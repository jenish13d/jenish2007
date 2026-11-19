import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAnnouncement, sanitizeForSpeech, spokenAmount } from "../lib/announcer/announce.ts";

const on = { readEmojis: true, readMessage: true };

test("name and amount", () => {
  assert.equal(buildAnnouncement({ senderName: "Jay", amountPaise: 10000, currency: "USD" }, on), "Jay donated 100 dollars.");
  assert.equal(spokenAmount(100, "INR"), "1 rupee");
  assert.equal(spokenAmount(12550, "INR"), "125.50 rupees");
});
test("emoji-only message reads the emoji names", () => {
  assert.equal(
    buildAnnouncement({ senderName: "Jay", amountPaise: 10000, currency: "USD", message: "😀😀😀" }, on),
    "Jay donated 100 dollars. Smiley face, smiley face, smiley face.",
  );
});
test("text message is read after 'and says'", () => {
  assert.equal(
    buildAnnouncement({ senderName: "Jay", amountPaise: 10000, currency: "USD", message: "Keep going!" }, on),
    "Jay donated 100 dollars and says, Keep going!",
  );
});
test("emoji reading and message reading can be turned off", () => {
  assert.equal(
    buildAnnouncement({ senderName: "Jay", amountPaise: 10000, currency: "INR", message: "😀" }, { readEmojis: false, readMessage: true }),
    "Jay donated 100 rupees.",
  );
  assert.equal(
    buildAnnouncement({ senderName: "Jay", amountPaise: 10000, currency: "INR", message: "hi" }, { readEmojis: true, readMessage: false }),
    "Jay donated 100 rupees.",
  );
});
test("malicious input is neutralised", () => {
  const out = buildAnnouncement(
    { senderName: "<b>Jay</b>", amountPaise: 5000, currency: "INR", message: "<script>alert(1)</script> visit https://evil.test aaaaaaaaaa‮" },
    on,
  );
  assert.ok(!/[<>]/.test(out), out);
  assert.ok(!out.includes("evil"), out);
  assert.ok(!out.includes("aaaaa"), out);
  assert.equal(sanitizeForSpeech("a​b"), "ab");
});
test("hidden sender and amount", () => {
  assert.equal(
    buildAnnouncement({ senderName: "Jay", amountPaise: 5000, currency: "INR" }, { ...on, showSender: false, showAmount: false }),
    "A viewer sent a superchat.",
  );
});
