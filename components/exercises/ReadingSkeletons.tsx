/**
 * Les squelettes du module « Textes ».
 *
 * L'index et les textes avaient le même : un surtitre, un titre et cinq
 * barres dans une carte étroite — la forme d'un texte ouvert. Ouvrir l'index
 * montrait donc une page de lecture qui se transformait en grille de cartes.
 * Chacun a maintenant le sien, aux mesures de la page qu'il annonce.
 */

/** Une barre à la hauteur d'une ligne du bloc qui la contient. */
function Line({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`skeleton inline-block h-[0.7em] rounded-md align-middle ${className}`} />
  );
}

/** Les cartes de texte : niveau, titre, nombre de phrases, cas. */
export function ReadingCardsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl surface p-6">
          <div className="flex items-center gap-2">
            <span className="skeleton h-[22px] w-10 rounded-full" />
            <span className="font-display text-xs">
              <Line className="w-16" />
            </span>
          </div>
          <p className="mt-3 font-display text-2xl">
            <Line className={i % 2 ? "w-40" : "w-52"} />
          </p>
          <div className="mt-3 flex gap-3">
            {[0, 1, 2].map((j) => (
              <span key={j} className="font-display text-[11px]">
                <Line className="w-12" />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** L'index : en-tête, générateur, puis la bibliothèque. */
export function ReadingHubSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <p role="status" className="sr-only">
        Chargement des textes…
      </p>
      <div aria-hidden>
        <p className="mb-3.5 font-display text-xs">
          <Line className="w-28" />
        </p>
        <p className="mb-3 font-display text-3xl sm:text-4xl">
          <Line className="w-32" />
        </p>
        <p className="mb-8 max-w-2xl font-display leading-relaxed">
          <Line className="w-full" />
          <br />
          <Line className="w-2/3" />
        </p>

        <div className="mb-12 rounded-[20px] border border-dashed border-accent/30 bg-accent/5 p-6">
          {/* « Mon texte » / « Générer un texte ». */}
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3.5 rounded-[14px] border border-border p-4">
                <span className="skeleton h-10 w-10 shrink-0 rounded-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base">
                    <Line className="w-28" />
                  </span>
                  <span className="block font-display text-sm">
                    <Line className="w-56 max-w-full" />
                  </span>
                  {/* Sur un téléphone, la description passe sur deux lignes. */}
                  <span className="block font-display text-sm sm:hidden">
                    <Line className="w-24" />
                  </span>
                </span>
              </div>
            ))}
          </div>
          {/* « Mon texte », ouvert par défaut : titre, texte, état, bouton. */}
          <div className="space-y-2.5">
            <span className="skeleton block h-[42px] rounded-[10px]" />
            <span className="skeleton block h-[204px] rounded-[10px]" />
            <p className="font-display text-xs">
              <Line className="w-44" />
            </p>
            <div className="flex justify-end pt-1.5">
              <span className="skeleton h-[46px] w-[150px] rounded-[10px]" />
            </div>
          </div>
        </div>

        <p className="mb-3.5 font-display text-xs">
          <Line className="w-40" />
        </p>
        <ReadingCardsSkeleton cards={4} />
      </div>
    </div>
  );
}

/** Un texte ouvert : retour, titre, puis le lecteur des cas. */
export function ReadingTextSkeleton() {
  const widths = [
    ["w-16", "w-24", "w-20"],
    ["w-10", "w-20", "w-28", "w-14"],
    ["w-24", "w-16", "w-24", "w-20", "w-12"],
    ["w-20", "w-28", "w-10", "w-24"],
  ];
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-16">
      <p role="status" className="sr-only">
        Chargement du texte…
      </p>
      <div aria-hidden>
        <p className="mb-6 font-display text-xs">
          <Line className="w-24" />
        </p>
        <div className="mb-8 flex items-center gap-3">
          <span className="skeleton h-[22px] w-10 rounded-full" />
          <p className="font-display text-3xl sm:text-4xl">
            <Line className="w-56" />
          </p>
        </div>

        <div className="rounded-[20px] surface shadow-float">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-8">
            <span className="skeleton h-[34px] w-[258px] max-w-[60%] rounded-[10px]" />
            <span className="flex items-center gap-3">
              <span className="skeleton h-[26px] w-[118px] rounded-lg" />
              <span className="hidden font-display text-xs sm:inline">
                <Line className="w-20" />
              </span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 px-5 pt-4 sm:px-8">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="skeleton h-[26px] w-24 rounded-full" />
            ))}
          </div>
          <div className="space-y-5 px-5 py-6 font-display text-xl leading-[1.9] sm:px-8 sm:text-2xl">
            {widths.map((sentence, i) => (
              <p key={i} className="flex flex-wrap gap-x-2">
                {sentence.map((w, j) => (
                  <Line key={j} className={w} />
                ))}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
