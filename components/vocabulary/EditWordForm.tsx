"use client";

import { useId, useState } from "react";
import type { CustomVocabWord, WordInput } from "@/lib/vocabulary/custom";
import DictateButton from "@/components/vocabulary/DictateButton";
import { FIELD_MAX, TRANSLIT_MAX } from "@/lib/vocabulary/limits";

/** Ce que devient un enregistrement, vu du formulaire — même partage qu'à l'ajout. */
export type EditOutcome =
  | { status: "saved" }
  | { status: "duplicate"; message: string }
  | { status: "failed"; message: string };

/**
 * Modifier un mot déjà rangé.
 *
 * POURQUOI PAS AddWordForm EN MODE ÉDITION. Le formulaire d'ajout est bâti
 * pour CHERCHER un mot : complétion, traduction proposée pendant la frappe,
 * « vouliez-vous dire ». Sur un mot qu'on corrige, tout cela travaille
 * contre soi — la suggestion réécrirait la traduction qu'on vient de retoucher.
 * Ici on part de ce qui est enregistré, et rien ne change sans qu'on l'écrive.
 *
 * LA PRONONCIATION SUIT LE RUSSE, SAUF SI ON L'A ÉCRITE. Tant que le champ n'a
 * pas été touché, corriger le russe la fait recalculer par le serveur — sinon
 * le mot corrigé garderait la lecture de l'ancien. Écrite à la main, elle est
 * gardée telle quelle.
 */
export default function EditWordForm({
  word,
  onSave,
  onCancel,
}: {
  word: CustomVocabWord;
  onSave: (input: Partial<WordInput>) => Promise<EditOutcome>;
  onCancel: () => void;
}) {
  const [ru, setRu] = useState(word.ru);
  const [fr, setFr] = useState(word.fr);
  const [translit, setTranslit] = useState(word.transliteration ?? "");
  const [translitTouched, setTranslitTouched] = useState(false);
  const [exampleRu, setExampleRu] = useState(word.exampleRu ?? "");
  const [exampleFr, setExampleFr] = useState(word.exampleFr ?? "");
  const hadExample = Boolean(word.exampleRu || word.exampleFr);
  const [showExample, setShowExample] = useState(hadExample);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ruChanged = ru.trim() !== word.ru;
  // Le russe a changé et la prononciation n'a pas été écrite : elle sera
  // recalculée. L'afficher encore serait montrer celle de l'ancien mot.
  const translitShown = translitTouched || !ruChanged ? translit : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !ru.trim() || !fr.trim()) return;
    setSaving(true);
    setError(null);

    const input: Partial<WordInput> = { ru: ru.trim(), fr: fr.trim() };
    if (translitTouched) input.transliteration = translit.trim();
    else if (ruChanged) input.transliteration = "";
    if (showExample || hadExample) {
      input.exampleRu = exampleRu.trim();
      input.exampleFr = exampleFr.trim();
    }

    const outcome = await onSave(input);
    setSaving(false);
    if (outcome.status !== "saved") setError(outcome.message);
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="field-focus-within overflow-hidden rounded-2xl border border-border bg-bg transition-shadow duration-200">
        <Field
          label="Russe"
          lang="ru-RU"
          value={ru}
          onChange={setRu}
          dictateLabel="Dicter le mot en russe"
          placeholder="кни́га"
        />
        <div className="h-px bg-border" />
        <Field
          label="Français"
          lang="fr-FR"
          value={fr}
          onChange={setFr}
          dictateLabel="Dicter la traduction"
          placeholder="livre"
        />
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wide text-muted">
          Translittération
        </span>
        <input
          value={translitShown}
          onChange={(e) => {
            setTranslitTouched(true);
            setTranslit(e.target.value);
          }}
          placeholder={ruChanged ? "Recalculée à l'enregistrement" : "spassiba"}
          autoComplete="off"
          maxLength={TRANSLIT_MAX}
          className="w-full rounded-xl surface px-3.5 py-2.5 font-display text-sm text-text placeholder:text-muted/50 field-focus focus:outline-none"
        />
      </label>

      {showExample ? (
        <div className="mt-4 space-y-2">
          <span className="block font-display text-xs font-semibold uppercase tracking-wide text-muted">
            Exemple
          </span>
          <input
            value={exampleRu}
            onChange={(e) => setExampleRu(e.target.value)}
            placeholder="Я чита́ю кни́гу."
            aria-label="Exemple en russe"
            lang="ru"
            autoComplete="off"
            maxLength={300}
            className="w-full rounded-xl surface px-3.5 py-2.5 font-display text-sm text-text placeholder:text-muted/50 field-focus focus:outline-none"
          />
          <input
            value={exampleFr}
            onChange={(e) => setExampleFr(e.target.value)}
            placeholder="Je lis un livre."
            aria-label="Traduction de l'exemple"
            autoComplete="off"
            maxLength={300}
            className="w-full rounded-xl surface px-3.5 py-2.5 font-display text-sm text-text placeholder:text-muted/50 field-focus focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowExample(true)}
          className="mt-3 self-start font-display text-xs font-semibold text-muted underline-offset-2 hover:text-accent-ink hover:underline"
        >
          + Phrase d&apos;exemple
        </button>
      )}

      {error && (
        <p role="alert" className="mt-4 font-display text-sm text-danger">
          {error}
        </p>
      )}

      <p className="mt-4 font-display text-xs leading-relaxed text-muted">
        L&apos;historique de révision et le rangement du mot sont conservés.
      </p>

      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border px-4 py-2.5 font-display text-sm font-semibold text-muted transition-colors hover:border-muted hover:text-text"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving || !ru.trim() || !fr.trim()}
          aria-busy={saving}
          className="btn btn-primary btn-sheen rounded-xl px-5 py-2.5 font-display text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  lang,
  value,
  onChange,
  dictateLabel,
  placeholder,
}: {
  label: string;
  /** « ru-RU » ou « fr-FR » : la dictée écoute cette langue. */
  lang: string;
  value: string;
  onChange: (value: string) => void;
  dictateLabel: string;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="font-display text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {label}
        </label>
        <DictateButton lang={lang} label={dictateLabel} onResult={onChange} />
      </div>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        lang={lang.slice(0, 2)}
        autoComplete="off"
        spellCheck={false}
        maxLength={FIELD_MAX}
        className="w-full bg-transparent font-display text-xl font-semibold text-text placeholder:text-muted/40 focus:outline-none"
      />
    </div>
  );
}
