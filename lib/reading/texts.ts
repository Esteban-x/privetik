import type { CaseId } from "@/lib/grammar/types";
import type { CefrLevel } from "@/lib/supabase/types";

/**
 * Pourquoi un mot est à ce cas, dans cette phrase.
 *
 * Deux origines, et l'écran les distingue : les textes de la bibliothèque
 * portent des explications ÉCRITES ET RELUES à la main (`reviewed`) ; les
 * textes générés les reçoivent à la demande, rédigées par l'IA (`ai`, voir
 * app/api/reading/explain) puis gardées dans le texte.
 */
export interface CaseWhy {
  /** Forme du dictionnaire : « шко́ла » pour « шко́ле », « я » pour « меня́ ». */
  lemma?: string;
  number?: "singular" | "plural";
  /**
   * Le mot de la phrase qui impose le cas (préposition, verbe, nombre…),
   * tel qu'il y est écrit. Absent quand c'est la FONCTION du mot qui décide :
   * sujet, complément d'objet direct, complément du nom, accord.
   */
  trigger?: string;
  /** Pourquoi ce cas, ici — une ou deux phrases de français. */
  reason: string;
  source: "reviewed" | "ai";
  /**
   * L'IA a lu un AUTRE cas que l'annotation : sa justification défend ce
   * cas-là. L'écran la présente comme un désaccord, jamais comme la règle.
   */
  disputed?: CaseId;
}

export interface GlossedWord {
  ru: string; // tel qu'affiché (avec ponctuation collée si besoin)
  gloss?: string; // traduction au survol/clic ; absent = ponctuation
  // Cas grammatical porté par ce mot (nom/adjectif/pronom décliné), absent
  // pour tout ce qui n'en marque pas (verbes, invariables, ponctuation) —
  // sert au surlignage couleur pendant la lecture (voir ReadingPassage),
  // en réutilisant la même palette que le module /cases (lib/grammar/cases.ts).
  case?: CaseId;
  /**
   * État de vérification du tag de cas (voir lib/reading/verify-cases.ts) :
   * "confirmed" = la forme est dans la banque et le cas est compatible,
   * "unverified" = le mot n'y est pas, l'analyse reste celle de l'IA.
   * Un tag CONTREDIT par la banque est retiré, il n'arrive jamais ici.
   */
  caseStatus?: "confirmed" | "unverified";
  /** Pourquoi ce cas — voir CaseWhy. */
  why?: CaseWhy;
  /**
   * La traduction de la PHRASE ENTIÈRE, portée par son premier mot.
   *
   * Sur le premier mot et non à côté de la phrase : `sentences` est un
   * tableau de tableaux de mots, stocké tel quel en base
   * (reading_texts.sentences), et lu à plusieurs endroits. Lui ajouter un
   * champ facultatif ne change la forme de rien ; l'envelopper dans un objet
   * aurait cassé tous les textes déjà enregistrés.
   */
  sentenceFr?: string;
}

/**
 * Une question de compréhension, en français, sur le SENS du texte.
 *
 * Le lecteur faisait tout travailler sauf la chose que lire sert à faire :
 * comprendre. On pouvait trouver tous les cas d'un texte sans avoir saisi
 * qui fait quoi. Écrites à la main pour la bibliothèque, vérifiées par
 * check:vocab.
 */
export interface ComprehensionQuestion {
  question: string;
  options: string[];
  answer: number;
  /** Où le texte le dit — montré après la réponse. */
  explain: string;
}

export interface ReadingText {
  id: string;
  title: string;
  level: CefrLevel;
  sentences: GlossedWord[][];
  /** Questions de compréhension — textes de la bibliothèque seulement. */
  questions?: ComprehensionQuestion[];
  /**
   * Bilan de la vérification des cas, présent sur les textes générés par
   * l'IA (voir lib/reading/verify-cases.ts). Affiché dans la légende pour
   * que l'apprenant sache ce qui a été contrôlé et ce qui ne l'a pas été.
   */
  caseCheck?: { confirmed: number; contradicted: number; unverified: number };
}

// ─── L'écriture des textes de la bibliothèque ──────────────────────
//
// Trois petites fonctions plutôt que des littéraux de vingt lignes par mot :
// un texte se RELIT, et c'est la relecture qui garantit qu'il n'enseigne rien
// de faux. Chaque mot décliné porte son cas ET la raison de ce cas, écrite à
// la main — `npm run check:vocab` refuse un mot décliné sans explication, et
// confronte chaque cas au dictionnaire de déclinaisons.

/** Un mot sans cas : verbe, adverbe, préposition, conjonction. */
function w(ru: string, gloss: string): GlossedWord {
  return { ru, gloss };
}

/** Un mot décliné, avec la raison de son cas. */
function d(
  ru: string,
  gloss: string,
  kase: CaseId,
  why: Omit<CaseWhy, "source">
): GlossedWord {
  return { ru, gloss, case: kase, why: { number: "singular", ...why, source: "reviewed" } };
}

/** Une phrase et sa traduction. */
function s(fr: string, ...words: GlossedWord[]): GlossedWord[] {
  const [first, ...rest] = words;
  return [{ ...first, sentenceFr: fr }, ...rest];
}

const LIBRARY: ReadingText[] = [
  {
    id: "moya-semya",
    title: "Моя семья",
    level: "A1",
    sentences: [
      s(
        "Je m'appelle Anna.",
        d("Меня", "moi", "accusative", {
          lemma: "я",
          trigger: "зовут",
          reason:
            "« Меня зовут » veut dire mot à mot « on m'appelle » : « меня » est le complément d'objet direct du verbe « звать », donc à l'accusatif.",
        }),
        w("зовут", "on appelle"),
        d("Анна.", "Anna", "nominative", {
          lemma: "Анна",
          trigger: "зовут",
          reason:
            "Après « меня зовут », le prénom reste au nominatif : c'est la forme du dictionnaire, celle qui nomme.",
        })
      ),
      s(
        "J'ai une famille.",
        w("У", "chez"),
        d("меня", "moi", "genitive", {
          lemma: "я",
          trigger: "У",
          reason:
            "Après « у », le génitif : « у меня есть » signifie « chez moi, il y a », c'est-à-dire « j'ai ». « Я » devient « меня ».",
        }),
        w("есть", "il y a"),
        d("семья.", "famille", "nominative", {
          lemma: "семья",
          reason:
            "Ce qu'on possède est le sujet de « есть » (« il y a une famille ») : il reste au nominatif.",
        })
      ),
      s(
        "Mon père travaille dans une école.",
        d("Мой", "mon", "nominative", {
          lemma: "мой",
          reason: "« Мой » s'accorde avec « отец », le sujet : masculin singulier, au nominatif.",
        }),
        d("отец", "père", "nominative", {
          lemma: "отец",
          reason: "« Отец » fait l'action de « работает » : c'est le sujet, au nominatif.",
        }),
        w("работает", "travaille"),
        w("в", "dans"),
        d("школе.", "école", "prepositional", {
          lemma: "школа",
          trigger: "в",
          reason:
            "Avec « в » et sans mouvement, le prépositionnel dit où l'on se trouve : il travaille dans l'école. Le -а du féminin devient -е.",
        })
      ),
      s(
        "Ma mère lit un livre chaque soir.",
        d("Моя", "ma", "nominative", {
          lemma: "мой",
          reason: "« Моя » s'accorde avec « мать », le sujet : féminin singulier, au nominatif.",
        }),
        d("мать", "mère", "nominative", {
          lemma: "мать",
          reason: "« Мать » fait l'action de « читает » : c'est le sujet, au nominatif.",
        }),
        w("читает", "lit"),
        d("книгу", "livre", "accusative", {
          lemma: "книга",
          trigger: "читает",
          reason:
            "« Книгу » est ce qu'elle lit : le complément d'objet direct se met à l'accusatif, et le féminin en -а y prend -у.",
        }),
        d("каждый", "chaque", "accusative", {
          lemma: "каждый",
          reason:
            "« Каждый » s'accorde avec « вечер » : masculin singulier, à l'accusatif — la même forme qu'au nominatif pour une chose.",
        }),
        d("вечер.", "soir", "accusative", {
          lemma: "вечер",
          reason:
            "« Каждый вечер » (chaque soir) dit une répétition sans préposition : l'accusatif de temps, identique au nominatif pour un masculin inanimé.",
        })
      ),
    ],
  },
  {
    id: "v-gorode",
    title: "В городе",
    level: "A2",
    sentences: [
      s(
        "Aujourd'hui, je vais au magasin.",
        w("Сегодня", "aujourd'hui"),
        d("я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « иду » : un pronom sujet est au nominatif.",
        }),
        w("иду", "je vais (à pied)"),
        w("в", "dans"),
        d("магазин.", "magasin", "accusative", {
          lemma: "магазин",
          trigger: "в",
          reason:
            "Avec un verbe de mouvement (« иду »), « в » est suivi de l'accusatif : il dit où l'on va. Pour un masculin inanimé, c'est la forme du nominatif.",
        })
      ),
      s(
        "Dans le magasin, il y a beaucoup de monde.",
        w("В", "dans"),
        d("магазине", "magasin", "prepositional", {
          lemma: "магазин",
          trigger: "В",
          reason:
            "Ici, pas de mouvement : « в » + prépositionnel dit où l'on se trouve. Le masculin prend -е.",
        }),
        w("много", "beaucoup"),
        d("людей.", "de gens", "genitive", {
          lemma: "люди",
          number: "plural",
          trigger: "много",
          reason:
            "Après « много » (beaucoup de), le nom se met au génitif pluriel. « Люди », pluriel irrégulier de « человек », y devient « людей ».",
        })
      ),
      s(
        "J'achète du pain et du lait.",
        d("Я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « покупаю » : c'est le sujet, au nominatif.",
        }),
        w("покупаю", "j'achète"),
        d("хлеб", "pain", "accusative", {
          lemma: "хлеб",
          trigger: "покупаю",
          reason:
            "« Хлеб » est ce que j'achète : complément d'objet direct, à l'accusatif — identique au nominatif pour un masculin inanimé.",
        }),
        w("и", "et"),
        d("молоко.", "lait", "accusative", {
          lemma: "молоко",
          trigger: "покупаю",
          reason:
            "Second complément d'objet direct de « покупаю » : accusatif. Un neutre y garde la forme du nominatif.",
        })
      ),
      s(
        "Ensuite, je rentre à la maison.",
        w("Потом", "ensuite"),
        d("я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « иду » : c'est le sujet, au nominatif.",
        }),
        w("иду", "je vais"),
        w("домой.", "à la maison")
      ),
    ],
  },
  {
    id: "pismo-drugu",
    title: "Письмо другу",
    level: "A2",
    sentences: [
      s(
        "J'écris une lettre à un ami.",
        d("Я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « пишу » : c'est le sujet, au nominatif.",
        }),
        w("пишу", "j'écris"),
        d("письмо", "lettre", "accusative", {
          lemma: "письмо",
          trigger: "пишу",
          reason:
            "« Письмо » est ce que j'écris : complément d'objet direct, à l'accusatif — la même forme qu'au nominatif pour un neutre.",
        }),
        d("другу.", "à un ami", "dative", {
          lemma: "друг",
          trigger: "пишу",
          reason:
            "« Другу » est le destinataire : à qui j'écris ? Celui à qui l'on écrit, donne ou dit quelque chose se met au datif ; le masculin prend -у.",
        })
      ),
      s(
        "Je lui parle de mon nouveau travail.",
        d("Я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « рассказываю » : c'est le sujet, au nominatif.",
        }),
        w("рассказываю", "je raconte"),
        d("ему", "à lui", "dative", {
          lemma: "он",
          trigger: "рассказываю",
          reason:
            "« Ему » est la personne à qui l'on raconte : le destinataire de « рассказывать » est au datif. « Он » y devient « ему ».",
        }),
        w("о", "de, à propos de"),
        d("новой", "nouveau", "prepositional", {
          lemma: "новый",
          trigger: "о",
          reason:
            "« Новой » s'accorde avec « работе » : féminin singulier, au prépositionnel, d'où la terminaison -ой.",
        }),
        d("работе.", "travail", "prepositional", {
          lemma: "работа",
          trigger: "о",
          reason:
            "Après « о » (à propos de), le prépositionnel : je parle de quoi ? Le féminin en -а prend -е.",
        })
      ),
      s(
        "Mon nouveau bureau me plaît.",
        d("Мне", "à moi", "dative", {
          lemma: "я",
          trigger: "нравится",
          reason:
            "Avec « нравиться » (plaire), la personne qui aime est au datif : mot à mot, « le bureau me plaît ». « Я » devient « мне ».",
        }),
        w("нравится", "plaît"),
        d("мой", "mon", "nominative", {
          lemma: "мой",
          reason: "« Мой » s'accorde avec « офис », le sujet de « нравится » : masculin singulier, au nominatif.",
        }),
        d("новый", "nouveau", "nominative", {
          lemma: "новый",
          reason: "« Новый » s'accorde lui aussi avec « офис » : masculin singulier, au nominatif.",
        }),
        d("офис.", "bureau", "nominative", {
          lemma: "офис",
          trigger: "нравится",
          reason:
            "Ce qui plaît est le SUJET de « нравится » : « офис » est au nominatif, même si le français en fait un complément (« j'aime mon bureau »).",
        })
      ),
      s(
        "Chaque matin, je vais au travail en bus.",
        d("Каждое", "chaque", "accusative", {
          lemma: "каждый",
          reason:
            "« Каждое » s'accorde avec « утро » : neutre singulier, à l'accusatif, la même forme qu'au nominatif.",
        }),
        d("утро", "matin", "accusative", {
          lemma: "утро",
          reason:
            "« Каждое утро » (chaque matin) dit une répétition sans préposition : accusatif de temps, identique au nominatif pour un neutre.",
        }),
        d("я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « еду » : c'est le sujet, au nominatif.",
        }),
        w("еду", "je vais (en véhicule)"),
        w("на", "à, sur"),
        d("работу", "travail", "accusative", {
          lemma: "работа",
          trigger: "на",
          reason:
            "Avec un verbe de mouvement (« еду »), « на » + accusatif dit où l'on va : au travail. Le féminin en -а prend -у.",
        }),
        w("на", "en, sur"),
        d("автобусе.", "bus", "prepositional", {
          lemma: "автобус",
          trigger: "на",
          reason:
            "« На » + prépositionnel désigne ici le moyen de transport : on voyage « sur » le bus. Le masculin prend -е.",
        })
      ),
      s(
        "Dans le bus, je pense à mes amis.",
        w("В", "dans"),
        d("автобусе", "bus", "prepositional", {
          lemma: "автобус",
          trigger: "В",
          reason:
            "Sans mouvement, « в » + prépositionnel dit où l'on se trouve : dans le bus. Le masculin prend -е.",
        }),
        d("я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « думаю » : c'est le sujet, au nominatif.",
        }),
        w("думаю", "je pense"),
        w("о", "à, à propos de"),
        d("друзьях.", "amis", "prepositional", {
          lemma: "друг",
          number: "plural",
          trigger: "о",
          reason:
            "Après « о », le prépositionnel ; au pluriel, sa terminaison est -ах. « Друг » a un pluriel irrégulier : « друзья », puis « о друзьях ».",
        })
      ),
    ],
  },
  {
    id: "na-dache",
    title: "На даче",
    level: "A2",
    sentences: [
      s(
        "L'été, nous vivons à la datcha, chez notre grand-mère.",
        w("Летом", "en été"),
        d("мы", "nous", "nominative", {
          lemma: "мы",
          reason: "« Мы » fait l'action de « живём » : c'est le sujet, au nominatif.",
        }),
        w("живём", "nous vivons"),
        w("на", "à, sur"),
        d("даче", "datcha", "prepositional", {
          lemma: "дача",
          trigger: "на",
          reason:
            "Sans mouvement (« живём »), « на » + prépositionnel dit où l'on est. La datcha se construit avec « на », comme la campagne ou le travail.",
        }),
        w("у", "chez"),
        d("бабушки.", "grand-mère", "genitive", {
          lemma: "бабушка",
          trigger: "у",
          reason:
            "Après « у » (chez), le génitif : chez qui ? Après к, г ou х, le -а du féminin devient -и, jamais -ы.",
        })
      ),
      s(
        "Grand-mère vit là-bas avec grand-père et un chien.",
        d("Бабушка", "grand-mère", "nominative", {
          lemma: "бабушка",
          reason: "« Бабушка » fait l'action de « живёт » : c'est le sujet, au nominatif.",
        }),
        w("живёт", "vit"),
        w("там", "là-bas"),
        w("с", "avec"),
        d("дедушкой", "grand-père", "instrumental", {
          lemma: "дедушка",
          trigger: "с",
          reason:
            "« С » au sens de « avec » est suivi de l'instrumental. « Дедушка » désigne un homme mais se décline comme un féminin en -а : « с дедушкой ».",
        }),
        w("и", "et"),
        d("собакой.", "chien", "instrumental", {
          lemma: "собака",
          trigger: "с",
          reason:
            "Toujours la suite de « с » (avec) : l'instrumental. Le féminin en -а y prend -ой.",
        })
      ),
      s(
        "Grand-père était médecin, et maintenant il travaille au potager.",
        d("Дедушка", "grand-père", "nominative", {
          lemma: "дедушка",
          reason: "« Дедушка » fait l'action de « был » : c'est le sujet, au nominatif.",
        }),
        w("был", "était"),
        d("врачом,", "médecin", "instrumental", {
          lemma: "врач",
          trigger: "был",
          reason:
            "Après « быть » au passé, le métier ou l'état se met à l'instrumental : « он был врачом », il était médecin.",
        }),
        w("а", "et, mais"),
        w("теперь", "maintenant"),
        d("он", "il", "nominative", {
          lemma: "он",
          reason: "« Он » fait l'action de « работает » : c'est le sujet, au nominatif.",
        }),
        w("работает", "travaille"),
        w("в", "dans"),
        d("огороде.", "potager", "prepositional", {
          lemma: "огород",
          trigger: "в",
          reason:
            "Sans mouvement, « в » + prépositionnel dit où l'on se trouve. Le masculin prend -е.",
        })
      ),
      s(
        "Le matin, je bois du thé sans sucre.",
        w("Утром", "le matin"),
        d("я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « пью » : c'est le sujet, au nominatif.",
        }),
        w("пью", "je bois"),
        d("чай", "thé", "accusative", {
          lemma: "чай",
          trigger: "пью",
          reason:
            "« Чай » est ce que je bois : complément d'objet direct, à l'accusatif — identique au nominatif pour un masculin inanimé.",
        }),
        w("без", "sans"),
        d("сахара.", "sucre", "genitive", {
          lemma: "сахар",
          trigger: "без",
          reason: "Après « без » (sans), le génitif : sans quoi ? Le masculin prend -а.",
        })
      ),
      s(
        "Nous n'avons pas internet, mais nous avons deux chats.",
        w("У", "chez"),
        d("нас", "nous", "genitive", {
          lemma: "мы",
          trigger: "У",
          reason:
            "Après « у », le génitif : « у нас » veut dire « chez nous », donc « nous avons ». « Мы » y devient « нас ».",
        }),
        w("нет", "il n'y a pas"),
        d("интернета,", "internet", "genitive", {
          lemma: "интернет",
          trigger: "нет",
          reason:
            "Pour dire qu'une chose manque, « нет » est suivi du génitif : « нет интернета », il n'y a pas d'internet. Le masculin prend -а.",
        }),
        w("но", "mais"),
        w("есть", "il y a"),
        w("две", "deux"),
        d("кошки.", "chats", "genitive", {
          lemma: "кошка",
          trigger: "две",
          reason:
            "Après « два », « две », « три » et « четыре », le nom se met au génitif SINGULIER. Après к, le -а devient -и.",
        })
      ),
    ],
  },
  {
    id: "v-universitete",
    title: "В университете",
    level: "B1",
    sentences: [
      s(
        "Ma sœur fait ses études à l'université, à Moscou.",
        d("Моя", "ma", "nominative", {
          lemma: "мой",
          reason: "« Моя » s'accorde avec « сестра », le sujet : féminin singulier, au nominatif.",
        }),
        d("сестра", "sœur", "nominative", {
          lemma: "сестра",
          reason: "« Сестра » fait l'action de « учится » : c'est le sujet, au nominatif.",
        }),
        w("учится", "fait ses études"),
        w("в", "à, dans"),
        d("университете", "université", "prepositional", {
          lemma: "университет",
          trigger: "в",
          reason:
            "Sans mouvement, « в » + prépositionnel dit où l'on se trouve. Le masculin prend -е.",
        }),
        w("в", "à"),
        d("Москве.", "Moscou", "prepositional", {
          lemma: "Москва",
          trigger: "в",
          reason:
            "« В » + prépositionnel pour la ville où l'on est : « Москва » devient « в Москве ».",
        })
      ),
      s(
        "Elle veut devenir professeure d'histoire.",
        d("Она", "elle", "nominative", {
          lemma: "она",
          reason: "« Она » fait l'action de « хочет » : c'est le sujet, au nominatif.",
        }),
        w("хочет", "veut"),
        w("стать", "devenir"),
        d("учительницей", "professeure", "instrumental", {
          lemma: "учительница",
          trigger: "стать",
          reason:
            "Après « стать » (devenir), ce que l'on devient se met à l'instrumental. Après ц, la terminaison non accentuée s'écrit -ей.",
        }),
        d("истории.", "d'histoire", "genitive", {
          lemma: "история",
          reason:
            "« Истории » complète le nom « учительница » : professeure de quoi ? Le complément du nom se met au génitif ; -ия devient -ии.",
        })
      ),
      s(
        "Chaque jour, elle lit de vieux livres à la bibliothèque.",
        d("Каждый", "chaque", "accusative", {
          lemma: "каждый",
          reason:
            "« Каждый » s'accorde avec « день » : masculin singulier, à l'accusatif, la même forme qu'au nominatif pour une chose.",
        }),
        d("день", "jour", "accusative", {
          lemma: "день",
          reason:
            "« Каждый день » (chaque jour) dit une répétition sans préposition : accusatif de temps, identique au nominatif pour un masculin inanimé.",
        }),
        d("она", "elle", "nominative", {
          lemma: "она",
          reason: "« Она » fait l'action de « читает » : c'est le sujet, au nominatif.",
        }),
        w("читает", "lit"),
        d("старые", "vieux", "accusative", {
          lemma: "старый",
          number: "plural",
          reason:
            "« Старые » s'accorde avec « книги » : pluriel, à l'accusatif — identique au nominatif pour des choses inanimées.",
        }),
        d("книги", "livres", "accusative", {
          lemma: "книга",
          number: "plural",
          trigger: "читает",
          reason:
            "« Книги » est ce qu'elle lit : complément d'objet direct, à l'accusatif pluriel. Pour des choses, il a la forme du nominatif pluriel.",
        }),
        w("в", "à, dans"),
        d("библиотеке.", "bibliothèque", "prepositional", {
          lemma: "библиотека",
          trigger: "в",
          reason:
            "Sans mouvement, « в » + prépositionnel dit où l'on se trouve. Le féminin en -а prend -е.",
        })
      ),
      s(
        "Hier, elle y a rencontré un professeur.",
        w("Вчера", "hier"),
        d("она", "elle", "nominative", {
          lemma: "она",
          reason: "« Она » fait l'action de « встретила » : c'est le sujet, au nominatif.",
        }),
        w("встретила", "a rencontré"),
        w("там", "là-bas"),
        d("профессора.", "professeur", "accusative", {
          lemma: "профессор",
          trigger: "встретила",
          reason:
            "« Профессора » est la personne rencontrée : complément d'objet direct. Pour un masculin ANIMÉ, l'accusatif prend la forme du génitif, en -а.",
        })
      ),
      s(
        "Il lui a donné un livre intéressant sur la guerre.",
        d("Он", "il", "nominative", {
          lemma: "он",
          reason: "« Он » fait l'action de « дал » : c'est le sujet, au nominatif.",
        }),
        w("дал", "a donné"),
        d("ей", "à elle", "dative", {
          lemma: "она",
          trigger: "дал",
          reason:
            "« Ей » est la personne à qui l'on donne : le destinataire de « дать » est au datif. « Она » y devient « ей ».",
        }),
        d("интересную", "intéressant", "accusative", {
          lemma: "интересный",
          reason:
            "« Интересную » s'accorde avec « книгу » : féminin singulier, à l'accusatif, terminaison -ую.",
        }),
        d("книгу", "livre", "accusative", {
          lemma: "книга",
          trigger: "дал",
          reason:
            "« Книгу » est ce qu'il a donné : complément d'objet direct, à l'accusatif ; le féminin en -а prend -у.",
        }),
        w("о", "sur, à propos de"),
        d("войне.", "guerre", "prepositional", {
          lemma: "война",
          trigger: "о",
          reason: "Après « о » (sur, à propos de), le prépositionnel : un livre sur quoi ? Le -а devient -е.",
        })
      ),
    ],
  },
  {
    id: "moya-kvartira",
    title: "Моя квартира",
    level: "A1",
    sentences: [
      s(
        "J'habite dans un grand appartement.",
        d("Я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « живу » : un pronom sujet est au nominatif.",
        }),
        w("живу", "j'habite"),
        w("в", "dans"),
        d("большой", "grand", "prepositional", {
          lemma: "большой",
          reason:
            "« Большой » s'accorde avec « квартире » : féminin singulier, au prépositionnel, terminaison -ой.",
        }),
        d("квартире.", "appartement", "prepositional", {
          lemma: "квартира",
          trigger: "в",
          reason:
            "Avec « в » et sans mouvement (« живу », j'habite), le prépositionnel dit où l'on est. Le -а du féminin devient -е.",
        })
      ),
      s(
        "Dans l'appartement, il y a trois pièces.",
        w("В", "dans"),
        d("квартире", "appartement", "prepositional", {
          lemma: "квартира",
          trigger: "В",
          reason: "« В » sans mouvement : le prépositionnel dit le lieu où se trouvent les pièces.",
        }),
        w("три", "trois"),
        d("комнаты.", "pièces", "genitive", {
          lemma: "комната",
          trigger: "три",
          reason:
            "Après « три » (trois), comme après deux et quatre, le nom se met au génitif singulier : « комната » devient « комнаты ».",
        })
      ),
      s(
        "Ma chambre est petite, mais claire.",
        d("Моя", "ma", "nominative", {
          lemma: "мой",
          reason: "« Моя » s'accorde avec « комната », le sujet : féminin singulier, au nominatif.",
        }),
        d("комната", "chambre", "nominative", {
          lemma: "комната",
          reason:
            "« Комната » est le sujet : c'est d'elle qu'on dit qu'elle est petite. Le sujet est au nominatif.",
        }),
        d("маленькая,", "petite", "nominative", {
          lemma: "маленький",
          reason:
            "Sans verbe « être » au présent, l'adjectif attribut reste au nominatif et s'accorde avec « комната », au féminin.",
        }),
        w("но", "mais"),
        d("светлая.", "claire", "nominative", {
          lemma: "светлый",
          reason: "Second attribut de « комната » : nominatif féminin singulier, comme « маленькая ».",
        })
      ),
      s(
        "Dans ma chambre, il y a une table et un lit.",
        w("В", "dans"),
        d("моей", "ma", "prepositional", {
          lemma: "мой",
          reason: "« Моей » s'accorde avec « комнате » : féminin singulier, au prépositionnel.",
        }),
        d("комнате", "chambre", "prepositional", {
          lemma: "комната",
          trigger: "В",
          reason:
            "« В » sans mouvement : le prépositionnel dit où se trouvent les meubles. Le -а du féminin devient -е.",
        }),
        w("есть", "il y a"),
        d("стол", "table", "nominative", {
          lemma: "стол",
          reason:
            "Ce qui se trouve dans la chambre est le sujet de « есть » (il y a) : il reste au nominatif.",
        }),
        w("и", "et"),
        d("кровать.", "lit", "nominative", {
          lemma: "кровать",
          reason: "Second sujet de « есть », relié à « стол » par « и » : au nominatif, comme lui.",
        })
      ),
      s(
        "Le soir, je lis dans ma chambre.",
        w("Вечером", "le soir"),
        d("я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « читаю » : c'est le sujet, au nominatif.",
        }),
        w("читаю", "je lis"),
        w("в", "dans"),
        d("своей", "ma (propre)", "prepositional", {
          lemma: "свой",
          reason:
            "« Своей » renvoie au sujet — ma propre chambre — et s'accorde avec « комнате » : féminin singulier, au prépositionnel.",
        }),
        d("комнате.", "chambre", "prepositional", {
          lemma: "комната",
          trigger: "в",
          reason: "Encore « в » sans mouvement : on lit dans la chambre, le prépositionnel dit le lieu.",
        })
      ),
      s(
        "J'aime beaucoup mon appartement.",
        d("Я", "je", "nominative", {
          lemma: "я",
          reason: "« Я » fait l'action de « люблю » : un pronom sujet est au nominatif.",
        }),
        w("очень", "beaucoup"),
        w("люблю", "j'aime"),
        d("свою", "mon (propre)", "accusative", {
          lemma: "свой",
          reason:
            "« Свою » renvoie au sujet et s'accorde avec « квартиру » : féminin singulier, à l'accusatif, terminaison -ую.",
        }),
        d("квартиру.", "appartement", "accusative", {
          lemma: "квартира",
          trigger: "люблю",
          reason:
            "« Квартиру » est ce que j'aime : complément d'objet direct, à l'accusatif ; le féminin en -а y prend -у.",
        })
      ),
    ],
  },
  {
    id: "na-vokzale",
    title: "На вокзале",
    level: "A2",
    sentences: [
      s(
        "Le train pour Moscou part à six heures.",
        d("Поезд", "train", "nominative", {
          lemma: "поезд",
          reason: "« Поезд » fait l'action de « уходит » (part) : c'est le sujet, au nominatif.",
        }),
        w("в", "pour, vers"),
        d("Москву", "Moscou", "accusative", {
          lemma: "Москва",
          trigger: "в",
          reason:
            "« В » + accusatif dit la destination, là où va le train. Le féminin en -а y prend -у.",
        }),
        w("уходит", "part"),
        w("в", "à"),
        w("шесть", "six"),
        d("часов.", "heures", "genitive", {
          lemma: "час",
          number: "plural",
          trigger: "шесть",
          reason: "À partir de cinq, le nom se met au génitif pluriel : « шесть часов », six heures.",
        })
      ),
      s(
        "Nous arrivons tôt à la gare.",
        d("Мы", "nous", "nominative", {
          lemma: "мы",
          reason: "« Мы » fait l'action de « приходим » : un pronom sujet est au nominatif.",
        }),
        w("рано", "tôt"),
        w("приходим", "nous arrivons"),
        w("на", "à"),
        d("вокзал.", "gare", "accusative", {
          lemma: "вокзал",
          trigger: "на",
          reason:
            "Avec un verbe de mouvement, « на » + accusatif dit où l'on arrive. Pour un masculin inanimé, c'est la forme du nominatif.",
        })
      ),
      s(
        "Mon frère achète deux billets.",
        d("Мой", "mon", "nominative", {
          lemma: "мой",
          reason: "« Мой » s'accorde avec « брат », le sujet : masculin singulier, au nominatif.",
        }),
        d("брат", "frère", "nominative", {
          lemma: "брат",
          reason: "« Брат » fait l'action de « покупает » : c'est le sujet, au nominatif.",
        }),
        w("покупает", "achète"),
        w("два", "deux"),
        d("билета.", "billets", "genitive", {
          lemma: "билет",
          trigger: "два",
          reason:
            "Après « два » (deux), le nom se met au génitif singulier : « билет » devient « билета », même pour deux billets.",
        })
      ),
      s(
        "Sur le quai, il y a beaucoup de voyageurs.",
        w("На", "sur"),
        d("платформе", "quai", "prepositional", {
          lemma: "платформа",
          trigger: "На",
          reason:
            "« На » sans mouvement : le prépositionnel dit où l'on se trouve. Le -а du féminin devient -е.",
        }),
        w("много", "beaucoup"),
        d("пассажиров.", "de voyageurs", "genitive", {
          lemma: "пассажир",
          number: "plural",
          trigger: "много",
          reason:
            "Après « много » (beaucoup de), le nom se met au génitif pluriel : « пассажир » devient « пассажиров ».",
        })
      ),
      s(
        "Nous montons dans le wagon et cherchons nos places.",
        d("Мы", "nous", "nominative", {
          lemma: "мы",
          reason: "« Мы » fait l'action des deux verbes, « садимся » et « ищем » : c'est le sujet, au nominatif.",
        }),
        w("садимся", "nous montons"),
        w("в", "dans"),
        d("вагон", "wagon", "accusative", {
          lemma: "вагон",
          trigger: "в",
          reason:
            "« Садиться в » est un mouvement vers l'intérieur : « в » + accusatif, identique au nominatif pour un masculin inanimé.",
        }),
        w("и", "et"),
        w("ищем", "nous cherchons"),
        d("свои", "nos (propres)", "accusative", {
          lemma: "свой",
          number: "plural",
          reason:
            "« Свои » renvoie au sujet — nos propres places — et s'accorde avec « места » : pluriel, à l'accusatif.",
        }),
        d("места.", "places", "accusative", {
          lemma: "место",
          number: "plural",
          trigger: "ищем",
          reason:
            "« Места » est ce que nous cherchons : complément d'objet direct, à l'accusatif pluriel, identique au nominatif pour un neutre inanimé.",
        })
      ),
      s(
        "Le voyage dure huit heures.",
        d("Поездка", "voyage", "nominative", {
          lemma: "поездка",
          reason: "« Поездка » est le sujet de « длится » (dure) : c'est d'elle qu'on parle, au nominatif.",
        }),
        w("длится", "dure"),
        w("восемь", "huit"),
        d("часов.", "heures", "genitive", {
          lemma: "час",
          number: "plural",
          trigger: "восемь",
          reason:
            "Après « восемь » (huit), comme après tout nombre à partir de cinq, le nom se met au génitif pluriel.",
        })
      ),
    ],
  },
];

/**
 * Les questions de compréhension de la bibliothèque, par texte. À part des
 * phrases pour qu'un texte se relise d'un bloc, et que ses questions se
 * relisent contre lui.
 */
const QUESTIONS: Record<string, ComprehensionQuestion[]> = {
  "moya-semya": [
    {
      question: "Comment s'appelle la personne qui parle ?",
      options: ["Anna", "Maria", "Olga"],
      answer: 0,
      explain: "« Меня зовут Анна » : je m'appelle Anna.",
    },
    {
      question: "Où travaille son père ?",
      options: ["Dans un magasin", "Dans une école", "À l'hôpital"],
      answer: 1,
      explain: "« Мой отец работает в школе » : mon père travaille dans une école.",
    },
    {
      question: "Que fait sa mère chaque soir ?",
      options: ["Elle écrit une lettre", "Elle va au magasin", "Elle lit un livre"],
      answer: 2,
      explain: "« Моя мать читает книгу каждый вечер » : ma mère lit un livre chaque soir.",
    },
  ],
  "v-gorode": [
    {
      question: "Où va la personne aujourd'hui ?",
      options: ["À la maison", "Au magasin", "À l'école"],
      answer: 1,
      explain: "« Сегодня я иду в магазин » : aujourd'hui, je vais au magasin.",
    },
    {
      question: "Qu'est-ce qu'elle achète ?",
      options: ["Du pain et du lait", "Du thé et du sucre", "Un livre"],
      answer: 0,
      explain: "« Я покупаю хлеб и молоко » : j'achète du pain et du lait.",
    },
    {
      question: "Comment est le magasin ?",
      options: ["Vide", "Fermé", "Plein de monde"],
      answer: 2,
      explain: "« В магазине много людей » : dans le magasin, il y a beaucoup de monde.",
    },
  ],
  "pismo-drugu": [
    {
      question: "À qui la personne écrit-elle ?",
      options: ["À un ami", "À sa mère", "À un professeur"],
      answer: 0,
      explain: "« Я пишу письмо другу » : j'écris une lettre à un ami.",
    },
    {
      question: "Comment va-t-elle au travail ?",
      options: ["À pied", "En bus", "En métro"],
      answer: 1,
      explain: "« Каждое утро я еду на работу на автобусе » : chaque matin, je vais au travail en bus.",
    },
    {
      question: "À quoi pense-t-elle dans le bus ?",
      options: ["À son travail", "À son bureau", "À ses amis"],
      answer: 2,
      explain: "« В автобусе я думаю о друзьях » : dans le bus, je pense à mes amis.",
    },
  ],
  "na-dache": [
    {
      question: "Quel était le métier du grand-père ?",
      options: ["Professeur", "Médecin", "Jardinier"],
      answer: 1,
      explain: "« Дедушка был врачом » : il était médecin — aujourd'hui, il travaille au potager.",
    },
    {
      question: "Qu'est-ce qui manque à la datcha ?",
      options: ["Internet", "Le thé", "Les chats"],
      answer: 0,
      explain: "« У нас нет интернета, но есть две кошки » : pas d'internet, mais deux chats.",
    },
    {
      question: "Comment la personne boit-elle son thé le matin ?",
      options: ["Avec du lait", "Avec du sucre", "Sans sucre"],
      answer: 2,
      explain: "« Утром я пью чай без сахара » : le matin, je bois du thé sans sucre.",
    },
  ],
  "v-universitete": [
    {
      question: "Dans quelle ville la sœur fait-elle ses études ?",
      options: ["À Moscou", "À Saint-Pétersbourg", "À Kazan"],
      answer: 0,
      explain: "« Моя сестра учится в университете в Москве » : à l'université, à Moscou.",
    },
    {
      question: "Quel métier veut-elle exercer ?",
      options: ["Médecin", "Professeure d'histoire", "Bibliothécaire"],
      answer: 1,
      explain: "« Она хочет стать учительницей истории » : elle veut devenir professeure d'histoire.",
    },
    {
      question: "Qu'est-ce que le professeur lui a donné ?",
      options: ["Une lettre", "Un vieux dictionnaire", "Un livre sur la guerre"],
      answer: 2,
      explain: "« Он дал ей интересную книгу о войне » : un livre intéressant sur la guerre.",
    },
  ],
  "moya-kvartira": [
    {
      question: "Combien de pièces y a-t-il dans l'appartement ?",
      options: ["Deux", "Trois", "Cinq"],
      answer: 1,
      explain: "« В квартире три комнаты » : trois pièces.",
    },
    {
      question: "Comment est la chambre ?",
      options: ["Grande et sombre", "Petite et sombre", "Petite, mais claire"],
      answer: 2,
      explain: "« Моя комната маленькая, но светлая » : petite, mais claire.",
    },
    {
      question: "Qu'y a-t-il dans la chambre ?",
      options: ["Une table et un lit", "Une télévision", "Deux lits"],
      answer: 0,
      explain: "« В моей комнате есть стол и кровать » : une table et un lit.",
    },
    {
      question: "Que fait la personne le soir ?",
      options: ["Elle regarde la télévision", "Elle lit dans sa chambre", "Elle sort avec des amis"],
      answer: 1,
      explain: "« Вечером я читаю в своей комнате » : le soir, je lis dans ma chambre.",
    },
  ],
  "na-vokzale": [
    {
      question: "À quelle heure part le train ?",
      options: ["À huit heures", "À six heures", "À deux heures"],
      answer: 1,
      explain: "« Поезд в Москву уходит в шесть часов » : à six heures.",
    },
    {
      question: "Qui achète les billets ?",
      options: ["Le frère", "La personne qui parle", "Un voyageur"],
      answer: 0,
      explain: "« Мой брат покупает два билета » : c'est le frère.",
    },
    {
      question: "Combien de temps dure le voyage ?",
      options: ["Six heures", "Deux heures", "Huit heures"],
      answer: 2,
      explain: "« Поездка длится восемь часов » : huit heures — le train part à six heures.",
    },
  ],
};

export const READING_TEXTS: ReadingText[] = LIBRARY.map((text) => ({
  ...text,
  questions: QUESTIONS[text.id],
}));

export function getReadingText(id: string) {
  return READING_TEXTS.find((t) => t.id === id);
}
