"use client";

import { useEffect, useState } from "react";
import AiReadingGenerator from "./AiReadingGenerator";
import MyReadingTexts from "./MyReadingTexts";
import SectionLabel from "@/components/ui/SectionLabel";
import { ReadingCardsSkeleton } from "@/components/exercises/ReadingSkeletons";
import {
  deleteMyReadingText,
  fetchMyReadingTexts,
  type SavedReadingTextSummary,
} from "@/lib/reading/client";

export default function ReadingGeneratorSection() {
  const [texts, setTexts] = useState<SavedReadingTextSummary[] | null>(null);
  // UN ÉCHEC N'EST PAS « AUCUN TEXTE ». La section disparaissait purement et
  // simplement quand la liste ne chargeait pas : les textes générés — donc
  // payés — semblaient perdus.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    fetchMyReadingTexts()
      .then((d) => setTexts(d.texts))
      .catch(() => setFailed(true));
  }, [attempt]);

  // Un nouveau texte vient d'être généré (et sauvegardé côté serveur) :
  // recharge la liste plutôt que de reconstruire l'entrée à la main ici
  // (le serveur est la seule source des champs affichés, ex. le nombre de
  // phrases réellement enregistrées).
  function handleGenerated() {
    fetchMyReadingTexts()
      .then((d) => setTexts(d.texts))
      .catch(() => {});
  }

  async function handleDelete(id: string) {
    const previous = texts;
    setDeleteError(false);
    setTexts((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    try {
      await deleteMyReadingText(id);
    } catch {
      // La carte revient : le texte est toujours en base, et il réapparaissait
      // au chargement suivant sans que rien n'ait dit l'échec.
      setTexts(previous);
      setDeleteError(true);
    }
  }

  return (
    <>
      <div className="mb-12">
        <AiReadingGenerator onGenerated={handleGenerated} />
      </div>

      {texts === null ? (
        <div className="mb-12">
          <SectionLabel color="accent2">Mes textes</SectionLabel>
          {failed ? (
            <p role="alert" className="font-display text-sm text-danger">
              Impossible de charger tes textes.{" "}
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
                className="font-semibold underline underline-offset-2"
              >
                Réessayer
              </button>
            </p>
          ) : (
            <ReadingCardsSkeleton />
          )}
        </div>
      ) : texts.length > 0 ? (
        <div className="mb-12">
          <SectionLabel color="accent2">Mes textes</SectionLabel>
          {deleteError && (
            <p role="alert" className="mb-3 font-display text-sm text-danger">
              La suppression a échoué. Réessaie.
            </p>
          )}
          <MyReadingTexts texts={texts} onDelete={handleDelete} />
        </div>
      ) : null}
    </>
  );
}
