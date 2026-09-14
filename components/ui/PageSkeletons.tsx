/**
 * Les squelettes de chargement, page par page.
 *
 * POURQUOI ILS EXISTENT. Toutes les pages sont dynamiques — le layout racine
 * lit la session — et Next ne précharge une route dynamique que si elle a un
 * `loading.tsx` : sans lui, le clic reste sans effet visible jusqu'à la
 * réponse du serveur. Le squelette rend la bascule immédiate.
 *
 * POURQUOI UN PAR PAGE, ET PLUS UN GÉNÉRIQUE. Le squelette générique
 * (« en-tête puis grille ») devait annoncer la forme de la page ; il en
 * annonçait souvent une autre. La page des tarifs, un héros centré suivi de
 * trois colonnes, s'ouvrait sur une grille de six tuiles à icône ; la séance
 * du jour, une liste d'étapes, sur la même grille ; le test de niveau sur une
 * carte de QCM. L'œil se pose là où le squelette lui dit de regarder, puis
 * doit tout reprendre quand la page arrive : c'est pire qu'un écran vide.
 *
 * Chaque squelette reprend donc la charpente de SA page — mêmes largeurs,
 * mêmes marges, mêmes blocs dans le même ordre — sans en copier le détail.
 * Quand une page change de structure, son squelette change avec elle.
 *
 * UN SQUELETTE PAR SEGMENT, PAS PAR DOSSIER. Un `loading.tsx` englobe aussi
 * les sous-routes : posé dans `app/aspect/`, il s'affichait en arrivant sur
 * `/aspect/past`, et celui de `app/vocabulary/` sur `/vocabulary/review`.
 * Les accueils vivent donc dans un groupe `(index)/`, qui garde son squelette
 * sans l'imposer à ses voisins.
 *
 * TROIS ARBRES N'EN ONT PAS, EXPRÈS : `/cases/[caseSlug]`, `/cours/[slug]` et
 * `/guides/[slug]`. Une frontière de chargement y ferait partir le statut 200
 * avant que `notFound()` ne s'exécute — voir la règle de `check:seo`.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

function Status({ children }: { children: string }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  );
}

/**
 * « ← Retour » au-dessus du titre. Dans une boîte de la hauteur de la ligne
 * de texte qu'il remplace (16 px) : une barre de 12 px nue remontait tout
 * ce qui suit de 4 px, et le titre sautait à l'arrivée de la page.
 */
function BackLink({ className = "mb-6" }: { className?: string }) {
  return (
    <div className={`flex h-4 items-center ${className}`}>
      <Bar className="h-3 w-28 rounded-full" />
    </div>
  );
}

/** Surtitre, titre, chapô — l'en-tête commun de la plupart des pages. */
function Header({
  label = true,
  titleWidth = "w-80",
  lines = 2,
  className = "mb-7 sm:mb-10",
}: {
  label?: boolean;
  titleWidth?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {/* Mêmes hauteurs que les lignes qu'elles remplacent : le surtitre
          (16 px) et le titre (36 px, 40 px dès sm). */}
      {label && (
        <div className="mb-3.5 flex h-4 items-center">
          <Bar className="h-3 w-20 rounded-full" />
        </div>
      )}
      <Bar className={`h-9 sm:h-10 ${titleWidth} max-w-full`} />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Bar
            key={i}
            className={`h-4 max-w-2xl ${i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * La carte d'entraînement : bandeau de couleur, consigne, énoncé, puis
 * quatre options ou un champ de saisie — la forme de PracticeCard et de la
 * carte du module Cas.
 */
export function PracticeCardSkeleton({
  answer = "choice",
  toolbar = false,
}: {
  answer?: "choice" | "typing";
  /** La rangée de modes sous le bandeau (module Cas). */
  toolbar?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] surface shadow-float">
      <div className="skeleton h-[46px] rounded-none sm:h-[50px]" />
      {toolbar && (
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3 sm:px-6">
          {[0, 1, 2].map((i) => (
            <Bar key={i} className="h-8 w-28 rounded-full" />
          ))}
        </div>
      )}
      <div className="p-5 sm:p-7">
        <Bar className="h-3 w-28 rounded-full" />
        <Bar className="mt-4 h-8 w-4/5" />
        <Bar className="mt-3 h-4 w-2/5" />
        {answer === "typing" ? (
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Bar className="h-[50px] flex-1 rounded-[10px]" />
            <Bar className="h-[50px] rounded-[10px] sm:w-32" />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Bar key={i} className="h-[50px] rounded-[10px]" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Exercices ─────────────────────────────────────────────────────

/** L'accueil d'un module d'exercices : en-tête, vitrine, compétences. */
export function ModuleHubSkeleton({
  showcase,
  lesson = false,
  cards,
  card,
}: {
  /**
   * Ce qui s'intercale entre l'en-tête et les compétences : deux schémas
   * (aspect, mouvement), un tableau (adjectif, et les modules bâtis sur
   * ModuleHub), ou des lignes comprimées (participes).
   */
  showcase: "diagrams" | "table" | "rows";
  /** Le lien « Lire la leçon d'abord », sous la vitrine (modules bâtis sur ModuleHub). */
  lesson?: boolean;
  cards: number;
  /** Tuile à bandeau de couleur (ModuleHub) ou à pastille (pages écrites à la main). */
  card: "bar" | "icon";
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <Status>Chargement du module…</Status>
      <div aria-hidden>
        {/* Les introductions des modules tiennent sur quatre lignes. */}
        <Header lines={4} />

        {showcase === "diagrams" && (
          <div className="mb-12 grid grid-cols-1 gap-4 rounded-[20px] surface p-7 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col items-center">
                <Bar className="h-24 w-56 max-w-full rounded-xl" />
                <Bar className="mt-3 h-4 w-32" />
                <Bar className="mt-2 h-3 w-48 max-w-full" />
              </div>
            ))}
          </div>
        )}

        {showcase === "table" && (
          <div
            className={`overflow-hidden rounded-[20px] border border-border ${lesson ? "mb-7 sm:mb-10" : "mb-12"}`}
          >
            <div className="flex gap-6 border-b border-border bg-bg3 px-4 py-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Bar key={i} className="h-3 w-12 rounded-full" />
              ))}
            </div>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex gap-6 border-b border-border bg-bg2 px-4 py-4 last:border-0">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Bar key={i} className={`h-3.5 ${i === 0 ? "w-20" : "w-12"}`} />
                ))}
              </div>
            ))}
          </div>
        )}

        {showcase === "rows" && (
          <div className="mb-12 space-y-3 rounded-[20px] surface p-7">
            {["w-11/12", "w-4/5", "w-10/12"].map((w, i) => (
              <Bar key={i} className={`h-6 ${w}`} />
            ))}
          </div>
        )}

        {lesson && <Bar className="mb-7 h-[42px] w-60 max-w-full rounded-xl sm:mb-10" />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: cards }).map((_, i) =>
            card === "bar" ? (
              <div key={i} className="flex flex-col overflow-hidden rounded-[20px] surface">
                <div className="skeleton h-1.5 w-full rounded-none" />
                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Bar className="h-5 w-44" />
                    <Bar className="h-4 w-8 rounded-full" />
                  </div>
                  <Bar className="h-3.5 w-full" />
                  <Bar className="mt-2 h-3.5 w-11/12" />
                  <Bar className="mt-2 h-3.5 w-3/5" />
                  <Bar className="mt-5 h-3 w-28 rounded-full" />
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-4 rounded-2xl surface p-6">
                <Bar className="h-11 w-11 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <Bar className="h-6 w-44" />
                  <Bar className="mt-3 h-3.5 w-full" />
                  <Bar className="mt-2 h-3.5 w-4/5" />
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** Une compétence : retour, titre et niveau, résumé, leçon, carte d'entraînement, étape suivante. */
export function SkillPageSkeleton({ answer = "choice" }: { answer?: "choice" | "typing" }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:py-16">
      <Status>Chargement de l&apos;exercice…</Status>
      <div aria-hidden>
        <BackLink />
        <div className="mb-3 flex items-baseline gap-3">
          <Bar className="h-9 w-72 max-w-full" />
          <Bar className="h-4 w-8" />
        </div>
        <Bar className="h-4 w-full max-w-2xl" />
        <Bar className="mt-2 h-4 w-2/3 max-w-xl" />
        <Bar className="mb-8 mt-6 h-4 w-60" />

        <PracticeCardSkeleton answer={answer} />

        <div className="mt-10 rounded-[20px] surface p-6">
          <Bar className="h-3 w-24 rounded-full" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Bar className="h-5 w-48" />
              <Bar className="mt-2 h-3.5 w-full max-w-md" />
            </div>
            <Bar className="h-10 w-32 rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Une page du module Cas : en-tête, carte de déclinaison, déclencheurs, tableau. */
export function CasePageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:py-16">
      <Status>Chargement du cas…</Status>
      <div aria-hidden>
        <BackLink />
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <Bar className="h-9 w-56" />
          <Bar className="h-6 w-40" />
        </div>
        <div className="mb-7 space-y-2 sm:mb-10">
          <Bar className="h-4 w-full max-w-2xl" />
          <Bar className="h-4 w-1/3 sm:hidden" />
        </div>

        <PracticeCardSkeleton answer="typing" toolbar />
        <Bar className="mt-5 h-4 w-72 max-w-full" />

        <div className="mt-10 sm:mt-14">
          <div className="mb-3.5 flex h-4 items-center">
            <Bar className="h-3 w-28 rounded-full" />
          </div>
          <Bar className="h-3.5 w-full max-w-2xl" />
          <Bar className="mt-2 h-3.5 w-1/3" />
          <div className="mt-5 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl surface p-5">
                <Bar className="h-3 w-32 rounded-full" />
                {[0, 1, 2].map((j) => (
                  <div key={j} className="mt-4">
                    <Bar className="h-4 w-16" />
                    <Bar className="mt-1.5 h-3 w-4/5" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border sm:mt-14">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex gap-8 border-b border-border px-4 py-3.5 last:border-0">
              <Bar className="h-3.5 w-24" />
              <Bar className="h-3.5 w-28" />
              <Bar className="h-3.5 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Retour, titre, chapô, puis une carte d'entraînement — cas mélangés, mes erreurs. */
export function PracticePageSkeleton({ back = true, counter = false }: { back?: boolean; counter?: boolean }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:py-16">
      <Status>Chargement…</Status>
      <div aria-hidden>
        {back && <BackLink />}
        <Header label={false} titleWidth="w-60" lines={3} />
        {counter && <Bar className="mb-4 h-4 w-72 max-w-full" />}
        <PracticeCardSkeleton answer="typing" />
      </div>
    </div>
  );
}

/** /traduction : en-tête, niveaux, carte de traduction. */
export function TranslationSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-12">
      <Status>Chargement des phrases…</Status>
      <div aria-hidden>
        <BackLink />
        <Header titleWidth="w-72" className="mb-6" />
        <div className="mb-6 flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-[30px] w-36 rounded-full" />
          ))}
        </div>
        <div className="overflow-hidden rounded-[20px] surface">
          <div className="skeleton h-[46px] rounded-none" />
          <div className="px-6 py-6">
            <Bar className="h-3 w-28 rounded-full" />
            <Bar className="mt-3 h-8 w-4/5" />
            <Bar className="mt-5 h-[84px] w-full rounded-[10px]" />
            <div className="mt-5 flex flex-wrap gap-3">
              <Bar className="h-10 w-28 rounded-[10px]" />
              <Bar className="h-10 w-56 rounded-[10px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** /exercices : en-tête, chiffres, traduction, filtres, cartes des modules. */
export function ExercisesHubSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 sm:py-12">
      <Status>Chargement des exercices…</Status>
      <div aria-hidden>
        <Header lines={3} className="mb-8" />
        <Stats count={3} />
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] surface p-5">
          <div className="min-w-0 flex-1">
            <Bar className="h-5 w-56" />
            <Bar className="mt-2 h-3.5 w-full max-w-2xl" />
          </div>
          <Bar className="h-4 w-20" />
        </div>
        <FilterBar chips={9} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-3xl surface">
              <div className="skeleton h-1.5 w-full rounded-none" />
              <div className="p-6">
                <Bar className="h-3 w-32 rounded-full" />
                <Bar className="mt-3 h-6 w-48" />
                <Bar className="mt-2 h-3.5 w-32" />
                <Bar className="mt-4 h-3.5 w-full" />
                <Bar className="mt-2 h-3.5 w-4/5" />
                <Bar className="mt-5 h-3 w-40 rounded-full" />
                <div className="mt-4 flex gap-2">
                  <Bar className="h-9 w-32 rounded-xl" />
                  <Bar className="h-9 w-36 rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stats({ count }: { count: number }) {
  return (
    <div className="mb-8 flex flex-wrap gap-x-8 gap-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Bar className="h-7 w-14" />
          <Bar className="mt-1.5 h-3 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function FilterBar({ chips }: { chips: number }) {
  return (
    <div className="mb-8 rounded-3xl surface p-4">
      <Bar className="h-[46px] w-full rounded-2xl" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {Array.from({ length: chips }).map((_, i) => (
          <Bar key={i} className={`h-[26px] rounded-full ${i < 2 ? "w-20" : "w-10"}`} />
        ))}
      </div>
    </div>
  );
}

// ─── Cours et guides ───────────────────────────────────────────────

/** /cours : en-tête, chiffres, recherche, unités repliées. */
export function CoursesHubSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 sm:py-12">
      <Status>Chargement du cours…</Status>
      <div aria-hidden>
        <Header lines={3} className="mb-8" />
        <Stats count={4} />
        <FilterBar chips={8} />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-3xl surface p-5 sm:p-6">
              <Bar className="h-12 w-12 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <Bar className="h-5 w-56 max-w-full" />
                <Bar className="mt-2 h-3.5 w-full max-w-lg" />
              </div>
              <Bar className="hidden h-3 w-24 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Une leçon : en-tête de leçon, blocs du corps (texte, tableau, exemples), sommaire. */
export function LessonSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Status>Chargement de la leçon…</Status>
      <div aria-hidden>
        <BackLink className="mb-8" />
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="mb-7 border-b border-border pb-8 sm:mb-10">
              <div className="mb-3 flex items-center gap-2.5">
                <Bar className="h-2.5 w-2.5 rounded-full" />
                <Bar className="h-3 w-40 rounded-full" />
                <Bar className="h-5 w-9 rounded-full" />
                <Bar className="h-3 w-12 rounded-full" />
              </div>
              <Bar className="h-10 w-3/4" />
              <Bar className="mt-2.5 h-6 w-52" />
              <Bar className="mt-4 h-4 w-full max-w-2xl" />
              <Bar className="mt-2 h-4 w-full sm:hidden" />
              <Bar className="mt-2 h-4 w-2/3 max-w-xl" />
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Bar className="h-[42px] w-44 rounded-xl" />
                <Bar className="h-[42px] w-52 rounded-xl" />
              </div>
            </div>

            {["100%", "96%", "88%"].map((w, i) => (
              <Bar key={i} className="mb-2.5 h-3.5" />
            ))}
            <Bar className="mb-8 h-3.5 w-3/5" />

            <Bar className="mb-3 h-5 w-56" />
            <div className="mb-8 overflow-hidden rounded-2xl surface">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="flex gap-8 border-b border-border/60 px-4 py-3 last:border-0">
                  <Bar className="h-3.5 w-24" />
                  <Bar className="h-3.5 w-20" />
                  <Bar className="h-3.5 w-32" />
                </div>
              ))}
            </div>

            <Bar className="mb-3 h-5 w-48" />
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl surface px-5 py-3.5">
                  <Bar className="h-5 w-64 max-w-full" />
                  <Bar className="mt-2 h-3.5 w-48" />
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <Bar className="mb-3 h-3 w-28 rounded-full" />
            <div className="space-y-2.5 border-l border-border pl-4">
              {["w-32", "w-40", "w-28", "w-36", "w-24"].map((w, i) => (
                <Bar key={i} className={`h-3 ${w}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** /guides : en-tête, puis la liste des guides l'un sous l'autre. */
export function GuidesHubSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
      <Status>Chargement des guides…</Status>
      <div aria-hidden>
        <Header titleWidth="w-full max-w-lg" className="mb-10" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[18px] surface p-6">
              <Bar className="h-5 w-3/4" />
              <Bar className="mt-3 h-3.5 w-full" />
              <Bar className="mt-2 h-3.5 w-4/5" />
              <Bar className="mt-4 h-4 w-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Un guide : titre sur deux lignes, chapô, « En bref », sections. */
export function GuideSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
      <Status>Chargement du guide…</Status>
      <div aria-hidden>
        <BackLink />
        <Bar className="h-11 w-full" />
        <Bar className="mt-2.5 h-11 w-2/3" />
        <Bar className="mt-5 h-5 w-full" />
        <Bar className="mt-2 h-5 w-4/5" />

        <div className="mt-8 rounded-[20px] border-l-[3px] border-l-accent surface p-6">
          <Bar className="h-3 w-16 rounded-full" />
          <Bar className="mt-3.5 h-4 w-full" />
          <Bar className="mt-2 h-4 w-11/12" />
          <Bar className="mt-2 h-4 w-3/5" />
        </div>

        <div className="mt-12 space-y-11">
          {[0, 1, 2].map((section) => (
            <div key={section}>
              <Bar className="mb-4 h-7 w-72 max-w-full" />
              {["100%", "97%", "93%", "64%"].map((w, i) => (
                <div key={i} className="skeleton mt-2.5 h-4 rounded-md" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tarifs ────────────────────────────────────────────────────────

/** /premium : un héros centré (titre, texte, prix, bouton), puis trois colonnes. */
export function PricingSkeleton() {
  // Les mêmes classes `slides` / `slide` que la page : sur grand écran chaque
  // section occupe la hauteur de l'écran et se centre verticalement — sans
  // elles, le héros du squelette s'affichait 150 px plus haut que le vrai.
  return (
    <div className="slides overflow-x-clip">
      <Status>Chargement des formules…</Status>
      <section aria-hidden className="slide relative">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-16 pt-20">
          <Bar className="h-11 w-[34rem] max-w-full sm:h-[52px]" />
          <Bar className="mt-3 h-11 w-80 max-w-full sm:h-[52px]" />
          {/* Sur téléphone, le titre passe sur trois lignes. */}
          <Bar className="mt-3 h-11 w-64 max-w-full sm:hidden" />
          {/* Cinq lignes de texte en 18 px interligne 29 : c'est la hauteur du
              chapô qui centre le héros, elle doit être la même. */}
          <div className="mt-[30px] flex w-full max-w-xl flex-col items-center gap-[13px]">
            {["w-full", "w-11/12", "w-full", "w-10/12", "w-1/2"].map((w, i) => (
              <Bar key={i} className={`h-4 ${w}`} />
            ))}
            <Bar className="h-4 w-full sm:hidden" />
            <Bar className="h-4 w-3/4 sm:hidden" />
          </div>
          <Bar className="mt-10 h-[52px] w-48" />
          <Bar className="mt-3 h-3 w-52 rounded-full" />
          <Bar className="mt-8 h-12 w-full max-w-xs rounded-[10px]" />
          <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2.5">
            {[0, 1, 2].map((i) => (
              <Bar key={i} className="h-3.5 w-32 rounded-full" />
            ))}
          </div>
        </div>
      </section>

      <section aria-hidden className="slide mx-auto max-w-6xl px-6 pb-24">
          <div className="mb-7 flex flex-col items-center sm:mb-10">
            <Bar className="h-3 w-24 rounded-full" />
            <Bar className="mt-3.5 h-9 w-96 max-w-full" />
            <Bar className="mt-4 h-4 w-full max-w-2xl" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[22px] surface p-7">
                <Bar className="h-6 w-48" />
                <Bar className="mt-4 h-3.5 w-full" />
                <Bar className="mt-2 h-3.5 w-11/12" />
                <Bar className="mt-2 h-3.5 w-3/4" />
                <Bar className="mt-6 h-24 w-full rounded-xl" />
                <Bar className="mt-4 h-16 w-full rounded-xl" />
              </div>
            ))}
          </div>
      </section>
    </div>
  );
}

// ─── Compte ────────────────────────────────────────────────────────

/** /seance : en-tête, barre de résumé, quatre étapes. */
export function DailySessionSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-12">
      <Status>Préparation de la séance…</Status>
      <div aria-hidden>
        <Header titleWidth="w-64" className="mb-6" />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[20px] surface p-5">
          <Bar className="h-4 w-40" />
          <Bar className="h-10 w-32 rounded-[10px]" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-[20px] border border-border p-5">
              <Bar className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Bar className="h-5 w-56 max-w-full" />
                <Bar className="mt-2.5 h-3.5 w-full" />
                <Bar className="mt-2 h-3.5 w-3/5" />
                <Bar className="mt-4 h-9 w-28 rounded-[10px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** /dashboard : l'ordre exact des cartes du tableau de bord. */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-12">
      <Status>Chargement du tableau de bord…</Status>
      <div aria-hidden>
        <div className="mb-7 sm:mb-10">
          <Bar className="mb-3.5 h-3 w-28 rounded-full" />
          <Bar className="h-10 w-64" />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-accent/35 bg-accent/10 p-6">
          <div className="min-w-0 flex-1">
            <Bar className="h-5 w-44" />
            <Bar className="mt-2.5 h-3.5 w-80 max-w-full" />
          </div>
          <Bar className="h-10 w-28 rounded-[10px]" />
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[20px] surface p-5">
              <Bar className="h-3 w-20 rounded-full" />
              <Bar className="mt-2.5 h-8 w-16" />
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[20px] surface p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <Bar className="h-4 w-36" />
              <Bar className="mt-2 h-3 w-64 max-w-full" />
            </div>
            <Bar className="h-9 w-12" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-2.5 flex items-center gap-3">
              <Bar className="h-3.5 w-24 shrink-0" />
              <Bar className="h-2.5 flex-1 rounded-full" />
              <Bar className="h-3 w-12 shrink-0" />
            </div>
          ))}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Bar key={i} className="h-[26px] w-36 rounded-full" />
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[20px] surface p-6">
          <Bar className="h-4 w-28" />
          <div className="mt-4 flex gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Bar key={i} className="h-10 flex-1 rounded-xl" />
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[20px] surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <Bar className="h-4 w-32" />
            <Bar className="h-3 w-24 rounded-full" />
          </div>
          <Bar className="mb-4 h-3 w-96 max-w-full" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mt-3 flex items-center gap-3">
              <Bar className="h-3.5 w-32 shrink-0" />
              <Bar className="h-2.5 flex-1 rounded-full" />
              <Bar className="h-3 w-10 shrink-0" />
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[20px] surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <Bar className="h-4 w-48" />
            <Bar className="h-3 w-16 rounded-full" />
          </div>
          <Bar className="h-2.5 w-full rounded-full" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[20px] surface p-5">
              <Bar className="h-5 w-28" />
              <Bar className="mt-2 h-3.5 w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** /level-test : historique des passations, puis la carte d'introduction. */
export function RetestSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <Status>Chargement du test…</Status>
      <div aria-hidden>
        <Bar className="mb-3.5 h-3 w-16 rounded-full" />
        <Bar className="mb-3 h-9 w-72 max-w-full" />
        <div className="mb-8 rounded-[20px] surface p-6">
          <Bar className="h-3 w-28 rounded-full" />
          <div className="mt-3 space-y-1.5">
            {[0, 1, 2].map((i) => (
              <Bar key={i} className="h-[42px] w-full rounded-[10px]" />
            ))}
          </div>
        </div>
        <TestIntroCard />
      </div>
    </div>
  );
}

/** /onboarding : la seule carte d'introduction du test de placement. */
export function PlacementSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <Status>Chargement du test…</Status>
      <div aria-hidden>
        <TestIntroCard bullets />
      </div>
    </div>
  );
}

function TestIntroCard({ bullets = false }: { bullets?: boolean }) {
  return (
    <div className="rounded-[20px] surface p-8">
      <Bar className="h-3 w-32 rounded-full" />
      <Bar className="mt-3.5 h-8 w-64 max-w-full" />
      <Bar className="mt-4 h-3.5 w-full" />
      <Bar className="mt-2 h-3.5 w-11/12" />
      <Bar className="mt-2 h-3.5 w-3/5" />
      {bullets && (
        <div className="mt-5 space-y-2.5">
          {["w-11/12", "w-full", "w-4/5"].map((w, i) => (
            <Bar key={i} className={`h-3.5 ${w}`} />
          ))}
        </div>
      )}
      <Bar className="mt-6 h-11 w-full rounded-[10px]" />
    </div>
  );
}

/** /account : titre, puis les cinq cartes de réglages. */
export function AccountSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 sm:py-12">
      <Status>Chargement du compte…</Status>
      <div aria-hidden>
        <Bar className="mb-3.5 h-3 w-24 rounded-full" />
        <Bar className="h-10 w-40" />
        <div className="mt-8 space-y-6">
          {[
            { lines: 2, field: true },
            { lines: 3, field: false },
            { lines: 1, field: true },
            { lines: 2, field: false },
            { lines: 2, field: false },
          ].map((card, i) => (
            <div key={i} className="rounded-[20px] surface p-6">
              <Bar className="h-5 w-40" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: card.lines }).map((_, j) => (
                  <Bar key={j} className={`h-3.5 ${j === card.lines - 1 ? "w-3/5" : "w-full"}`} />
                ))}
              </div>
              {card.field ? (
                <Bar className="mt-4 h-11 w-full max-w-sm rounded-[10px]" />
              ) : (
                <Bar className="mt-4 h-10 w-40 rounded-[10px]" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
