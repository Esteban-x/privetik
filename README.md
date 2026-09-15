# Privetik — apprendre le russe

App Next.js (App Router, TypeScript, Tailwind v4) : déclinaison des 6 cas,
vocabulaire (SRS + frappe), lecture graduée, **inscription email/mot de passe
(confirmation par email + captcha)**, **auth Google via Supabase**,
**test de niveau** et **dashboard**.

L'IA (Anthropic) sert à générer des textes de lecture originaux, à expliquer
un mot et à relire une réponse jugée fausse. Elle ne calcule **jamais** une
déclinaison : ça reste le rôle du moteur de règles déterministe
(`lib/grammar/`).

Elle écrit aussi la MATIÈRE des exercices — les phrases des déclencheurs, les
contextes d'accord —, mais **à la construction, pas à l'exécution** : ce
qu'elle propose est validé par les garde-fous, relu, puis figé dans un fichier
généré. Un exercice servi à quelqu'un ne dépend donc d'aucun appel réseau, ne
consomme aucun quota, et a été lu par un humain. Voir « Écrire la matière »
plus bas.

---

## 1. Prérequis

- Node.js 18+ et npm
- Un compte Supabase (gratuit) — https://supabase.com
- Une clé API Anthropic — https://console.anthropic.com

## 2. Installation

```bash
npm install
cp .env.local.example .env.local   # puis remplis les valeurs (voir §4)
```

## 3. Configurer Supabase

1. Crée un projet sur supabase.com.
2. **SQL Editor → New query** : colle tout le contenu de `supabase/schema.sql`
   et exécute. Ça crée les tables (profiles, progression, SRS, lecture…), les
   politiques Row Level Security, le trigger de création de profil, et la
   fonction `delete_own_account` qu'utilise `/account` pour la suppression de
   compte. Le fichier est idempotent — le relancer sur un projet existant (par
   exemple après avoir mis à jour ce dépôt) ne casse rien, ça ajoute juste ce
   qui manque.
3. **Authentication → Providers → Email** : laisse-le activé et garde
   **Confirm email** coché. C'est ce réglage qui fait que Supabase envoie le
   mail de confirmation et refuse la connexion tant que le lien n'est pas
   cliqué. (Sans lui, l'inscription ouvrirait une session immédiatement.)
4. **Authentication → Providers → Google** : active-le. Tu auras besoin d'un
   OAuth Client ID Google (console.cloud.google.com → Credentials). Mets comme
   *Authorized redirect URI* la valeur affichée par Supabase (de la forme
   `https://<projet>.supabase.co/auth/v1/callback`).
5. **Authentication → URL Configuration** : ajoute `http://localhost:3000/**`
   dans *Redirect URLs* (et l'URL de prod plus tard).
6. **Authentication → Emails → Confirm signup** *(recommandé)* : remplace le
   corps du lien par

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding">
     Confirmer mon inscription
   </a>
   ```

   `type=email`, pas `type=signup` — ce dernier est un alias déprécié côté
   GoTrue (Supabase Auth) qui échoue silencieusement sur les jetons générés
   quand PKCE est actif (`token_hash` préfixé `pkce_`). `email` est la valeur
   utilisée par tous les exemples officiels Supabase pour ce cas précis.

   Le gabarit par défaut (`{{ .ConfirmationURL }}`) marche aussi — la route
   `/auth/confirm` accepte les deux formes — mais il repose sur un flux PKCE
   lié au navigateur : si l'utilisateur ouvre son mail sur un autre appareil,
   le lien échoue. La version ci-dessus n'a pas ce défaut.
7. **Authentication → Attack Protection → Enable Captcha protection**, provider
   **Turnstile**, colle la *Secret Key* Cloudflare (voir §3bis). C'est ce
   réglage qui fait que Supabase refuse une inscription sans jeton valide —
   voir [Le captcha](#le-captcha) plus bas pour le détail.
8. **Project Settings → API** : copie *Project URL* et *anon public key* dans
   `.env.local`.

## 3bis. Configurer Cloudflare Turnstile

1. Crée un compte gratuit sur https://dash.cloudflare.com (pas besoin d'y
   héberger ton domaine).
2. **Turnstile → Add site** : renseigne ton domaine (`localhost` fonctionne en
   dev), widget mode **Managed**.
3. Copie la **Site Key** dans `.env.local`
   (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) et la **Secret Key** dans Supabase
   (étape 7 ci-dessus) — jamais l'inverse, la Secret Key ne doit **pas**
   atterrir dans ce dépôt.

## 4. Variables d'environnement (`.env.local`)

```
ANTHROPIC_API_KEY=sk-ant-...          # TA clé, jamais partagée ni commitée
ANTHROPIC_MODEL_FAST=claude-haiku-4-5
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...  # Cloudflare, clé PUBLIQUE
```

> La clé **secrète** Turnstile ne va pas dans `.env.local` : elle se configure
> uniquement dans Supabase (§3, étape 7), qui est le seul à en avoir besoin
> pour vérifier les jetons. Sans `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en
> développement, le formulaire retombe sur la clé de test Cloudflare (le
> captcha réussit toujours) ; en production, l'inscription se désactive
> plutôt que de tourner sans protection.

> ⚠️ La clé Anthropic reste **côté serveur** (pas de préfixe `NEXT_PUBLIC_`).
> Elle n'est lue que dans les routes `app/api/**`. Ne la mets jamais dans un
> composant client ni dans un dépôt public.

## 5. Lancer

```bash
npm run dev             # http://localhost:3000
npm run check             # tous les contrôles
npm run check:grammar     # banque de noms et moteur de déclinaison
npm run check:leveltest   # vivier d'items et qualité du placement
npm run check:progression # adaptation au niveau et estimation continue
npm run check:motion      # verbes de mouvement : formes et cohérence des exercices
npm run check:aspect      # aspect verbal : paires et cohérence des exercices
npm run check:participles # participes : formes, trous réels et accords
npm run check:adjectives  # accord de l'adjectif : contextes écrits et témoins
npm run check:variety     # aucune compétence ne tourne en rond (voir plus bas)
npm run build:nouns     # régénère la banque depuis le dictionnaire (rare)
```

Et les quatre scripts qui ÉCRIVENT de la matière (ils appellent l'API
Anthropic, coûtent quelques dollars, et ne servent qu'à la construction) :

```bash
npm run curate:triggers    # les noms que chaque déclencheur admet
npm run curate:templates   # les phrases de chaque déclencheur
npm run curate:adjectives  # les contextes d'accord de l'adjectif
npm run curate:contexts    # aspect, mouvement, participes
```

Voir « Le module Cas » et « Le test de placement » plus bas.

Parcours utilisateur :

- **Inscription** : `/signup` (prénom, nom, email, mot de passe + confirmation,
  captcha) → email de confirmation → clic sur le lien → `/auth/confirm` →
  `/onboarding` (test de placement) → `/dashboard`.
- **Connexion** : `/login`, email/mot de passe ou Google → `/dashboard`.
- **Compte** : `/account` — profil, mot de passe, déconnexion de tous les
  appareils, suppression du compte.

Tant que l'email n'est pas confirmé, la connexion est refusée ; l'écran de
login propose alors de renvoyer le lien.

Tant que l'onboarding (test de niveau) n'est pas terminé, toute page
protégée redirige vers `/onboarding` — pas seulement le dashboard.

Sans clés configurées, l'app se lance quand même : les pages publiques
(accueil, login, inscription) fonctionnent, et les routes privées — dont
`/cases`, `/vocabulary` et `/reading` — redirigent vers `/login` (voir
`PUBLIC_PATHS` dans `proxy.ts`).

---

## Architecture

```
app/
  api/
    ai/reading       génère un texte de lecture original gradué (Haiku)
    level-test/evaluate  rejoue le calcul du niveau côté serveur
    profile          met à jour le profil (nom affiché, onboarded, objectif
                     quotidien de révision)
    errors           les erreurs en attente, relues dans le journal
    lessons          leçons lues et quiz de fin de leçon, sur le compte
    translation/attempt  corrige une traduction (référence, puis second avis)
    vocab/packs      paquets de départ : résumés et ajout
  auth/callback      échange le code OAuth Google → session
  auth/confirm       valide le lien reçu par email → session
  auth/confirmed     écran de confirmation avant de continuer
  signup/            page d'inscription + action serveur (actions.ts)
  account/           réglages du compte + action serveur (suppression)
  login, onboarding, dashboard
  cases, motion, aspect, participles, adjectives, vocabulary, reading
                     (modules)
  seance             la séance du jour
  erreurs            « Mes erreurs » : refaire ce qui a été raté
  traduction         traduire des phrases entières, français → russe
components/
  auth/              SignupForm, TurnstileWidget
  account/           ProfileSettings, PreferencesSettings, PasswordSettings,
                     SecurityActions, DangerZone
lib/
  auth/              config Turnstile, validation des champs, état du form
  grammar/           déclinaison : paradigmes importés + moteur d'explication
                     (nouns-data.generated.ts est généré, ne pas l'éditer)
  ai/                client Anthropic serveur + prompts système
  supabase/          clients navigateur/serveur + types
  srs/, vocabulary/, reading/, leveltest/
  practice/          séance d'exercices partagée, rattrapage, erreurs en
                     attente, séance du jour
  translation/       phrases à traduire et comparaison à la lettre
  courses/quiz.ts    quiz de fin de leçon, tiré des banques et des exemples
supabase/schema.sql  schéma complet (tables + RLS + trigger)
proxy.ts             rafraîchit la session + protège les routes privées
scripts/
  build-nouns.mjs      importe les paradigmes du dictionnaire -> banque
  check-declensions.mjs contrôles de la banque et du moteur
  data/nouns-fr.tsv     sélection + traductions françaises (écrit à la main)
```

## Écrire la matière

Un exercice a besoin de deux choses : une RÈGLE, que le moteur calcule, et une
MISE EN SITUATION, qu'il faut écrire. La première est déterministe et
vérifiable ; la seconde ne l'est pas, et c'est là que l'IA sert.

Elle a d'abord servi à l'exécution : le mode « Phrase » du module Cas appelait
une route à chaque exercice. C'était le seul endroit où du français que
personne n'avait relu atteignait l'apprenant — « Je m'occupe de travail » — et
le plan gratuit, dont le quota valait zéro, n'y avait droit à rien : quatre
phrases figées par cas, en regardant clignoter « Génération d'une phrase… ».

Tout est maintenant écrit à la construction, par les quatre scripts
`curate:*`, et la discipline est la même à chaque fois :

1. **le modèle propose** — une phrase, un contexte, une liste de mots ;
2. **les garde-fous trient** — `lib/grammar/sentence-guard.ts` refuse une
   phrase que le cas demandé ne gouverne pas, le dictionnaire refuse un mot
   dont il ne sait pas placer l'accent, et chaque script ajoute ses propres
   contrôles (le trou n'est pas collé à une désinence, la phrase ne contient
   pas sa propre réponse, la traduction nomme bien le mot cherché) ;
3. **un humain relit** ce qui reste, et coupe. Sur les 654 phrases retenues,
   la relecture en a écarté neuf que rien de mécanique ne pouvait voir : celles
   dont un mot s'accorde avec le trou (« Вот ___, о кото́ром я говори́л » est
   faux dès que le nom est féminin), et « вроде » sans tête nominale ;
4. **le résultat est figé** dans un `*.generated.ts` versionné, et les
   contrôles le rejouent à chaque `npm run check`.

Ce qui ne peut pas être vérifié n'est pas demandé. L'explication d'un accord
n'est plus rédigée mais CALCULÉE depuis le moteur de règles — demandée au
modèle, elle était fausse une fois sur trois (« radical mixte en х » pour
хоро́ший, dont le radical finit par ш). Et une banque entière a été écartée
pour la même raison : la « forme courte » des participes porte un accord dont
le nom support n'est pas repérable dans la phrase.

## La variété

`npm run check:variety` rejoue des sessions : cinquante exercices d'affilée
sur une compétence, cinq fois, sur soixante-cinq axes. Il exige de voir 70 %
de ce que la compétence peut montrer, qu'aucun item ne dépasse son tour de
rôle, et que le premier doublon n'arrive pas trop tôt.

Le plancher n'est pas déclaré : il est MESURÉ, par un long tirage sans
mémoire. Un module qui s'appauvrit fait donc baisser la barre en même temps
que la note — c'est pourquoi le nombre d'items disponibles est affiché
(`--report`) en plus d'être vérifié : les seuils attrapent une régression du
tirage, l'œil attrape une régression de la banque.

Côté exécution, `lib/practice/recent.ts` tient sur l'appareil un anneau des
derniers tirages par compétence. Le tirage n'est pas remplacé : on lui demande
vingt-quatre candidats au lieu d'un, et on garde celui vu le moins récemment.
Un exercice porte plusieurs identifiants — la phrase, le mot — et le plus
récent commande.

## Retenir, pas seulement pratiquer

Les modules corrigeaient bien ; ils ne faisaient presque rien pour qu'une
réponse ratée finisse par être sue. Ce qui suit est construit sur ce que la
recherche sur la mémoire établit le plus solidement — se tester plutôt que
relire, espacer, mélanger — et **sans aucune table nouvelle** : tout se lit
dans `activity_log.meta`, `exercise_progress` et `srs_cards`.

- **Rattrapage dans la séance** (`lib/practice/retry.ts`) : une erreur revient
  trois exercices plus loin, deux fois au plus, jamais deux rattrapages de
  suite ; séries de dix avec bilan. Les rattrapages ne sont pas notés.
- **Dire ce que représente la mauvaise réponse** : chaque leurre porte une
  note (`whyNot`, « forme de « ты » », « se dirait « пятьдеся́т » ») ; aux cas,
  la forme tapée est diagnostiquée (`lib/grammar/diagnose.ts`).
- **Mes erreurs** (`/erreurs`, `lib/practice/errors.ts`) : une erreur est en
  attente tant que la dernière réponse à cet exercice est fausse ; chaque
  banque sait refaire l'exercice exact à partir de son identifiant
  (`rebuild*`). Les erreurs d'avant aujourd'hui passent en premier.
- **Cas mélangés** (`/cases/melange`) : choisir le cas fait partie de la
  question ; l'indice du déclencheur s'efface quand il est maîtrisé.
- **Séance du jour** (`/seance`, `lib/practice/daily-session.ts`) : le
  vocabulaire échu, les erreurs des jours précédents, UNE compétence ciblée
  (la plus faible, sinon une maîtrise qui s'use, sinon la prochaine à portée),
  un texte non lu.
- **Vocabulaire** : paquets de départ tirés de la banque, dix mots nouveaux
  par jour au plus (`lib/vocabulary/new-words.ts`), réapprentissage dans la
  séance, phrases à trous (`lib/vocabulary/cloze.ts`, jugées par le serveur
  avec la même fonction), mode de révision conseillé selon la file.
- **Leçons** : un quiz de fin de leçon sur 124 leçons, sans question écrite à
  la main (`lib/courses/quiz.ts`, tirage semé par le slug) ; les leçons lues
  suivent le compte (`app/api/lessons`).
- **L'oreille** : les nombres à l'oreille (`/numbers/listening`) et la dictée
  (`/alphabet/dictation`), dont chaque leurre est une prononciation réelle.
- **Traduire** (`/traduction`) : des phrases entières du cours et de la
  bibliothèque ; la référence à la lettre, puis un second avis du modèle
  quand la phrase dit la même chose autrement.
- **Une maîtrise s'use** : sans pratique depuis 60 jours, elle ne compte plus
  dans le niveau ; les modules marquent « à rafraîchir » après trois semaines,
  et le tableau de bord montre la précision des cas sur trente jours.

## Le module Cas

Une app d'apprentissage affiche la forme qu'elle calcule comme LA bonne
réponse : une terminaison fausse n'y est pas un bug d'affichage, c'est une
faute enseignée à quelqu'un qui n'a aucun moyen de la détecter. D'où une
règle unique : **on ne fait décliner que des mots dont les formes sont
vérifiées.**

Une partie de la morphologie russe n'est pas dérivable de l'orthographe du
lemme — voyelle mobile (`кусо́к → куск-` mais `уро́к → урок-`), schéma
accentuel (`врачо́м` vs `ме́сяцем`), pluriels supplétifs (`челове́к → лю́ди`).
Un moteur de règles ne peut donc pas PRODUIRE la forme, seulement
l'EXPLIQUER. D'où le partage :

- **la forme** vient du paradigme importé (`lib/grammar/nouns-data.generated.ts`) ;
- **la règle** est calculée par `lib/grammar/decline.ts`, qui sert aussi à
  repérer ce qui lui échappe : quand la règle et le paradigme divergent, le
  module ne récite pas une règle que la forme contredit, il dit à
  l'apprenant que c'est une forme à mémoriser.

Le moteur de règles lit aussi **où tombe l'accent**, parce que deux règles
russes n'en dépendent que : après un radical mou, la désinence accentuée
s'écrit ё et l'atone е (`королём` / `учителем`) ; après une chuintante, о et
е (`врачо́м` / `ме́сяцем`). Le schéma accentuel est une donnée du mot, comme
sa voyelle mobile — le lire n'est pas tricher, c'est ce que fait une
grammaire avant d'énoncer la règle.

Et les cas obliques du **pluriel** se calculent depuis le nominatif pluriel,
pas depuis le lemme : `брат → бра́тья` n'est pas dérivable, mais
`бра́тьям / бра́тьями / бра́тьях` le sont une fois `бра́тья` connu. Ce qu'il
faut mémoriser, c'est le nominatif pluriel ; le reste se déduit, et le
module le dit.

Mesuré sur les 5 412 formes de la banque : la règle retrouve **95,8 %** des
formes, et « forme irrégulière : à mémoriser telle quelle » ne subsiste que
sur **6 cellules** — друзе́й, уше́й, платьев, мечта́ний. Le reste des écarts
est nommé : voyelle d'appui du génitif pluriel, instrumental pluriel en
-ьми, locatif en -у́, nominatif pluriel à mémoriser.

### Le nombre

L'apprenant choisit **Singulier, Pluriel ou Mélange**, et la contrainte du
gabarit l'emporte toujours sur son choix : « несколько ___ » reste au
pluriel, « Меня́ зову́т ___ » au singulier. Chaque déclencheur déclare ce
qu'il accepte (`number`), et `npm run check:grammar` vérifie que le garde-fou
accepte CHAQUE nombre déclaré — pas seulement celui qui est servi
aujourd'hui.

Le pluriel est refusé aux noms qui n'en ont pas d'usage réel : les
indénombrables (on ne demande pas « ри́сы ») et les pluriels défectifs
(`любо́вь`, `ложь`, `мечта́`, dont le génitif pluriel de dictionnaire est
celui d'un autre mot).

### Les variantes

Le dictionnaire donne deux formes pour 139 cases : `дочерьми́` ou
`дочеря́ми`, `тёть` ou `тёте́й`. Les deux sont acceptées, et l'app le dit —
un « faux » évité devient quelque chose d'appris. Les variantes qui ne
diffèrent que par la place de l'accent ne sont pas retenues : la comparaison
retire l'accent, elles étaient donc déjà acceptées.

Conséquence assumée : le vocabulaire personnel de l'apprenant n'alimente
PAS les exercices de cas. Un mot ajouté à la volée n'a pas de paradigme
vérifié, et lui inventer une déclinaison plausible serait exactement le
problème qu'on cherche à éviter.

### Faire évoluer la banque

1. Ajouter une ligne à `scripts/data/nouns-fr.tsv` :
   `lemme_ru <TAB> traduction_fr <TAB> genre_fr(m|f)` (+ une 4e colonne
   `m|f|n` si le dictionnaire ne renseigne pas le genre russe).
2. `npm run build:nouns` — télécharge le dictionnaire au premier lancement
   (cache dans `scripts/.cache/`, ignoré par git), puis régénère la banque.
   Tout mot absent, indéclinable, sans pluriel, aux formes douteuses ou dont
   la traduction française est déjà prise par un autre mot est **signalé et
   écarté** : il n'entre jamais dans un exercice.
3. `npm run check:grammar` — invariants de la banque, paradigmes témoins,
   prénoms, adjectifs, et taux d'accord moteur/dictionnaire.

### L'accent tonique

Toutes les banques le portent — les formes à produire comme les phrases qui
les entourent. Il n'est jamais EXIGÉ de l'apprenant (la correction le
retire), mais c'est l'information la moins devinable pour un francophone et
la seule qui dise comment prononcer un mot.

`node scripts/accent.mjs <fichier>` le pose sur un fichier de banque, et
`--apply` écrit. **Il ne devine jamais** : il n'accentue que là où le
dictionnaire ne donne qu'une lecture, et imprime ce qu'il refuse de
trancher — homographes (`до́ма` à la maison / `дома́` des maisons), formes
absentes du dictionnaire (participes, gérondifs), désinences citées dans une
explication (`-ого` n'est pas un mot). Ces cas-là se règlent dans la table
`OVERRIDES` du script, en lisant la phrase.

Les contrôles refusent un polysyllabe nu, un accent posé sur une consonne,
deux accents dans un mot, et un mot mêlant cyrillique et latin.

### Le dictionnaire

`scripts/lib/dictionary.mjs` charge les quatre fichiers d'OpenRussian —
noms, verbes, adjectifs, invariables : 58 433 lemmes et 536 341 formes
fléchies, toutes accentuées. Il répond à deux questions qu'aucun contrôle ne
savait poser : **ce mot existe-t-il**, et **son accent est-il au bon
endroit**. C'est lui qui a permis de vérifier les 432 formes d'adjectif, les
paires aspectuelles, les verbes de mouvement et de conjugaison, et de
nettoyer le lexique d'autocomplétion.

### Attribution

Les paradigmes et les accents toniques proviennent du dictionnaire
[OpenRussian](https://github.com/Badestrand/russian-dictionary), publié sous
licence **Creative Commons Attribution-ShareAlike 4.0**. Les données dérivées
présentes dans `lib/grammar/nouns-data.generated.ts` restent sous cette
licence : si l'app est distribuée, l'attribution doit être visible.

## Textes

L'ancien module « Lecture » traduisait un mot au clic et colorait les noms
selon leur cas. On voyait QUE « шко́ле » était au prépositionnel, jamais
POURQUOI. Le module (toujours servi sur `/reading`, pour ne casser ni le
sitemap ni les liens) est désormais bâti autour de cette question. Il s'est
appelé « Lire les cas », puis « Textes » quand on a pu y lire les siens.

- **Mon texte** : écrit en français — traduit en russe à chaque pause de
  frappe (`app/api/ai/reading/translate`, poste `suggest`), dans un champ qui
  se retouche — ou collé en russe, puis annoté mot à mot
  (`app/api/ai/reading/annotate`, poste `reading`). Il se lit, se devine et
  s'explique **sans être enregistré** ; « Enregistrer dans Mes textes » le
  garde, explications comprises (`POST /api/reading/mine`).
- **Générer un texte** : écrit par l'IA à son niveau, autour d'un cas choisi,
  et enregistré d'office.

- **Lire** : chaque mot décliné porte la couleur de son cas ; le toucher ouvre
  son analyse — cas, nombre, forme du dictionnaire, raison du cas, traduction
  de la phrase. La légende compte les cas du texte et filtre.
- **Deviner les cas** : les couleurs s'effacent, on choisit le cas de chaque
  mot souligné, l'explication suit la réponse. Seuls les tags vérifiés entrent
  dans le quiz quand il y en a assez.
- **Comprendre** (textes de la bibliothèque) : des questions sur le sens, en
  français, écrites à la main ; le texte s'y lit sans aide.
- **Écouter le texte** : le texte entier, phrase par phrase, la phrase
  entendue surlignée.
- **Ajouter à mes mots** : depuis le panneau d'un mot dont la forme du
  dictionnaire est connue, avec la phrase du texte pour exemple — elle fera
  la phrase à trous.

La raison d'un cas vient de trois sources, de la plus sûre à la moins sûre,
et l'écran dit toujours laquelle il montre :

1. **écrite et relue à la main** pour les textes de la bibliothèque
   (`lib/reading/texts.ts`) — `check:vocab` refuse un mot décliné sans
   explication, une traduction manquante, un déclencheur absent de la phrase ;
2. **calculée** quand le mot qui gouverne le cas est une préposition ou un mot
   de quantité juste devant (`lib/reading/case-hints.ts`), gratuite — sa table
   est confrontée par `check:vocab` à la banque des déclencheurs ;
3. **rédigée par l'IA** à la demande, pour la phrase entière
   (`app/api/reading/explain`, poste de quota `explain`). La réponse est
   filtrée (`lib/reading/explanation.ts`) : explication en russe écartée,
   déclencheur inventé retiré, désaccord avec le cas annoncé mis à part. Elle
   est ensuite **gardée dans le texte** (`why` sur chaque mot, `sentenceFr` sur
   le premier), sans table supplémentaire : rouvrir le texte n'appelle plus rien.
   Un texte non enregistré envoie sa phrase avec la demande
   (`sentencesFromClient`, dans `lib/reading/validate.ts`) ; l'explication reste
   alors à l'écran, et suit le texte s'il est enregistré.

## Le test de placement

`/onboarding` place l'apprenant sur l'échelle CECR. Deux principes, repris
des tests réels :

**Un niveau se VALIDE, il ne se touche pas.** Le ТРКИ demande 66 % de
réussite à un sous-test pour délivrer le niveau correspondant. Ici : un bloc
de 4 items d'un même niveau, validé à partir de 3 bonnes réponses sur 4
(75 %, très au-dessus des 25 % du hasard sur 4 options). Validé → on monte,
échoué → on descend, jusqu'à encadrer le niveau réel. Le résultat est le plus
haut palier validé — jamais un item isolé.

La version précédente montait d'un cran à chaque bonne réponse et retenait
« le plus haut palier réussi parmi les 4 dernières questions » : une seule
bonne réponse en C1, même noyée dans les échecs, suffisait à décrocher C1.
Mesuré par simulation, un vrai A2 était classé B1 ou plus dans 58 % des cas.

**Les items suivent le référentiel ТРКИ** (`lib/leveltest/questions.ts`) :
A1 présent et prépositionnel de lieu, A2 passé/futur et opposition
lieu/direction, B1 instrumental et aspect en contexte, B2 participes,
gérondifs et régime verbal, C1 phraséologie et registre. Chaque item teste
une compétence en contexte, avec une seule réponse défendable — les items
dont deux options se disent réellement en russe ont été écartés.

### Le retest

`/level-test` réévalue le niveau. Trois règles, toutes au service de la
comparabilité :

- **Mêmes règles, mêmes seuils, même calibrage** que la première passation.
  Un test « adapté » à l'apprenant rendrait « je suis passé de A2 à B1 »
  incomparable — c'est le point sur lequel il ne faut pas céder.
- **Items jamais vus** : `level_tests.detail` conserve les réponses item par
  item, donc les questions déjà posées sont écartées du tirage. Sinon le
  retest mesure la mémoire de la correction, pas la compréhension. Le vivier
  tient 5 passations entièrement inédites ; au-delà, les anciens items
  reviennent plutôt que de laisser un palier non sondé.
- **Un délai de 14 jours** entre deux passations. Deux tests rapprochés ne
  diffèrent que par le bruit ; la progression réelle se compte en semaines.

Le rapport est le seul endroit où la personnalisation a sa place : il découpe
le résultat **par domaine** (cas, aspect, verbes de mouvement, participes,
syntaxe, morphologie, lexique), du plus faible au plus solide, et renvoie
vers le module d'entraînement quand il en existe un.

`npm run check:leveltest` vérifie le vivier (4 options, bonne réponse dans
les bornes, assez d'items par palier, domaines représentés), le
**comportement du retest** (aucun item reposé sur 4 passations successives,
et un test qui se déroule quand même une fois le vivier épuisé), ET le
comportement statistique : simulation de candidats de niveau connu, avec des
seuils qui échouent si le placement se dégrade. Mesure actuelle : 100 items,
70 % de placement exact, 96 % à un palier près, et un candidat qui répond au
hasard finit en A0/A1 dans 95 % des cas.

## Les verbes de mouvement

La difficulté n°1 du russe pour un francophone, et longtemps le trou du
programme : le français dit « aller » là où le russe demande trois décisions
en même temps.

1. **Le mode** — à pied, en véhicule, en avion, par l'eau. « Я иду в Москву »
   signifie qu'on s'y rend *à pied*.
2. **La direction** — unidirectionnel (un trajet en cours) contre
   multidirectionnel (habitude, aller-retour, aptitude). Le piège : au passé,
   « вчера я ходил в кино » veut dire qu'on y est allé **et revenu**, alors
   que « я шёл в кино » dit seulement qu'on était en chemin.
3. **Le préfixe** — при-, у-, в-, вы-, под-… qui change le sens, rend le
   verbe perfectif, et impose sa préposition et donc son cas.

Les onze préfixes existent dans les **deux séries** : à pied (`прийти`) et en
véhicule (`приехать`), mêmes prépositions et mêmes cas. Qui sait dire
« подойти к двери » sait dire « подъехать к дому ». Deux choses seulement
changent, et ce sont elles que la série en véhicule enseigne : l'imperfectif
ne se bâtit pas sur `ездить` mais sur un troisième radical, `-езжать`
(`приезжать`, jamais « приездить ») ; et un préfixe qui finit par une
consonne prend le **signe dur** devant е- (`въехать`, `подъехать`,
`съехать`). Les deux règles sont vérifiées — la première par la table
témoin, la seconde mécaniquement.

`/motion` traite ces trois couches comme quatre compétences séparées, dans
l'ordre où elles se construisent (A1 → B1). Chacune isole UNE difficulté :
mélanger le mode et la direction dans un même exercice ne dirait pas laquelle
des deux a fait échouer l'apprenant.

### Pourquoi des schémas et pas des images

Ce qui sépare `идти` de `ходить` n'est pas la scène — c'est un piéton dans
les deux cas — mais la **forme du trajet**. Une photo de quelqu'un qui marche
ne distingue rien ; une flèche qui revient à son point de départ, si. Les
préfixes encodent de la même façon une relation à une frontière (entrer,
sortir, s'arrêter au bord, contourner) : c'est de la géométrie, donc ça se
dessine exactement.

D'où des schémas SVG inline (`components/motion/TrajectoryDiagram.tsx`) :
rien à charger, rien à licencier, et les couleurs suivent le thème.

### Discipline de données

Les formes conjuguées sont écrites et vérifiées, jamais dérivées : `идти` fait
`шёл` au passé, et le préfixe `вы-` porte toujours l'accent (`вы́шел`, jamais
« вышёл »). Même règle que pour les déclinaisons.

`npm run check:motion` vérifie les formes contre une table de référence
relue à la main, **et** la cohérence sémantique des exercices : un exercice
dont la phrase française dit « je vais » ne peut pas attendre « бегу » (je
cours). Cette incohérence-là est apparue au premier essai de génération.

La correction est rejouée côté serveur (`app/api/motion/attempt`), comme pour
les cas : le client envoie l'item et sa réponse, jamais « j'ai eu juste ».

## L'aspect verbal

L'autre catégorie que le français n'a pas. Un francophone la remplace par
imparfait / passé composé, ce qui marche une fois sur deux et installe donc
une erreur au lieu d'un doute. L'aspect ne dit pas QUAND l'action a lieu,
mais quelle **forme** elle a dans le temps :

- **imperfectif** — un processus, une répétition, une action sans borne :
  « Я реша́л зада́чу » = je planchais dessus, sans dire si j'y suis arrivé ;
- **perfectif** — une borne atteinte, un résultat : « Я реши́л зада́чу ».

`/aspect` découpe ça en cinq compétences (A2 → B1) : processus ou résultat,
les mots qui tranchent, les deux futurs, l'impératif et la négation, et la
reconnaissance des paires. Les schémas sont des **timelines** : une ligne
pour le processus, une ligne qui bute sur une borne pour le résultat, des
points pour la répétition, une ligne coupée pour l'interruption.

### La contrainte qui gouverne le module

L'aspect a de **vraies zones ambiguës** : beaucoup de contextes admettent les
deux formes avec une nuance, pas une faute. Or un exercice à choix unique ne
peut porter que sur ce qui est tranché. On ne construit donc d'items que là
où l'aspect est **forcé** — par un marqueur (`долго`, `за два часа`,
`каждый день`), par une construction (impératif négatif), ou par un
enchaînement de résultats. Tout ce dont un russophone dirait « les deux, ça
dépend » reste dehors, quitte à couvrir moins. C'est la même règle qui avait
fait écarter `искать`/`ждать` des déclencheurs de l'accusatif.

### Un contexte, une paire

La phrase française doit nommer le verbe — sinon l'apprenant ne saurait pas
lequel employer — et seul l'aspect reste à trouver. Chaque contexte est donc
lié à **une seule** paire aspectuelle. Sans cette contrainte, la génération
produisait « J'ai lu ce livre » avec « реши́л » attendu comme réponse :
« j'ai résolu ce livre ». Le lien supprime ce mode d'échec par construction
plutôt que par vigilance, et `check:aspect` le vérifie à chaque tirage.

Les formes sont écrites et vérifiées contre une table relue à la main :
`говори́ть → сказа́ть`, `брать → взять`, `класть → положи́ть` sont supplétifs,
aucune règle ne les prédit.

## Les participes et gérondifs

Le dernier domaine que le test mesurait sans que l'app l'entraîne.

**Pas de schéma ici, et c'est délibéré.** Les verbes de mouvement se
dessinent (un trajet a une forme), l'aspect aussi (un événement a une forme
dans le temps). Un participe, non : c'est une **subordonnée comprimée**. Ça
ne se regarde pas, ça se manipule. Le module travaille donc par
transformation — la proposition dépliée au-dessus, sa version condensée en
dessous :

```
Челове́к, кото́рый чита́ет кни́гу   →   челове́к, чита́ющий кни́гу
Кни́га, кото́рую написа́л Толсто́й   →   кни́га, напи́санная Толсты́м
Когда́ он зако́нчил рабо́ту, он ушёл →  зако́нчив рабо́ту, он ушёл
```

Cinq compétences : participes actifs, passifs, forme longue contre forme
courte (« закры́тая дверь » qualifie, « дверь закры́та » affirme), gérondifs,
et — en C1 — **la règle du sujet unique**, l'erreur la plus fréquente et la
plus invisible pour un francophone : « Возвраща́ясь домо́й, начался́ дождь »
est fautif, ce n'est pas la pluie qui rentrait.

### Les trous sont déclarés

`писа́ть` n'a pas de gérondif imperfectif usuel, `помо́чь` pas de gérondif
perfectif moderne, un verbe intransitif pas de participe passif. Ces trous
sont **explicites dans la donnée**, et `check:participles` vérifie qu'aucun
exercice ne demande une forme absente — sinon il exigerait une réponse qui
n'existe pas.

Le contrôle a d'ailleurs servi tout de suite, dans l'autre sens : il a
signalé `решён` / `решена́` comme incohérents. Les données étaient justes —
l'accent quitte le ё et celui-ci redevient е — c'est le contrôle qui
ignorait l'alternance.

## Niveau et progression

Deux mesures cohabitent, volontairement :

- **le niveau testé** (`profiles.level`) vient du test de placement. Il
  mesure la LARGEUR — aspect, verbes de mouvement, participes, que l'app
  n'entraîne nulle part — mais en une douzaine de QCM, donc en
  reconnaissance, et une seule fois ;
- **le niveau de pratique** (`lib/progress/level-estimate.ts`) se recalcule
  à chaque visite du tableau de bord depuis ce que l'apprenant produit
  vraiment. Il croise **deux signaux, et retient le plus faible** :
  - la *profondeur* sur les cas — part des déclencheurs maîtrisés par palier ;
  - la *couverture* du programme — les cas ne sont pas toute la grammaire.
    L'aspect et les verbes de mouvement sont du A2-B1, les participes du
    B2-C1. Quelqu'un qui n'a jamais touché à l'aspect n'a pas démontré un
    niveau B1, quelle que soit sa virtuosité sur le génitif.

  Le plafond est **expliqué** plutôt que subi : « ta maîtrise des cas
  justifierait C1, mais les verbes de mouvement n'ont pas encore été
  abordés » dit quoi faire, là où un chiffre seul ne dirait rien.

  Sept modules entrent dans la couverture, l'accord de l'adjectif compris. Et
  une maîtrise **s'use** : sans pratique depuis `STALE_AFTER_DAYS` (60 jours),
  un déclencheur ou une compétence ne compte plus comme maîtrisé — le
  reprendre suffit à le rendre.

Aucun ne remplace l'autre, et l'écart entre les deux est le signal utile :
quand la pratique dépasse le niveau testé, le tableau de bord propose de
repasser le test.

Un déclencheur est « maîtrisé » selon **une seule** définition, exportée par
`lib/grammar/exercise-selector.ts` et réutilisée par l'estimation — sinon le
tableau de bord annoncerait « acquis » pendant que les exercices continuent
d'insister dessus.

### Ce que le niveau change concrètement

- **Ordre des cas** : `/cases` les présente dans l'ordre d'ACQUISITION
  (nominatif → prépositionnel → accusatif → génitif → datif → instrumental),
  pas dans l'ordre des grammaires russes. Une pastille indique ce qui est de
  saison, ce qui vient ensuite, et ce qui est déjà solide. Rien n'est
  verrouillé.
- **Difficulté du vocabulaire** : chaque nom porte un rang de fréquence, et
  `nounsForLevel` ouvre une part croissante de la banque — 113 mots courants
  à A0, les 451 à partir de B2. Décliner correctement un mot qu'on ne
  comprend pas n'apprend pas grand-chose.
- **Choix des déclencheurs** : le tirage suit les 7 niveaux de l'échelle, et
  la part visée par palier est normalisée par le nombre de déclencheurs de ce
  palier — sans quoi le tirage subit la composition de la banque (le génitif
  compte 24 déclencheurs intermédiaires pour 13 essentiels) au lieu du
  niveau. Un A0 reçoit ~86 % d'essentiels, un C1 une répartition équilibrée.
  Le palier suivant se débloque en avance dès que la maîtrise est démontrée
  **sur ce cas précis**.

`npm run check:progression` verrouille ces comportements par des seuils
explicites : monotonie des pools et de l'estimation, part maximale de
déclencheurs avancés servie à un débutant, et le fait qu'une pratique à 40 %
de réussite reste estimée A0.

## Ce qui reste à faire (pistes)

- Élargir la banque de noms (voir « Faire évoluer la banque » plus haut) :
  451 noms aujourd'hui, le dictionnaire en contient 17 800 exploitables — il
  ne manque que la traduction française.
- Corpus de classiques du domaine public (Pouchkine, Tchekhov…) pour compléter
  la lecture générée.
- Continuer d'élargir les banques des cinq modules de grammaire. Une passe
  vient de les tripler (voir « Écrire la matière ») et `check:variety` tient
  désormais le plancher ; les compétences les plus minces restent celles qui
  ne tirent pas dans une banque de contextes.
- La « forme courte » des participes reste aux onze contextes écrits à la
  main : son champ d'accord dépend d'un nom support que rien ne permet de
  repérer dans la phrase, donc aucune variante ne peut en hériter sans
  risquer d'enseigner un accord faux. L'élargir demande de l'écrire.
- Les items à DEUX options : aspect (passé, marqueurs, futur, impératif),
  mouvement (direction) et participes (forme courte) opposent deux formes,
  ce qui est la nature de la question — mais 50 % de réussite au hasard
  entrent dans la même statistique de précision que les items à quatre
  options. Soit on les compte à part, soit on accepte de sous-estimer la
  difficulté des autres.
- Les banques les plus minces, celles qui ne tirent pas dans une banque de
  contextes et qu'aucun script ne peut donc élargir : `aspect/markers`
  (13 items), `numbers/age` (15), `motion/mode` (17). En sont sorties, écrites
  à la main : `alphabet/spelling` (20), `alphabet/sounds` (22),
  `numbers/duration` (8 → 22), `participles/subject` (8 → 20) et
  `motion/prefix` (11 → 22, la série en véhicule).

  Ces trois-là résistent pour une raison de langue, pas de courage :
  `motion/mode` est bornée par le nombre de verbes d'« aller » que le russe
  possède, `numbers/age` par les nombres qu'il vaut la peine de demander, et
  `aspect/markers` par la liste des adverbes qui décident vraiment de
  l'aspect. Les allonger demanderait d'inventer des items sans contenu.
- Rendre les pages publiques cachables par le CDN. Elles sont rendues à la
  demande à chaque visite et à chaque passage de robot — `Cache-Control:
  private, no-store`, `X-Vercel-Cache: MISS` sur une leçon, 240 ms mesurés
  en production. La cause n'est pas dans les pages : `/cours/[slug]` et
  `/guides/[slug]` ne lisent RIEN de la session. C'est le layout racine qui
  la lit, pour que la barre de navigation parte déjà connectée, et cela rend
  toute l'application dynamique. Deux sorties : déplacer cette lecture côté
  client (au prix d'un bref flash « déconnecté »), ou migrer vers les Cache
  Components de Next 16, faits pour ça — coquille statique, trous dynamiques.
  La seconde est meilleure et demande une vraie migration.
- Faire entrer `motion_progress` dans l'estimation continue du niveau : les
  seuils actuels sont calibrés sur les 136 déclencheurs de cas, les ajouter
  demande de les recalibrer.
- Étiqueter les 136 déclencheurs par niveau CEFR plutôt que par palier
  (basic/intermediate/advanced) : trois paliers ne permettent pas de séparer
  A1 de A2. Travail de contenu, pas de code.
- Élargir encore le vivier du test : 100 items tiennent 5 passations
  inédites, au-delà les questions commencent à revenir.
- Les traductions ratées n'entrent pas dans « Mes erreurs » : la page refait
  les exercices côté navigateur, et la référence d'une traduction ne doit pas
  y arriver avant la réponse. Il faudrait une reconstruction côté serveur.
- Questions de compréhension pour les textes générés : elles sont écrites à
  la main pour la bibliothèque, et une question générée demanderait les mêmes
  garde-fous que les explications de cas.
- La dictée tient sur 52 mots : ceux dont l'oreille produit au moins deux
  fautes réelles et sûres. L'alternance des voyelles finales et les
  consonnes muettes (со́лнце) en ajouteraient, à écrire à la main.

## Le captcha

**Cloudflare Turnstile**, le même système que la majorité des sites récents —
gratuit, illimité, et pour la plupart des visiteurs juste une case qui se
coche seule (pas de grille d'images à résoudre).

Le partage des rôles est volontairement asymétrique :

- **Le navigateur** ([components/auth/TurnstileWidget.tsx](components/auth/TurnstileWidget.tsx))
  affiche le widget et récupère un jeton à usage unique. Turnstile écrit
  lui-même ce jeton dans un input caché (`captchaToken`) que le formulaire
  poste normalement — ça marche même sans JavaScript côté validation finale
  (le widget, lui, a besoin de JS pour se résoudre).
- **L'action serveur** ([app/signup/actions.ts](app/signup/actions.ts))
  transmet ce jeton à `supabase.auth.signUp({ options: { captchaToken } })`.
- **Supabase** (Authentication → Attack Protection) est celui qui vérifie
  cryptographiquement le jeton auprès de Cloudflare, avec la clé secrète.
  C'est la partie importante : ça protège l'endpoint d'inscription
  lui-même — un script qui appellerait l'API Supabase directement, en
  contournant complètement notre formulaire, se ferait quand même rejeter.

Notre code ne voit jamais la clé secrète et ne fait aucun appel réseau vers
Cloudflare — Supabase s'en charge. Si le jeton est absent, expiré, ou déjà
consommé, Supabase renvoie `captcha_failed` ; l'action le traduit en message
et redemande un jeton neuf au widget (ils sont à usage unique).

Sans `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, le formulaire utilise la clé de test
Cloudflare (`1x00000000000000000000AA`) : le widget s'affiche et réussit
toujours, pratique pour développer sans compte Cloudflare, mais ça ne protège
rien — pense à configurer une vraie clé avant de déployer.

## Sécurité — rappel

Ne commite jamais `.env.local`. Si une clé fuite, révoque-la immédiatement dans
la console Anthropic et régénères-en une.

L'inscription ne dit jamais si une adresse est déjà utilisée : le même écran
« vérifie ta boîte mail » s'affiche dans tous les cas, pour éviter d'énumérer
les comptes existants.
