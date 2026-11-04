// Tests voor de huisregels. Draaien: node tests/rules.test.js
const r = require("../js/rules.js");
const a = require("assert");
const ids = ["iep", "berk", "eik"];
const all = (n = 1) => ids.map((id) => ({ resident_id: id, shares: n }));

// Verdelen in hele centen: telt altijd precies op
a.deepStrictEqual(r.splitCents(1000, [{ id: "iep", shares: 1 }, { id: "berk", shares: 1 }, { id: "eik", shares: 1 }]), { iep: 334, berk: 333, eik: 333 });
a.deepStrictEqual(r.splitCents(1001, [{ id: "a", shares: 2 }, { id: "b", shares: 1 }]), { a: 667, b: 334 });
for (let amt = 1; amt < 500; amt += 7) {
  const s = r.splitCents(amt, [{ id: "a", shares: 3 }, { id: "b", shares: 1 }, { id: "c", shares: 2 }]);
  a.strictEqual(s.a + s.b + s.c, amt);
}

// Saldo en afrekenen
const bal = r.balances([
  { amount_cents: 3000, kind: "betaald", payer: "iep", shares: all() },
  { amount_cents: 1000, kind: "betaald", payer: "berk", shares: [{ resident_id: "eik", shares: 1 }] },
  { amount_cents: 600, kind: "ontvangen", payer: "eik", shares: all() },
], ids);
// Eik ontving 600 namens iedereen: hij moet de anderen elk 200 geven.
a.deepStrictEqual(bal, { iep: 3000 - 1000 + 200, berk: -1000 + 1000 + 200, eik: -1000 - 1000 - 600 + 200 });
a.strictEqual(Object.values(bal).reduce((x, y) => x + y), 0);
const tr = r.settle(bal);
a.ok(tr.length <= 2);
const after = { ...bal };
tr.forEach((t) => { after[t.from_id] += t.amount_cents; after[t.to_id] -= t.amount_cents; });
a.deepStrictEqual(Object.values(after), [0, 0, 0]);
a.deepStrictEqual(r.settle({ iep: 500, berk: -500, eik: 0 }), [{ from_id: "berk", to_id: "iep", amount_cents: 500 }]);

// Euro's
a.strictEqual(r.parseEuro("12,5"), 1250);
a.strictEqual(r.parseEuro("€ 3"), 300);
a.strictEqual(r.parseEuro("0"), null);
a.strictEqual(r.parseEuro("1,234"), null);
a.strictEqual(r.euro(-1250), "−€ 12,50");
a.strictEqual(r.euro(5, true), "+€ 0,05");

// Agenda: een kring claimt het huis
const kring = { id: 1, kind: "kring", starts_at: "2026-11-08T18:00:00Z", ends_at: "2026-11-09T00:00:00Z" };
a.strictEqual(r.checkEvent([kring], { kind: "huisavond", starts_at: "2026-11-08T20:00:00Z", ends_at: "2026-11-08T22:00:00Z" }).code, "huis_geclaimd");
a.strictEqual(r.checkEvent([kring], { kind: "kring", starts_at: "2026-11-08T23:00:00Z", ends_at: "2026-11-09T01:00:00Z" }).code, "huis_geclaimd");
a.strictEqual(r.checkEvent([kring], { kind: "huisavond", starts_at: "2026-11-09T00:00:00Z", ends_at: "2026-11-09T02:00:00Z" }), null);
const avond = { id: 2, kind: "huisavond", starts_at: "2026-11-10T18:00:00Z", ends_at: "2026-11-10T23:00:00Z" };
a.strictEqual(r.checkEvent([avond], { kind: "activiteit", starts_at: "2026-11-10T20:00:00Z", ends_at: "2026-11-10T22:00:00Z" }), null);
a.strictEqual(r.checkEvent([avond], { kind: "kring", starts_at: "2026-11-10T20:00:00Z", ends_at: "2026-11-10T22:00:00Z" }).code, "huis_geclaimd");
a.strictEqual(r.checkEvent([kring], { ...kring }), null, "een event botst niet met zichzelf");
a.strictEqual(r.canJoin(kring), false);
a.strictEqual(r.canJoin(avond), true);

// Dibs: geen dubbele boekingen
const was = { id: 1, item_id: "w", starts_at: "2026-11-08T18:00:00Z", ends_at: "2026-11-08T19:00:00Z" };
a.strictEqual(r.checkDib([was], { item_id: "w", starts_at: "2026-11-08T18:30:00Z", ends_at: "2026-11-08T20:00:00Z" }).code, "dib_bezet");
a.strictEqual(r.checkDib([was], { item_id: "d", starts_at: "2026-11-08T18:30:00Z", ends_at: "2026-11-08T20:00:00Z" }), null);
a.strictEqual(r.checkDib([was], { item_id: "w", starts_at: "2026-11-08T19:00:00Z", ends_at: "2026-11-08T20:00:00Z" }), null);
a.strictEqual(r.checkDib([], { item_id: "w", starts_at: "2026-11-08T19:00:00Z", ends_at: "2026-11-08T19:00:00Z" }).code, "tijd_ongeldig");
a.strictEqual(r.dibNow([was], "w", "2026-11-08T18:59:00Z"), was);
a.strictEqual(r.dibNow([was], "w", "2026-11-08T19:00:00Z"), null);

// Streeplijst
a.deepStrictEqual(r.turfTotals([{ resident_id: "eik", price_cents: 80 }, { resident_id: "eik", price_cents: 120 }, { resident_id: "iep", price_cents: 80 }]), { eik: 200, iep: 80 });

console.log("rules: alle tests geslaagd");
