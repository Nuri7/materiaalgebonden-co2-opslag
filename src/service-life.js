/**
 * Service-life reference for the 35-year eligibility gate.
 *
 * THE PROBLEM THIS ADDRESSES
 * --------------------------
 * The determination method excludes any product with a Reference Service Life under 35 years.
 * Measured across 194 EN15804+A2 timber and biobased datasets on two open nodes: **zero** declare
 * a service life. Two manufacturers state outright that they will not — PAVATEX
 * (EPD-PAV-20250684-IBC1-DE §2.12): "wird keine Referenz-Nutzungsdauer deklariert … Die
 * durchschnittliche Nutzungsdauer liegt in der Größenordnung des Gebäudes." So the gate that
 * decides whether a row counts cannot be satisfied from EPD data at all.
 *
 * WHY A TABLE HELPS, AND WHAT IT IS NOT
 * -------------------------------------
 * Service life is a property of the ELEMENT, not of the material. The same untreated softwood is
 * 30 years as facade cladding, 10 years as a fence, and ≥ 50 years in a load-bearing wall. No
 * material-keyed lookup can express that, which is exactly why an EPD cannot carry it.
 *
 * This table therefore PROPOSES a value for an element; it never decides. A row using it must
 * carry the reference number, and the result is flagged `rsl_from_reference_table` so a reviewer
 * sees immediately that the lifespan was asserted from guidance rather than declared by the
 * manufacturer. That is the honest position: better than a silent default, weaker than a
 * declaration.
 *
 * SOURCE
 * ------
 * BBSR, "Nutzungsdauern von Bauteilen für Lebenszyklusanalysen nach BNB", Stand 13.03.2026,
 * published by the Bundesinstitut für Bau-, Stadt- und Raumforschung — the same federal body
 * behind ÖKOBAUDAT. Roughly 1,600 entries; the selection below is the subset relevant to biobased
 * construction, each carrying its BBSR reference number so any single value can be checked or
 * withdrawn. Values are figures from a public federal guidance document, cited per value; the
 * table itself is not reproduced.
 *
 * Note it is a German table applied to a Dutch method. Where a Dutch source (an NMD product card,
 * a client's own maintenance policy) gives a different figure, that one wins — record it as
 * `user_asserted` with its own source.
 */

const SRC = 'BBSR Nutzungsdauern von Bauteilen, Stand 13-03-2026'

/**
 * `min: true` means the source states "≥ N years" rather than exactly N.
 * @type {Record<string, {years:number, min?:boolean, label:string, labelNl:string, source:string}>}
 */
export const SERVICE_LIFE = {
  // --- load-bearing timber structure: comfortably over the gate ---------------
  '331.113.25': { years: 50, min: true, label: 'Holzwand: Blockbau, Fachwerk, Holztafelbau, Massivholz', labelNl: 'Houten buitenwand: massief, HSB of stapelbouw', source: SRC },
  '332.113.25': { years: 50, min: true, label: 'Holzwand (nichttragende Außenwand)', labelNl: 'Houten buitenwand, niet-dragend', source: SRC },
  '333.113.25': { years: 50, min: true, label: 'Holzstütze: Vollholz oder Brettschichtholz', labelNl: 'Houten kolom: massief of gelamineerd', source: SRC },
  '342.113.25': { years: 50, min: true, label: 'Holzwand (Innenwand)', labelNl: 'Houten binnenwand', source: SRC },
  '343.113.25': { years: 50, min: true, label: 'Holzstütze (innen)', labelNl: 'Houten kolom, binnen', source: SRC },
  '351.114.25': { years: 50, min: true, label: 'Holzdecken: Massivholzdecke, Holzbalkendecke, Holz-Fertigteilelemente', labelNl: 'Houten vloer: massief, balklaag of prefab element', source: SRC },
  '361.112.25': { years: 50, min: true, label: 'Geneigtes Dach in Holzbauweise: Sparrendach, Massivholzdach', labelNl: 'Hellend dak in houtbouw', source: SRC },
  '361.114.25': { years: 50, min: true, label: 'Flaches Dach in Holzbauweise: Holzbalkendecke, Massivholzdach', labelNl: 'Plat dak in houtbouw', source: SRC },
  '361.115.25': { years: 50, min: true, label: 'Ingenieurmäßige Holzdachkonstruktion: Fachwerkträger', labelNl: 'Ingenieursmatige houten dakconstructie', source: SRC },

  // --- straw and fibre: the agro case, and it passes -------------------------
  '331.115.25': { years: 50, min: true, label: 'Strohballenbau', labelNl: 'Strobouw (dragende strobalen)', source: SRC },
  '363.311.25': { years: 50, min: true, label: 'Unterdach: Bitumen-Holzfaserplatten', labelNl: 'Onderdak: bitumen-houtvezelplaat', source: SRC },
  '363.312.25': { years: 40, label: 'Unterdach: Imprägnierte Faserplatten aus Holz, Hanf, Zellulose', labelNl: 'Onderdak: geïmpregneerde vezelplaat van hout, hennep of cellulose', source: SRC },

  // --- insulation in the building envelope ----------------------------------
  '353.115.25': { years: 50, min: true, label: 'Fussbodendämmung, einschl. oberste Geschossdecke', labelNl: 'Vloerisolatie, incl. bovenste verdiepingsvloer', source: SRC },
  '354.117.25': { years: 50, min: true, label: 'Dämmung der Kellerdecke', labelNl: 'Kelderplafondisolatie', source: SRC },
  '361.312.25': { years: 50, min: true, label: 'Geneigtes Dach: Zwischensparrendämmung', labelNl: 'Hellend dak: isolatie tussen de sparren', source: SRC },
  '363.226.25': { years: 50, min: true, label: 'Geneigtes Dach: Aufdachdämmung', labelNl: 'Hellend dak: isolatie boven de sparren', source: SRC },

  // --- boards and floors: where the gate starts to bite ----------------------
  '353.112.25': { years: 50, min: true, label: 'Trockenestriche: Holzwerkstoffplatten, Gipsplatten', labelNl: 'Droge dekvloer: houtplaat of gipsplaat', source: SRC },
  '345.311.25': { years: 50, min: true, label: 'Bekleidungen innen: Holz, Holzwerkstoff', labelNl: 'Binnenbekleding: hout of plaatmateriaal', source: SRC },
  '353.141.25': { years: 50, min: true, label: 'Vollholzparkett, Holzdielen, Holzpflaster', labelNl: 'Massief parket, houten vloerdelen', source: SRC },
  '353.143.25': { years: 50, min: true, label: 'Holz-Mehrschichtparkett > 3,5 mm', labelNl: 'Meerlaags parket, toplaag > 3,5 mm', source: SRC },
  '353.142.25': { years: 45, label: 'Holz-Mehrschichtparkett < 3,5 mm', labelNl: 'Meerlaags parket, toplaag < 3,5 mm', source: SRC },
  '353.138.25': { years: 40, label: 'Gewerblich: massive Nadelholz-Fußbodendielen', labelNl: 'Massieve naaldhouten vloerdelen, utiliteit', source: SRC },
  '353.139.25': { years: 25, label: 'Furnierboden', labelNl: 'Fineervloer', source: SRC },

  // --- exposed timber: where it fails ---------------------------------------
  '335.711.25': { years: 50, min: true, label: 'Fassade: Nadelholz behandelt', labelNl: 'Gevelbekleding: naaldhout, behandeld', source: SRC },
  '335.712.25': { years: 50, min: true, label: 'Fassade: Holz unbehandelt, Fachregel FR01 Zimmererhandwerk', labelNl: 'Gevelbekleding: onbehandeld hout volgens vakregel FR01', source: SRC },
  '335.714.25': { years: 50, min: true, label: 'Fassade: Holzschindeln', labelNl: 'Gevelbekleding: houten shingles', source: SRC },
  '335.713.25': { years: 30, label: 'Fassade: Nadelholz unbehandelt', labelNl: 'Gevelbekleding: naaldhout, onbehandeld', source: SRC },
  '339.115.25': { years: 35, label: 'Brüstung: Holz', labelNl: 'Borstwering: hout', source: SRC },
  '339.113.25': { years: 45, label: 'Frei stehende Konstruktion: Nadelholz behandelt', labelNl: 'Vrijstaande constructie: naaldhout, behandeld', source: SRC },
  '361.212.25': { years: 35, label: 'Eingangsüberdachung: Holzkonstruktion bewittert', labelNl: 'Entree-overkapping: houtconstructie, weersbelast', source: SRC },
  '369.213.25': { years: 35, label: 'Laubholz unbehandelt, Nadelholz behandelt', labelNl: 'Loofhout onbehandeld, naaldhout behandeld', source: SRC },
  '369.214.25': { years: 25, label: 'Nadelholz unbehandelt', labelNl: 'Naaldhout, onbehandeld', source: SRC },

  // --- outdoor works: almost all of it fails the gate ------------------------
  '534.316.25': { years: 25, label: 'Zaun: Laubholz unbehandelt', labelNl: 'Erfafscheiding: loofhout, onbehandeld', source: SRC },
  '534.318.25': { years: 10, label: 'Zaun: Nadelholz unbehandelt', labelNl: 'Erfafscheiding: naaldhout, onbehandeld', source: SRC },
  '543.214.25': { years: 10, label: 'Palisaden: Nadelholz unbehandelt', labelNl: 'Palissade: naaldhout, onbehandeld', source: SRC },
  '531.121.25': { years: 20, label: 'Holzpflaster (Außenanlage)', labelNl: 'Houten bestrating, buitenruimte', source: SRC },
}

/**
 * Look up a proposed service life. Returns null for an unknown reference — never a guess.
 * @param {string} ref BBSR reference number, e.g. '351.114.25'
 */
export function lookupServiceLife(ref) {
  const e = SERVICE_LIFE[ref]
  if (!e) return null
  return { ref, ...e }
}

/**
 * Would this element pass the gate? Returns the verdict plus the reasoning, so the caller can
 * show a user why a row is about to be excluded before they commit to it.
 * @param {string} ref
 * @param {number} [minYears=35]
 */
export function checkGate(ref, minYears = 35) {
  const e = lookupServiceLife(ref)
  if (!e) return { known: false, passes: null, reason: 'unknown_reference' }
  return {
    known: true,
    passes: e.years >= minYears,
    years: e.years,
    isMinimum: !!e.min,
    reason: e.years >= minYears ? 'meets_minimum' : 'below_minimum',
    label: e.labelNl,
    source: e.source,
    ref,
  }
}

/** Every element in the table that fails the 35-year gate — useful as a warning list. */
export function failingElements(minYears = 35) {
  return Object.entries(SERVICE_LIFE)
    .filter(([, e]) => e.years < minYears)
    .map(([ref, e]) => ({ ref, years: e.years, label: e.labelNl }))
    .sort((a, b) => a.years - b.years)
}
