// De Bosboom — podcasts voor het Radio-tabblad (server). Wordt geladen door bosboom.pb.js.
// De app mag de RSS-feeds van de NPO niet zelf ophalen (de browser blokkeert dat: CORS), dus de Pi
// haalt de feed op en stuurt alleen de laatste afleveringen terug. De mp3 zelf speelt de browser
// gewoon rechtstreeks af. Alleen feeds uit de lijst hieronder: dit is geen open doorgeefluik.
// Een podcast toevoegen: zet hem hier én in js/radio.js (PODCASTS), met dezelfde id.

// Voor de tests kun je een nep-feedserver aanwijzen.
const BASE = $os.getenv("PODCAST_FEED_URL") || "https://podcast.npo.nl";
const FEEDS = {
  "sven-op-1": "/feed/sven-op-1.xml",
  "oog-op-morgen": "/feed/met-het-oog-op-morgen.xml",
  "nooit-meer-slapen": "/feed/nooit-meer-slapen.xml",
};
const MAX = 15, CACHE_MS = 10 * 60 * 1000;

function fail(code) { throw new BadRequestError(code); }

function requireHuis(app, authId) {
  let huis = false;
  try { huis = app.findRecordById("profiles", authId).getBool("huis"); } catch (_) {}
  if (!huis) throw new ForbiddenError("geen_toegang");
}

// XML-tekens terug naar gewone tekst. Twee keer, want de NPO zet in de mp3-links "&amp;amp;".
function unxml(s) {
  s = String(s || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  for (let i = 0; i < 2; i++) {
    s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
  }
  return s.trim();
}
const tag = (xml, name) => { const m = xml.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">")); return m ? unxml(m[1]) : ""; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp("<" + name + "\\s[^>]*?\\b" + a + "\\s*=\\s*\"([^\"]*)\"")); return m ? unxml(m[1]) : ""; };

// "00:24:27", "24:27" of "1467" (seconden) -> minuten
function minutes(d) {
  if (!d) return 0;
  const p = String(d).split(":").map(Number);
  if (p.some(isNaN)) return 0;
  const s = p.reduce((t, x) => t * 60 + x, 0);
  return Math.max(1, Math.round(s / 60));
}

// RSS -> { title, episodes: [{ title, date, url, min }] }, nieuwste eerst. Alleen http(s)-audio.
function parse(xml) {
  const items = String(xml).split(/<item[\s>]/).slice(1).map((s) => s.split("</item>")[0]);
  const episodes = [];
  for (const it of items) {
    const url = attr(it, "enclosure", "url");
    if (!/^https?:\/\//.test(url)) continue;
    const d = new Date(tag(it, "pubDate"));
    episodes.push({
      title: (tag(it, "itunes:title") || tag(it, "title")).slice(0, 200),
      date: isNaN(d) ? "" : d.toISOString(),
      url,
      min: minutes(tag(it, "itunes:duration")),
    });
    if (episodes.length >= MAX) break;
  }
  const head = String(xml).split(/<item[\s>]/)[0];
  return { title: tag(head, "title"), episodes };
}

function call(e) {
  const app = e.app;
  if (!e.auth) throw new ForbiddenError("geen_toegang");
  requireHuis(app, e.auth.id);
  const id = e.request.pathValue("id");
  if (!FEEDS[id]) fail("podcast_onbekend");

  // Even onthouden, zodat niet elke tik de NPO belast.
  const key = "podcast:" + id, hit = app.store().get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let res;
  try { res = $http.send({ url: BASE + FEEDS[id], method: "GET", timeout: 20 }); } catch (_) { fail("podcast_onbereikbaar"); }
  if (res.statusCode !== 200) fail("podcast_onbereikbaar");
  const data = parse(toString(res.body));
  if (!data.episodes.length) fail("podcast_onbereikbaar");
  app.store().set(key, { at: Date.now(), data });
  return data;
}

module.exports = { call, parse, FEEDS };
