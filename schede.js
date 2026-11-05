'use strict';

/* =========================================================
   Schede: descrizione, come dati, di ciò che si può tenere sotto controllo.
   Ogni "scheda" (sezione) ha dei campi; i campi con `dl` diventano la scadenza
   collegata (data / importo / ripetizione). Nessuna dipendenza dall'app.
   ========================================================= */
(function (root) {
  /* ---------- date ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  function addMonths(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(y, m - 1 + n, 1, 12);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(d, last));
    return toISO(t);
  }
  const eom = (iso) => { const d = fromISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };
  const MONTHS = { none: 0, monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12, biennial: 24 };
  const monthsOf = (f) => MONTHS[f] || 0;

  /* ---------- calcoli automatici ---------- */
  // Revisione auto/moto (art. 80 Codice della Strada): la prima dopo 4 anni dalla prima
  // immatricolazione, poi ogni 2 anni; scade a fine mese.
  function nextRevisione(v, ident, today) {
    if (v && v.ultima) return eom(addMonths(v.ultima, 24));
    if (ident && ident.immatricolazione) {
      const first = eom(addMonths(ident.immatricolazione, 48));
      return first >= today ? first : null;   // se è già passata senza ultima revisione nota: non indovino
    }
    return null;
  }
  // IMU: acconto 16 giugno, saldo 16 dicembre.
  function nextImu(today) {
    const y = Number(today.slice(0, 4));
    return [`${y}-06-16`, `${y}-12-16`, `${y + 1}-06-16`].find((d) => d >= today);
  }
  function computeAuto(f, vals, ident, today) {
    const a = f.auto;
    if (!a) return null;
    if (a.fn === 'revisione') return nextRevisione(vals, ident, today);
    if (a.fn === 'imu') return nextImu(today);
    if (a.fn === 'next') return vals[a.from] && monthsOf(vals.freq) ? addMonths(vals[a.from], monthsOf(vals.freq)) : null;
    return null;
  }
  // Fine di un finanziamento/mutuo: data della prossima rata + (rate rimaste - 1) mesi.
  const untilFor = (firstDate, residue) => (firstDate && residue > 0 ? addMonths(firstDate, residue - 1) : null);

  /* ---------- opzioni ricorrenti ---------- */
  const FREQ_BILL = [['monthly', 'Ogni mese'], ['bimonthly', 'Ogni 2 mesi'], ['quarterly', 'Ogni 3 mesi']];
  const FREQ_YEAR = [['yearly', 'Una volta l\'anno'], ['semiannual', 'Ogni 6 mesi']];
  const FREQ_REP = [['semiannual', 'Ogni 6 mesi'], ['yearly', 'Ogni anno'], ['biennial', 'Ogni 2 anni']];
  const FREQ_REP_NONE = [['none', 'Una volta sola'], ...FREQ_REP];

  /* ---------- campi ---------- */
  const txt = (k, l, ph, x) => ({ k, l, t: 'text', ph, ...x });
  const dat = (k, l, x) => ({ k, l, t: 'date', ...x });
  const num = (k, l, x) => ({ k, l, t: 'number', ...x });
  const costo = (l = 'Costo (€)', x) => ({ k: 'costo', l, t: 'money', dl: 'amount', half: true, ...x });
  const sel = (k, l, opts, x) => ({ k, l, t: 'select', opts, ...x });

  // Scheda tipo "bolletta": fornitore, numero cliente, prossima bolletta, importo, ogni quanto.
  const bill = (title, icon, kind, def, extra = {}) => ({
    title, icon, kind, rec: def,
    fields: [
      txt('fornitore', 'Fornitore', 'es. Enel, Hera, Fastweb'),
      txt('cliente', 'N. cliente o contratto'),
      dat('prossima', 'Prossima bolletta', { dl: 'date', half: true }),
      { k: 'importo', l: 'Importo tipico (€)', t: 'money', dl: 'amount', half: true },
      sel('freq', 'Ogni quanto arriva?', FREQ_BILL, { dl: 'rec', def }),
    ],
    ...extra,
  });
  const assicurazione = (title) => ({
    title, icon: 'shield', kind: 'assicurazione', rec: 'yearly',
    fields: [
      txt('compagnia', 'Compagnia', 'es. Generali, UnipolSai'),
      txt('polizza', 'N. polizza'),
      dat('dal', 'Valida dal', { half: true }),
      dat('scadenza', 'Scade il', { dl: 'date', half: true }),
      costo('Costo (€)', { hint: 'Quanto paghi ogni volta' }),
      sel('freq', 'Come paghi?', FREQ_YEAR, { dl: 'rec', def: 'yearly' }),
    ],
  });
  const doc = (title, kind, extraFields = []) => ({
    title, icon: 'idcard', kind, rec: 'none',
    fields: [
      txt('numero', 'Numero del documento'),
      ...extraFields,
      dat('scadenza', 'Scade il', { dl: 'date', half: true }),
      costo('Costo del rinnovo (€)', { hint: 'Se lo sai' }),
    ],
    intro: 'Quando lo rinnovi, aggiorna la data di scadenza qui.',
  });
  const ricorrente = (title, icon, kind, nameField, nextLabel, def = 'yearly', x = {}) => ({
    title, icon, kind, rec: def,
    fields: [
      nameField,
      dat('ultima', 'Ultima volta', { half: true }),
      sel('freq', 'Ogni quanto?', FREQ_REP_NONE, { dl: 'rec', def, half: true }),
      dat('prossima', nextLabel, { dl: 'date', auto: { fn: 'next', from: 'ultima' }, hint: 'La calcolo io, ma puoi cambiarla' }),
      costo('Costo previsto (€)'),
    ],
    last: 'ultima',
    ...x,
  });

  /* ---------- schede ---------- */
  const SECTIONS = {
    /* ===== mezzi ===== */
    assicurazione: assicurazione('Assicurazione'),
    bollo: {
      title: 'Bollo', icon: 'receipt', kind: 'bollo', rec: 'yearly',
      gate: { k: 'dovuto', off: 'no', offLabel: 'Esente / non dovuto' },
      intro: 'Scadenza e importo li vedi sul sito dell\'ACI (servizio “Bollo auto”), basta la targa.',
      fields: [
        sel('dovuto', 'Il bollo è dovuto?', [['si', 'Sì, lo pago'], ['no', 'No, esente']], { def: 'si' }),
        dat('scadenza', 'Prossima scadenza', { dl: 'date', half: true }),
        { k: 'importo', l: 'Importo (€)', t: 'money', dl: 'amount', half: true },
      ],
    },
    revisione: {
      title: 'Revisione', icon: 'clipcheck', kind: 'revisione', rec: 'biennial', eom: true, last: 'ultima',
      intro: 'La prossima la calcolo io: 4 anni dopo la prima immatricolazione, poi ogni 2 anni, a fine mese. Controlla sempre sul libretto.',
      fields: [
        dat('ultima', 'Ultima revisione fatta il'),
        dat('prossima', 'Prossima revisione entro il', { dl: 'date', auto: { fn: 'revisione', deps: ['ultima'] }, hint: 'La calcolo io, ma puoi cambiarla' }),
        costo('Costo previsto (€)'),
        txt('officina', 'Officina', 'es. Autofficina Rossi', { half: true }),
      ],
    },
    tagliando: {
      title: 'Tagliando', icon: 'gauge', kind: 'tagliando', rec: 'yearly', last: 'ultimo',
      fields: [
        dat('ultimo', 'Ultimo tagliando', { half: true }),
        num('km_ultimo', 'Km a quel momento', { half: true }),
        sel('freq', 'Ogni quanto?', FREQ_REP, { dl: 'rec', def: 'yearly' }),
        dat('prossimo', 'Prossimo tagliando entro il', { dl: 'date', auto: { fn: 'next', from: 'ultimo' }, hint: 'La calcolo io, ma puoi cambiarla' }),
        num('km_prossimo', 'Oppure ai km (facoltativo)', { half: true }),
        costo('Costo previsto (€)'),
        txt('officina', 'Officina'),
      ],
    },
    gomme: {
      title: 'Gomme', icon: 'tyre', kind: 'gomme', rec: 'semiannual', last: 'ultimo_cambio',
      fields: [
        sel('montate', 'Che gomme hai montate?', [['estive', 'Estive'], ['invernali', 'Invernali'], ['4s', 'Quattro stagioni']]),
        txt('misura', 'Misura', 'es. 195/55 R16'),
        dat('ultimo_cambio', 'Ultimo cambio', { half: true }),
        sel('freq', 'Le cambi?', [['semiannual', 'Due volte l\'anno'], ['yearly', 'Una volta l\'anno'], ['none', 'Non le cambio']], { dl: 'rec', def: 'semiannual', half: true }),
        dat('prossimo', 'Prossimo cambio', { dl: 'date', auto: { fn: 'next', from: 'ultimo_cambio' }, hint: 'La calcolo io, ma puoi cambiarla' }),
        costo('Costo previsto (€)'),
      ],
    },
    finanziamento: {
      title: 'Finanziamento', icon: 'wallet', kind: 'finanziamento', rec: 'monthly', untilFrom: 'residue',
      intro: 'Compila solo se il mezzo è pagato a rate.',
      fields: [
        txt('finanziaria', 'Finanziaria', 'es. Findomestic'),
        txt('contratto', 'N. contratto'),
        { k: 'rata', l: 'Rata mensile (€)', t: 'money', dl: 'amount', half: true },
        dat('prossima', 'Prossima rata', { dl: 'date', half: true }),
        num('residue', 'Rate ancora da pagare', { hint: 'Alla fine delle rate il promemoria si ferma da solo' }),
        { k: 'riscatto', l: 'Maxi-rata o riscatto finale (€)', t: 'money' },
      ],
    },

    /* ===== casa ===== */
    affitto: {
      title: 'Affitto', icon: 'key', kind: 'affitto', rec: 'monthly',
      fields: [
        txt('locatore', 'Proprietario o agenzia'),
        { k: 'canone', l: 'Canone mensile (€)', t: 'money', dl: 'amount', half: true },
        dat('prossima', 'Prossimo pagamento', { dl: 'date', half: true }),
        { k: 'deposito', l: 'Deposito cauzionale (€)', t: 'money' },
      ],
    },
    contratto: {
      title: 'Contratto', icon: 'file', kind: 'contratto', rec: 'none',
      fields: [
        txt('tipo', 'Tipo di contratto', 'es. 4+4, 3+2'),
        dat('inizio', 'Inizio', { half: true }),
        dat('fine', 'Scade il', { dl: 'date', half: true }),
        num('preavviso', 'Preavviso per la disdetta (mesi)'),
      ],
      intro: 'Ti avviso prima della scadenza del contratto, così non resti senza tempo per disdire o rinnovare.',
    },
    registro: {
      title: 'Imposta di registro', icon: 'file', kind: 'registro', rec: 'yearly',
      gate: { k: 'dovuta', off: 'no', offLabel: 'Non dovuta' },
      intro: 'Non si paga se il proprietario ha scelto la cedolare secca o se la versa lui.',
      fields: [
        sel('dovuta', 'La paghi tu?', [['si', 'Sì'], ['no', 'No']], { def: 'si' }),
        dat('prossima', 'Prossimo pagamento', { dl: 'date', half: true }),
        { k: 'importo', l: 'Importo (€)', t: 'money', dl: 'amount', half: true },
      ],
    },
    mutuo: {
      title: 'Mutuo', icon: 'landmark', kind: 'mutuo', rec: 'monthly', untilFrom: 'residue',
      fields: [
        txt('banca', 'Banca'),
        { k: 'rata', l: 'Rata mensile (€)', t: 'money', dl: 'amount', half: true },
        dat('prossima', 'Prossima rata', { dl: 'date', half: true }),
        num('residue', 'Rate ancora da pagare', { hint: 'Alla fine delle rate il promemoria si ferma da solo' }),
        sel('tasso', 'Tasso', [['fisso', 'Fisso'], ['variabile', 'Variabile']]),
      ],
    },
    imu: {
      title: 'IMU', icon: 'landmark', kind: 'imu', rec: 'semiannual',
      gate: { k: 'dovuta', off: 'no', offLabel: 'Non dovuta' },
      intro: 'Si paga il 16 giugno (acconto) e il 16 dicembre (saldo). L\'abitazione principale di solito è esente.',
      fields: [
        sel('dovuta', 'La devi pagare?', [['si', 'Sì (es. seconda casa)'], ['no', 'No (abitazione principale)']], { def: 'si' }),
        dat('prossima', 'Prossima scadenza', { dl: 'date', auto: { fn: 'imu', deps: [] }, half: true }),
        { k: 'importo', l: 'Importo rata (€)', t: 'money', dl: 'amount', half: true },
      ],
    },
    condominio: {
      title: 'Condominio', icon: 'building', kind: 'condominio', rec: 'monthly',
      fields: [
        txt('amministratore', 'Amministratore'),
        { k: 'importo', l: 'Importo rata (€)', t: 'money', dl: 'amount', half: true },
        dat('prossima', 'Prossima rata', { dl: 'date', half: true }),
        sel('freq', 'Ogni quanto?', [['monthly', 'Ogni mese'], ['bimonthly', 'Ogni 2 mesi'], ['quarterly', 'Ogni 3 mesi'], ['semiannual', 'Ogni 6 mesi']], { dl: 'rec', def: 'monthly' }),
      ],
    },
    luce: bill('Luce', 'zap', 'luce', 'bimonthly'),
    gas: bill('Gas', 'flame', 'gas', 'bimonthly'),
    acqua: bill('Acqua', 'droplet', 'acqua', 'quarterly'),
    internet: bill('Internet', 'wifi', 'internet', 'monthly', { fornitoreHint: true }),
    rifiuti: {
      title: 'Rifiuti (TARI)', icon: 'bin', kind: 'rifiuti', rec: 'semiannual',
      intro: 'Date e rate le decide il tuo Comune: le trovi sull\'avviso.',
      fields: [
        dat('prossima', 'Prossima rata', { dl: 'date', half: true }),
        { k: 'importo', l: 'Importo rata (€)', t: 'money', dl: 'amount', half: true },
        sel('freq', 'Quante rate?', [['yearly', 'Una l\'anno'], ['semiannual', 'Due l\'anno'], ['quarterly', 'Quattro l\'anno']], { dl: 'rec', def: 'semiannual' }),
      ],
    },
    assicurazione_casa: assicurazione('Assicurazione casa'),
    caldaia: ricorrente('Caldaia', 'thermo', 'caldaia', txt('ditta', 'Ditta che fa la manutenzione'), 'Prossimo controllo', 'yearly', {
      intro: 'Ogni quanto va fatto il controllo dipende dall\'impianto e dalla Regione: guarda il libretto della caldaia.',
      fields: [
        txt('ditta', 'Ditta che fa la manutenzione'),
        dat('ultima', 'Ultimo controllo', { half: true }),
        sel('freq', 'Ogni quanto?', [['yearly', 'Ogni anno'], ['biennial', 'Ogni 2 anni']], { dl: 'rec', def: 'yearly', half: true }),
        dat('prossima', 'Prossimo controllo', { dl: 'date', auto: { fn: 'next', from: 'ultima' }, hint: 'La calcolo io, ma puoi cambiarla' }),
        costo('Costo previsto (€)'),
      ],
    }),

    /* ===== persone: documenti ===== */
    identita: doc('Carta d\'identità', 'identita'),
    patente: doc('Patente', 'patente', [txt('categoria', 'Categoria', 'es. B')]),
    passaporto: doc('Passaporto', 'passaporto'),
    tessera: doc('Tessera sanitaria', 'tessera'),

    /* ===== salute ===== */
    visita: ricorrente('Visita o controllo', 'heart', 'salute', txt('cosa', 'Che visita?', 'es. Cardiologo, dentista'), 'Prossima visita', 'yearly'),
    esami: ricorrente('Esami e analisi', 'heart', 'esami', txt('cosa', 'Quali esami?', 'es. Esami del sangue'), 'Prossimi esami', 'yearly'),
    vaccino: {
      title: 'Vaccino / richiamo', icon: 'syringe', kind: 'vaccino', rec: 'none',
      fields: [
        txt('quale', 'Quale vaccino?', 'es. Antinfluenzale'),
        dat('prossima', 'Prossimo richiamo', { dl: 'date', half: true }),
        sel('freq', 'Si ripete?', FREQ_REP_NONE, { dl: 'rec', def: 'none', half: true }),
      ],
    },
    farmaci: {
      title: 'Farmaci e ricette', icon: 'pill', kind: 'farmaci', rec: 'none',
      intro: 'Per non restare senza: segna quando finisce la scorta o scade la ricetta.',
      fields: [
        txt('farmaco', 'Quale farmaco?'),
        dat('finisce', 'La scorta finisce il', { dl: 'date', half: true }),
        costo('Costo (€)'),
        dat('ricetta', 'Ricetta valida fino al'),
      ],
    },

    /* ===== animali ===== */
    vaccino_animale: ricorrente('Vaccino', 'syringe', 'vaccino', txt('quale', 'Quale vaccino?'), 'Prossimo richiamo', 'yearly'),
    antiparassitario: ricorrente('Antiparassitario', 'paw', 'antiparassitario', txt('prodotto', 'Prodotto', 'es. collare, pipetta'), 'Prossimo trattamento', 'quarterly', {
      fields: [
        txt('prodotto', 'Prodotto', 'es. collare, pipetta'),
        dat('ultima', 'Ultimo trattamento', { half: true }),
        sel('freq', 'Ogni quanto?', [['monthly', 'Ogni mese'], ['quarterly', 'Ogni 3 mesi'], ['semiannual', 'Ogni 6 mesi']], { dl: 'rec', def: 'quarterly', half: true }),
        dat('prossima', 'Prossimo trattamento', { dl: 'date', auto: { fn: 'next', from: 'ultima' }, hint: 'La calcolo io, ma puoi cambiarla' }),
        costo('Costo (€)'),
      ],
    }),
    visita_vet: ricorrente('Visita veterinaria', 'paw', 'animali', txt('veterinario', 'Veterinario'), 'Prossima visita', 'yearly'),
  };

  /* ---------- tipi di elemento ---------- */
  const IDENT_MEZZO = [
    txt('targa', 'Targa', 'es. AB123CD', { upper: true }),
    dat('acquisto', 'Data di acquisto', { half: true }),
    dat('immatricolazione', 'Prima immatricolazione', { half: true, hint: 'Si legge sul libretto: serve per calcolare la revisione' }),
    num('km', 'Chilometri attuali'),
  ];
  const mezzo = (id, label, icon, ph, sugg) => ({
    id, label, icon, ph, sugg, ident: IDENT_MEZZO, create: ['targa'], seqIdent: true,
    groups: [
      { title: 'Documenti', ids: ['assicurazione', 'bollo', 'revisione'] },
      { title: 'Manutenzione', ids: ['tagliando', 'gomme'] },
      { title: 'Pagamenti', ids: ['finanziamento'] },
    ],
    core: ['assicurazione', 'bollo', 'revisione', 'tagliando'],
    log: { title: 'Lavori e ricambi', add: 'Aggiungi un lavoro o un ricambio', hasKm: true, sugg: ['Cambio olio e filtri', 'Pastiglie freni', 'Batteria', 'Gomme', 'Cinghia distribuzione'] },
  });
  const casaGroups = (first) => [
    ...first,
    { title: 'Bollette', ids: ['luce', 'gas', 'acqua', 'internet'] },
    { title: 'Spese e tasse', ids: ['condominio', 'rifiuti'] },
    { title: 'Manutenzione', ids: ['assicurazione_casa', 'caldaia'] },
  ];
  const CASA_LOG = { title: 'Lavori e manutenzioni', add: 'Aggiungi un lavoro', hasKm: false, sugg: ['Idraulico', 'Elettricista', 'Tinteggiatura', 'Riparazione', 'Elettrodomestico'] };
  const list = (id, label, icon, ph, kinds, addLabel, x = {}) => ({ id, label, icon, ph, sugg: [], kinds, addLabel, ...x });

  const TYPES = {
    mezzi: [
      mezzo('auto', 'Auto', 'car', 'es. Fiat Panda', ['Fiat Panda', 'Citroën C3', 'Volkswagen Golf']),
      mezzo('moto', 'Moto / scooter', 'moto', 'es. Honda SH 125', ['Honda SH', 'Piaggio Liberty', 'Vespa']),
    ],
    casa: [
      {
        id: 'affitto', label: 'In affitto', icon: 'key', ph: 'es. Casa in via Roma', sugg: ['Casa in affitto'],
        ident: [txt('indirizzo', 'Indirizzo')], create: ['indirizzo'],
        groups: casaGroups([{ title: 'Affitto', ids: ['affitto', 'contratto', 'registro'] }]),
        core: ['affitto', 'contratto', 'luce', 'gas', 'internet'], log: CASA_LOG,
      },
      {
        id: 'proprieta', label: 'Di proprietà', icon: 'house', ph: 'es. Casa in via Roma', sugg: ['Casa di proprietà', 'Seconda casa'],
        ident: [txt('indirizzo', 'Indirizzo'), dat('acquisto', 'Acquistata il')], create: ['indirizzo'],
        groups: casaGroups([{ title: 'Mutuo e tasse', ids: ['mutuo', 'imu'] }]),
        core: ['mutuo', 'imu', 'luce', 'gas', 'internet'], log: CASA_LOG,
      },
    ],
    altro: [
      {
        id: 'persona', label: 'Documenti', icon: 'idcard', nameLabel: 'Di chi sono?', ph: 'es. Mamma', sugg: ['Mamma', 'Papà'],
        groups: [{ title: 'Documenti', ids: ['identita', 'patente', 'passaporto', 'tessera'] }],
        core: ['identita', 'patente', 'passaporto', 'tessera'],
      },
      {
        id: 'salute', label: 'Salute', icon: 'heart', nameLabel: 'Di chi è?', ph: 'es. Mamma', sugg: ['Mamma', 'Papà'],
        groups: [{ title: 'Controlli', ids: ['visita', 'esami', 'vaccino', 'farmaci'] }], core: [],
      },
      {
        id: 'animale', label: 'Animale', icon: 'paw', nameLabel: 'Come si chiama?', ph: 'es. Birba', sugg: [],
        ident: [
          sel('specie', 'Che animale è?', [['cane', 'Cane'], ['gatto', 'Gatto'], ['altro', 'Altro']]),
          txt('razza', 'Razza', '', { half: true }),
          dat('nascita', 'Data di nascita', { half: true }),
          txt('microchip', 'Microchip'),
        ],
        create: [],
        groups: [{ title: 'Salute', ids: ['vaccino_animale', 'antiparassitario', 'visita_vet'] }, { title: 'Altro', ids: ['assicurazione'] }],
        core: ['vaccino_animale', 'antiparassitario', 'visita_vet'],
      },
      list('abbonamenti', 'Abbonamenti', 'repeat', 'es. Streaming e palestra', ['abbonamento', 'telefono', 'internet'], 'Aggiungi un abbonamento', { defName: 'Abbonamenti' }),
      list('garanzie', 'Garanzie', 'box', 'es. Elettrodomestici', ['garanzia'], 'Aggiungi una garanzia', { defName: 'Garanzie' }),
      list('fisco', 'Tasse e fisco', 'percent', 'es. Tasse', ['dichiarazione', 'isee', 'tassa'], 'Aggiungi una scadenza fiscale', { defName: 'Tasse e fisco' }),
      list('lavoro', 'Lavoro', 'briefcase', 'es. Lavoro', ['contratto_lavoro', 'trasporto', 'formazione', 'visita_lavoro'], 'Aggiungi una scadenza di lavoro', { defName: 'Lavoro' }),
      list('scuola', 'Scuola e sport', 'cap', 'es. Scuola di Marco', ['scuola', 'sport'], 'Aggiungi una scadenza'),
      list('banca', 'Carte e banca', 'card', 'es. Conto e carte', ['carta', 'conto'], 'Aggiungi una carta o un conto', { defName: 'Carte e banca' }),
      list('libero', 'Altro', 'tag', 'es. Qualsiasi cosa', ['altro', 'assicurazione', 'abbonamento', 'documento', 'salute', 'telefono', 'internet', 'tassa'], 'Aggiungi una scadenza'),
    ],
  };

  // Tipi di scadenza in più rispetto all'elenco base dell'app (compaiono solo dove servono).
  const xk = (id, label, icon, rec) => ({ id, label, icon, rec, cats: [] });
  const EXTRA_KINDS = [
    xk('finanziamento', 'Finanziamento', 'wallet', 'monthly'), xk('mutuo', 'Mutuo', 'landmark', 'monthly'),
    xk('contratto', 'Contratto', 'file', 'none'),
    xk('identita', 'Carta d\'identità', 'idcard', 'none'), xk('patente', 'Patente', 'idcard', 'none'),
    xk('passaporto', 'Passaporto', 'idcard', 'none'), xk('tessera', 'Tessera sanitaria', 'idcard', 'none'),
    xk('esami', 'Esami', 'heart', 'yearly'), xk('vaccino', 'Vaccino', 'syringe', 'none'), xk('farmaci', 'Farmaci', 'pill', 'none'),
    xk('antiparassitario', 'Antiparassitario', 'paw', 'quarterly'),
    xk('garanzia', 'Garanzia', 'box', 'none'),
    xk('dichiarazione', 'Dichiarazione', 'file', 'yearly'), xk('isee', 'ISEE', 'file', 'yearly'), xk('tassa', 'Tassa', 'percent', 'none'),
    xk('contratto_lavoro', 'Contratto di lavoro', 'briefcase', 'none'), xk('trasporto', 'Abbonamento trasporti', 'bus', 'yearly'),
    xk('formazione', 'Corso o formazione', 'cap', 'none'), xk('visita_lavoro', 'Visita medica del lavoro', 'heart', 'yearly'),
    xk('scuola', 'Scuola', 'cap', 'none'), xk('sport', 'Sport', 'tag', 'yearly'),
    xk('carta', 'Carta di pagamento', 'card', 'none'), xk('conto', 'Conto', 'landmark', 'yearly'),
  ];

  const api = { SECTIONS, TYPES, EXTRA_KINDS, nextRevisione, nextImu, computeAuto, untilFor, addMonths, eom, monthsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SCHEDE = api;
})(typeof window !== 'undefined' ? window : globalThis);
