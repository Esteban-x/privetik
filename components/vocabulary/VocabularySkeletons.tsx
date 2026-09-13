/**
 * Les squelettes du module vocabulaire, calqués sur les écrans qu'ils
 * annoncent.
 *
 * POURQUOI PAS PageSkeleton. Le squelette générique « hub » dessinait un
 * en-tête et six tuiles d'exercice ; ce qui arrivait ensuite était un rail
 * de listes à gauche et des cartes de mots à droite. L'œil se posait sur une
 * grille qui disparaissait aussitôt, et l'écran sautait deux fois — au
 * squelette, puis au contenu. Les modes de révision héritaient du même
 * squelette de catalogue, faute d'avoir le leur.
 *
 * CHAQUE BLOC REPREND LES CLASSES DE MISE EN PAGE DU COMPOSANT RÉEL :
 * rembourrages, marges, tailles de police. Les barres de texte sont posées
 * DANS un bloc qui porte la vraie taille de police (`Line`), si bien qu'elles
 * héritent de sa hauteur de ligne — c'est ce qui fait que rien ne bouge quand
 * le contenu remplace le squelette.
 */

/** Une barre à la hauteur d'une ligne de texte du bloc qui la contient. */
function Line({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`skeleton inline-block h-[0.7em] rounded-md align-middle ${className}`} />
  );
}

/** Le rail des listes (voir ListRail) : « Réviser », « Nouvelle liste », puis une ligne par liste. */
export function ListRailSkeleton({ rows = 4 }: { rows?: number }) {
  const widths = ["w-24", "w-32", "w-20", "w-28", "w-24"];
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent/5 px-4 py-3.5">
        <span className="skeleton h-3.5 w-3.5 shrink-0 rounded-full" />
        <span className="min-w-0">
          <span className="block font-display text-sm">
            <Line className="w-16" />
          </span>
          <span className="block font-display text-xs">
            <Line className="w-24" />
          </span>
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3">
        <span className="h-10 w-10 shrink-0 rounded-xl border border-border" />
        <span className="font-display text-sm">
          <Line className="w-24" />
        </span>
      </div>

      <div className="space-y-1.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5">
            <span className="skeleton h-10 w-10 shrink-0 rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm">
                <Line className={widths[i % widths.length]} />
              </span>
              <span className="block font-display text-xs">
                <Line className="w-16" />
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** La barre d'outils d'une liste : recherche, puis Ajouter, Réviser et « ⋯ ». */
export function WordToolbarSkeleton() {
  return (
    <div
      aria-hidden
      className="mb-4 flex flex-col gap-1.5 rounded-2xl surface px-2.5 py-2 sm:flex-row sm:items-center sm:gap-2 sm:px-3 sm:py-2.5"
    >
      <div className="skeleton h-[38px] min-w-0 flex-1 rounded-xl sm:h-[42px]" />
      <div className="flex shrink-0 items-center justify-end gap-2">
        <div className="mr-auto h-8 w-8 sm:h-9 sm:w-9 lg:hidden" />
        <div className="skeleton h-8 w-[84px] rounded-xl sm:h-9 sm:w-[92px]" />
        <div className="skeleton h-8 w-12 rounded-xl sm:h-9 lg:w-[104px]" />
        <div className="skeleton h-8 w-8 rounded-xl sm:h-9 sm:w-9" />
      </div>
    </div>
  );
}

/** Les cartes de mots (voir WordCard), aux mêmes hauteurs de ligne. */
export function WordRowsSkeleton({ rows = 6 }: { rows?: number }) {
  const widths: [string, string][] = [
    ["w-24", "w-28"],
    ["w-32", "w-20"],
    ["w-20", "w-36"],
    ["w-28", "w-24"],
    ["w-36", "w-28"],
    ["w-24", "w-32"],
  ];
  return (
    <div aria-hidden className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => {
        const [ru, fr] = widths[i % widths.length];
        return (
          <div key={i} className="rounded-2xl border border-border bg-bg2 px-4 py-3">
            <span className="mb-1.5 hidden font-display text-[11px] sm:block">
              <Line className="w-24" />
            </span>
            <div className="flex items-start gap-3 sm:items-center sm:gap-4">
              <div className="grid min-w-0 flex-1 grid-cols-1 items-baseline gap-x-6 gap-y-0.5 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="font-display text-lg leading-snug">
                    <Line className={ru} />
                  </p>
                  <p className="font-display text-xs leading-snug">
                    <Line className="w-16" />
                  </p>
                </div>
                <p className="font-display text-lg leading-snug">
                  <Line className={fr} />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="skeleton h-8 w-8 rounded-lg lg:w-[92px]" />
                <span className="skeleton h-8 w-11 rounded-lg" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * L'écran /vocabulary entier, pour `loading.tsx`.
 *
 * SOUS 1024 PX, LE RAIL SEUL : c'est le premier des deux écrans successifs,
 * celui sur lequel on arrive sans `?list=`. Au-delà, rail et mots côte à
 * côte, comme la page.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-4">
      <p role="status" className="sr-only">
        Chargement de tes listes…
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside>
          <p aria-hidden className="mb-4 font-display text-2xl font-extrabold tracking-tight lg:hidden">
            Vocabulaire
          </p>
          <ListRailSkeleton />
        </aside>
        <section className="hidden min-w-0 lg:block">
          <WordToolbarSkeleton />
          <WordRowsSkeleton />
        </section>
      </div>
    </div>
  );
}

export type ReviewModeName = "flashcards" | "typing" | "qcm" | "voice";

/** Une pastille « Russe » / « Français » (voir PronunciationRow). */
function PronunciationPill() {
  return (
    <div className="mt-5 flex justify-center">
      <span className="skeleton h-[38px] w-[96px] rounded-full" />
    </div>
  );
}

/**
 * Une session de révision, mode par mode.
 *
 * Sert trois fois : au `loading.tsx` de la route, au repli du Suspense de la
 * page, et pendant le chargement des mots. C'étaient trois écrans différents
 * — le catalogue, une page blanche, puis une carte seule sans son en-tête —
 * pour une attente d'une demi-seconde.
 */
export function ReviewSessionSkeleton({ mode }: { mode: ReviewModeName }) {
  const withCounter = mode !== "flashcards";
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
      <p role="status" className="sr-only">
        Chargement de la révision…
      </p>

      <div aria-hidden className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-xs">
          <Line className="w-24" />
        </span>
        <span className="skeleton h-[38px] w-[150px] rounded-[10px]" />
      </div>

      {withCounter ? (
        <div aria-hidden className={`${mode === "voice" ? "mb-4" : "mb-6"} flex items-center justify-between`}>
          <span className="font-display text-xs">
            <Line className="w-28" />
          </span>
          <span className="font-display text-xs">
            <Line className="w-14" />
          </span>
        </div>
      ) : (
        <p aria-hidden className="mb-4 text-center font-display text-xs">
          <Line className="w-32" />
        </p>
      )}

      <div aria-hidden className="mb-4 flex justify-center">
        <span className="skeleton h-[30px] w-[264px] max-w-full rounded-full" />
      </div>

      {mode === "flashcards" ? (
        <div aria-hidden>
          <div className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-[20px] surface px-6 shadow-float">
            <span className="font-display text-4xl">
              <Line className="w-40" />
            </span>
            <span className="mt-3 font-display text-sm">
              <Line className="w-24" />
            </span>
            <span className="mt-8 font-display text-xs">
              <Line className="w-28" />
            </span>
          </div>
          <PronunciationPill />
        </div>
      ) : (
        <div
          aria-hidden
          className={`rounded-[20px] surface text-center shadow-float ${mode === "voice" ? "p-6 sm:p-8" : "p-8"}`}
        >
          <p className="font-display text-sm">
            <Line className="w-56 max-w-full" />
          </p>
          <p className="mt-2 font-display text-3xl">
            <Line className={mode === "voice" ? "w-6" : "w-40"} />
          </p>

          {mode === "typing" && (
            <>
              <div className="skeleton mt-6 h-[58px] w-full rounded-[10px]" />
              <PronunciationPill />
              <div className="skeleton mt-6 h-12 w-full rounded-xl" />
              <div className="mt-2.5 h-[42px] w-full rounded-[10px] border border-border" />
            </>
          )}

          {mode === "qcm" && (
            <>
              <div className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-[54px] rounded-[10px]" />
                ))}
              </div>
              <PronunciationPill />
            </>
          )}

          {mode === "voice" && (
            <>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-2.5">
                <span className="skeleton h-[42px] rounded-full" />
                <span className="skeleton h-[42px] rounded-full" />
              </div>
              <p className="mt-3 font-display text-xs">
                <Line className="w-32" />
              </p>
              <div className="skeleton mt-6 h-11 w-full rounded-[10px]" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** /vocabulary/review : en-tête, objectif du jour, puis les quatre modes. */
export function ReviewHubSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-16">
      <p role="status" className="sr-only">
        Chargement de la révision…
      </p>
      <div aria-hidden>
        <p className="mb-8 font-display text-xs">
          <Line className="w-20" />
        </p>
        <p className="mb-3.5 font-display text-xs">
          <Line className="w-14" />
        </p>
        <p className="mb-3 font-display text-3xl sm:text-4xl">
          <Line className="w-40" />
        </p>
        <p className="mb-8 font-display leading-relaxed">
          <Line className="w-96 max-w-full" />
        </p>

        <div className="mb-7 rounded-2xl surface p-6 sm:mb-10">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-sm">
              <Line className="w-28" />
            </span>
            <span className="font-display text-sm">
              <Line className="w-12" />
            </span>
          </div>
          <div className="skeleton h-2.5 w-full rounded-full" />
          <div className="mt-4 flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="skeleton h-6 w-10 rounded-full" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-2xl surface p-5">
              <span className="skeleton h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-base">
                  <Line className="w-20" />
                </p>
                <p className="mt-0.5 font-display text-sm leading-snug">
                  <Line className="w-full" />
                  <br />
                  <Line className="w-2/3" />
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
