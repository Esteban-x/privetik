/**
 * Contrôles à l'écran — `npm run check:browser`.
 *
 * CE QU'IL COUVRE, ET POURQUOI CE DOMAINE ÉTAIT NU. Les 28 000 contrôles du
 * dépôt portent sur des fonctions pures. Le mode Voix a pourtant produit
 * quatre défauts en une semaine, dont aucun n'était visible d'eux :
 *
 *   un bouton bloqué sur « J'écoute… » parce que start() levait après
 *     l'allumage de l'indicateur ;
 *   un micro câblé sur ru-RU dans les deux sens, donc écoutant du russe
 *     pendant qu'on lui parlait français ;
 *   une fin d'écoute SANS résultat ni erreur, qui n'affichait rien du tout ;
 *   « Écouter » qui prononçait la réponse au moment de la demander.
 *
 * Les quatre se voient à l'écran et nulle part ailleurs. Ce fichier les
 * rejoue.
 *
 * IL N'EST PAS DANS `npm run check`, ET C'EST VOULU. Il lui faut un serveur
 * qui tourne, un Chrome installé, et — pour les pages protégées — une clé de
 * service pour ouvrir une session. Trois conditions qui ne sont pas réunies
 * dans un `check` qu'on veut pouvoir lancer partout en trois secondes. Il
 * s'exécute donc à la demande, avant une mise en ligne :
 *
 *   npm run build && npx next start -p 3100
 *   npm run check:browser
 *
 * ABSENCE = ABANDON, PAS ÉCHEC. Sans Chrome ou sans serveur, il le dit et
 * sort en 0 : un contrôle qui échoue faute d'outil apprend à ignorer ses
 * échecs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, launchChrome, killChrome, findChrome } from "./lib/browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.CHECK_BROWSER_URL || "http://localhost:3100";

const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function skip(reason) {
  console.log(`Contrôles à l'écran : ignorés — ${reason}.`);
  process.exit(0);
}

// ── Conditions ─────────────────────────────────────────────────────────
if (!findChrome()) skip("aucun Chrome trouvé (CHROME_PATH pour le désigner)");
try {
  const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(String(r.status));
} catch {
  skip(`aucun serveur sur ${BASE} (npx next start -p 3100)`);
}

// ── 1. Les statuts, qui ne se vérifient qu'en vrai ─────────────────────
//
// C'est LE contrôle qui manquait : /cases/inexistant répondait 200 avec une
// page vide, en production, pendant des semaines. check:seo tient la règle
// de fichiers qui l'a causé ; celui-ci tient le résultat.
const STATUS = [
  ["/", 200],
  ["/cases", 200],
  ["/cases/genitive", 200],
  ["/cases/nexistepas", 404],
  ["/cours", 200],
  ["/cours/nexistepas", 404],
  ["/guides", 200],
  ["/guides/nexistepas", 404],
  ["/nexistepas", 404],
  ["/premium", 200],
];

for (const [route, expected] of STATUS) {
  const res = await fetch(BASE + route, { redirect: "manual" });
  require_(res.status === expected, `${route} : statut ${res.status}, attendu ${expected}`);
}

// ── 2. Une page de contenu porte ce qu'un robot vient y chercher ───────
{
  const html = await (await fetch(`${BASE}/cases/genitive`)).text();
  require_(/<h1[\s>]/.test(html), "/cases/genitive : aucun <h1>");
  require_(/rel="canonical"/.test(html), "/cases/genitive : aucune adresse canonique");
  require_(
    /<meta name="description"/.test(html),
    "/cases/genitive : aucune méta description"
  );
}

// ── 3. Le mode Voix, là où les contrôles purs ne vont pas ──────────────
//
// La session s'ouvre par un lien magique — la clé de service ne sert qu'à
// ça, et le contrôle s'abstient proprement si elle manque.
function env() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
}

const chrome = await launchChrome();
if (!chrome) skip("Chrome n'a pas démarré");

try {
  const page = await connect();

  // Un faux moteur de reconnaissance : le vrai n'existe pas sans service de
  // parole, et c'est de toute façon le COMPORTEMENT DE L'APP qu'on observe —
  // quelle langue elle demande, ce qu'elle affiche quand rien ne revient.
  await page.beforeLoad(`
    window.__ttsAsked = [];
    window.__langAsked = [];
    const _fetch = window.fetch;
    window.fetch = async (...a) => {
      const url = typeof a[0] === "string" ? a[0] : a[0]?.url ?? "";
      if (url.includes("/api/tts")) { try { window.__ttsAsked.push(JSON.parse(a[1].body)); } catch {} }
      return _fetch(...a);
    };
    class FauxMoteur {
      constructor() { this.lang = ""; window.__last = this; }
      start() { window.__langAsked.push(this.lang); setTimeout(() => this.onstart && this.onstart(), 10); }
      stop() { setTimeout(() => this.onend && this.onend(), 10); }
      abort() { setTimeout(() => this.onend && this.onend(), 10); }
    }
    window.SpeechRecognition = FauxMoteur;
    window.webkitSpeechRecognition = FauxMoteur;
    window.__dire = (t) => window.__last.onresult({ results: { 0: { 0: { transcript: t } } } });
    window.__rienDire = () => window.__last.onend();
  `);

  const cfg = env();
  const hasKey = cfg.NEXT_PUBLIC_SUPABASE_URL && cfg.SUPABASE_SERVICE_ROLE_KEY;
  const account = process.env.CHECK_BROWSER_ACCOUNT;

  if (!hasKey || !account) {
    console.log(
      "  (mode Voix ignoré : CHECK_BROWSER_ACCOUNT et une clé de service sont requis)"
    );
  } else {
    const headers = {
      apikey: cfg.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };
    const link = await (
      await fetch(`${cfg.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "magiclink", email: account }),
      })
    ).json();

    await page.goto(
      `${BASE}/auth/confirm?token_hash=${link.hashed_token}&type=magiclink&next=/vocabulary/voice`
    );
    await page.settle(2000);
    await page.goto(`${BASE}/vocabulary/voice`);
    await page.settle(3000);

    const body = await page.text();
    if (body.includes("Aucun mot à réviser")) {
      console.log("  (mode Voix ignoré : ce compte n'a aucun mot à réviser)");
    } else {
      // a. LA LANGUE SUIT LE SENS. Le défaut d'origine : ru-RU des deux côtés.
      for (const [bascule, bouton, attendu] of [
        ["РУ → FR", "Dire en français", "fr"],
        ["FR → РУ", "Dire en russe", "ru"],
      ]) {
        await page.click(bascule);
        await page.settle(1200);
        await page.evaluate("window.__langAsked = []");
        await page.click(bouton);
        await page.settle(700);
        const asked = await page.evaluate("JSON.stringify(window.__langAsked)");
        require_(
          JSON.parse(asked).some((l) => l.startsWith(attendu)),
          `voix ${bascule} : le micro écoute ${asked}, attendu du ${attendu}`
        );
        await page.evaluate("window.__last && window.__last.stop()");
        await page.settle(600);
      }

      // b. « ÉCOUTER » DIT LA CONSIGNE, JAMAIS LA RÉPONSE.
      //
      // OBSERVÉ SUR L'INTENTION, PAS SUR LE RÉSEAU. Première version : on
      // regardait ce que le clic demandait à /api/tts. Elle ne voyait rien,
      // parce que l'audio déjà entendu est mis en cache par le module —
      // aucune requête, donc aucune preuve, et le contrôle passait au vert
      // avec le défaut réintroduit. Deux observables résistent au cache :
      // le libellé accessible du bouton, et le PREMIER son demandé au
      // chargement, qui est la consigne jouée d'office.
      await page.click("FR → РУ");
      await page.settle(1200);
      await page.evaluate("window.__ttsAsked = []");
      await page.goto(`${BASE}/vocabulary/voice`);
      await page.settle(3000);

      const label = await page.evaluate(
        `(() => { const b = [...document.querySelectorAll("button")]
            .find(e => (e.getAttribute("aria-label") || "").startsWith("Écouter le mot"));
          return b ? b.getAttribute("aria-label") : "(absent)"; })()`
      );
      require_(
        label.includes("français"),
        `voix « dis ce mot en russe » : le bouton d'écoute annonce « ${label} » — c'est la réponse`
      );

      const premier = JSON.parse(await page.evaluate("JSON.stringify(window.__ttsAsked)"))[0];
      require_(
        premier && premier.lang === "fr",
        `voix « dis ce mot en russe » : le premier son joué est ${JSON.stringify(premier)}, attendu la consigne française`
      );

      // c. UNE ÉCOUTE QUI N'ABOUTIT PAS DIT QUELQUE CHOSE, et rend la main.
      await page.click("Dire en russe");
      await page.settle(700);
      await page.evaluate("window.__rienDire()");
      await page.settle(1500);
      const apres = await page.text();
      require_(
        /Je n'ai pas réussi à transcrire|Je n.ai pas réussi/.test(apres),
        "voix : une écoute sans résultat ne dit rien — c'est le défaut « rien ne se produit »"
      );
      require_(
        !apres.includes("J’écoute…"),
        "voix : le bouton reste sur « J'écoute… » après une écoute sans résultat"
      );

      // d. UNE RÉPONSE FAUSSE LAISSE LA MAIN : ce qui a été entendu, redire,
      //    ou voir la réponse. Un mot inventé, pour être sûr de ne tomber sur
      //    aucun mot de la liste — une réponse reconnue, elle, se révèle
      //    d'elle-même et n'afficherait pas ces boutons.
      await page.click("Dire en russe");
      await page.settle(700);
      await page.evaluate('window.__dire("абракадабра")');
      await page.settle(1500);
      const entendu = await page.text();
      require_(entendu.includes("J'ai entendu"), "voix : le transcript ne s'affiche pas");
      require_(entendu.includes("Voir la réponse"), "voix : pas de « Voir la réponse » après une réponse fausse");
      require_(entendu.includes("Redire"), "voix : pas de bouton Redire après une réponse");

      // e. LES DEUX COMMANDES RESTENT CÔTE À CÔTE — le défaut du repli.
      const geom = JSON.parse(
        await page.evaluate(`(() => {
          const b = [...document.querySelectorAll(".shadow-float .grid > button")];
          if (b.length < 2) return JSON.stringify({ n: b.length });
          const [x, y] = b.map((e) => e.getBoundingClientRect());
          return JSON.stringify({
            n: b.length,
            memeLigne: Math.abs(x.top - y.top) < 4,
            deborde: b.some((e) => e.scrollWidth > e.clientWidth + 1),
          });
        })()`)
      );
      require_(geom.n === 2, `voix : ${geom.n} commande(s) dans la rangée, attendu 2`);
      require_(geom.memeLigne === true, "voix : Écouter et Parler ne sont plus sur la même ligne");
      require_(geom.deborde === false, "voix : un libellé déborde de son bouton");
    }
  }

  page.close();
} finally {
  killChrome(chrome);
}

// ── Verdict ────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\nÀ l'écran : ${failures.length} problème(s) sur ${checks} contrôles.\n`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`Contrôles à l'écran : ${checks} passés sur ${BASE}.`);
