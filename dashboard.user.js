// ==UserScript==
// @name        Missionchief dispatch overview
// @namespace   https://github.com/notableladybug/Missionchief-dispatch
// @version     2.41
// @description A missionchief dispatch helper
// @author      Ludvig
// @match       *://*.alarmcentral-spil.dk/missions/*
// @match       *://*.missionchief.com/missions/*
// @match       *://*.missionchief.co.uk/missions/*
// @updateURL   https://raw.githubusercontent.com/notableladybug/Missionchief-dispatch/main/dashboard.user.js
// @downloadURL https://raw.githubusercontent.com/notableladybug/Missionchief-dispatch/main/dashboard.user.js
// @grant       none
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '2.39';
    const REFRESH_INTERVAL_MS = 3000;   // hvor ofte boksen tjekker for ændringer
    const MIN_SUBSTRING_LEN = 5;        // kortere nøgleord i kategorier matches kun som hele ord
    const TYPE_CACHE_KEY = 'mcDispatchVehicleTypes';
    const TYPE_CACHE_MAX = 6000;

    // ==========================================
    // ⚙️ CONFIGURATION & SPROGLAG (i18n)
    // Alle nøgleord sammenlignes lowercase (se norm()), så store/små bogstaver er ligegyldige.
    // nameReplacements-nøgler skal matche navnet EFTER at "at ", "Påkrævet " osv. er fjernet.
    // ==========================================
    const CONFIG = {
        currentLang: detectLang(),

        i18n: {
            da: {
                // Kategorierne følger spillets officielle inddeling. Nøgleord under 5 tegn matcher kun som hele ord,
                // og det længste matchende nøgleord vinder (fx 'rydningsvogn med vandkanon' > 'rydningsvogn').
                categories: {
                    '🔥 Brandbiler': [
                        'autosprøjte', 'slange tender', 'specialsprøjte', 'sprøjte', 'brandbil'
                    ],
                    '🚒 Andet slukningsredskab': [
                        'indsatsleder brand', 'rydningsvogn med vandkanon', 'redningsvogn', 'stigevogn', 'stige',
                        'liftvogn', 'lift', 'snorkelvogn', 'snorkel', 'tankvogn', 'vandtankvogn',
                        'lkm', 'ledelses- og kommunikationsmodul', 'cbrn', 'kemi', 'gift',
                        'højtrykskompressor', 'crash tender', 'rednings trappe', 'skum tender',
                        'påhængs pumpe', 'påhængs pumpe stor', 'følgeskade'
                    ],
                    '⛴️ Vandredning': [
                        'dykkerbil', 'dykker', 'overfladeredderbil', 'overfladeredder', 'bådtrailer', 'båd'
                    ],
                    '🚑 Ambulance': [
                        'ambulance', 'sygetransport', 'nødbehandler', 'indsatsleder sund',
                        'akutlæge', 'læge', 'specialambulance', 'mobil behandlingsplads', 'behandlingsplads'
                    ],
                    '🚨 Katastrofehjælp': [
                        'generator trailer', 'lysmast trailer', 'lysmast', 'rednings hunde', 'redningshund'
                    ],
                    '🚚 Container': [
                        'kroghejs med kran', 'kroghejs', 'container'
                    ],
                    '🚔 Politi': [
                        'patruljevogn', 'patrulje', 'hundepatrulje', 'fangetransport', 'gruppevogn',
                        'hollændervogn', 'indsatsleder politi', 'aks pansret mandskabsvogn', 'aks patruljevogn',
                        'aks', 'politimotorcykel', 'politihest', 'rydningsvogn', 'politi'
                    ]
                },
                defaultCategory: '🚜 Øvrige',
                excludeKeywords: [
                    'patient', 'patienttransport', 'pumpekapacitet', 'vandmængde', 'liter', 'kreditter',
                    'fanger', 'station', 'stationer', 'bygning', 'bygninger', 'varighed',
                    'nødvendigt personale', 'nødvendigt minimum af brandmænd', 'løber kun fra', 'løber kun indtil'
                ],
                // Køretøj (nøgle) kan også opfylde disse krav (værdier). Kun eksakt navnematch på kravet.
                customMatches: {
                    // Kravsiden bruger generiske navne som "brandbiler" og "politibiler"
                    'autosprøjte': ['brandbil', 'brandbiler'],
                    'specialsprøjte': ['brandbil', 'brandbiler'],
                    'slangetender': ['brandbil', 'brandbiler'],
                    'patruljevogn': ['politibil', 'politibiler'],
                    'ambulance': ['ambulance', 'sygetransport'],
                    'indsatsleder brand': ['indsatsleder brand', 'indsatsleder brand-køretøj', 'indsatsleder'],
                    'indsatsleder sund': ['indsatsleder sund', 'indsatsleder sundhed', 'indsatsleder']
                },
                nameReplacements: {
                    'gift- og kemikaliekøretøjer': 'CBRN',
                    'ledelses- og kommunikationsmodul': 'LKM',
                    'indsatsleder brand-køretøj': 'Indsatsleder Brand',
                    'indsatsleder sund-køretøj': 'Indsatsleder Sundhed',
                    'politibil eller fangetransport': 'Politibil',
                    'slange tender': 'Slangetender',
                    'Vandtankvogne': 'Tankvogn'
                },
                labels: {
                    loading: 'Henter og beregner manglende køretøjer...',
                    allGood: '✔ Alt nødvendigt udstyr er på ulykkesstedet / på vej!',
                    ready: (avail, req) => `✔ KLAR: Du har ${avail} ledige enheder (kræver ${req})`,
                    missing: (short, avail) => `✖ MANGLER KØRETØJER: ${short} køretøj(er) kan ikke dækkes af dine ${avail} ledige enheder!`,
                    availUnknown: (req) => `⚠ Kunne ikke aflæse ledige køretøjer – tjek manuelt (mangler ${req})`,
                    noRequirements: '⚠ Kunne ikke læse køretøjskrav for missionen (se konsollen, F12) – viser kun patientkrav.',
                    tableHeaderReq: 'Mangler på skadestedet',
                    tableHeaderAvail: 'Ledige',
                    tableHeaderCount: 'Antal',
                    errorMsg: 'Kunne ikke hente køretøjskrav. Prøv at genindlæse siden.'
                }
            },

            en: {
                categories: {
                    '🔥 Fire Engines': [
                        'type 1', 'type 2', 'pumper', 'fire engine', 'water tender', 'engine'
                    ],
                    '🚒 Technical & Support': [
                        'battalion chief', 'heavy rescue', 'platform', 'ladder', 'hazmat',
                        'mcu', 'mobile command', 'foam', 'air', 'utility', 'arff'
                    ],
                    '🚚 Container / Hooklift': [
                        'swab', 'hooklift', 'container'
                    ],
                    '⛴️ Water Rescue': [
                        'boat', 'diver', 'water rescue'
                    ],
                    '🚑 Ambulance & Medical': [
                        'ambulance', 'als', 'bls', 'fly-car', 'ems', 'chief', 'mci'
                    ],
                    '🚨 Disaster Response': [
                        'k9', 'search and rescue', 'generator', 'light tower'
                    ],
                    '🚔 Police': [
                        'patrol', 'police', 'sheriff', 'k9', 'swat', 'piv', 'motorcycle', 'padd'
                    ]
                },
                defaultCategory: '🚜 Other',
                excludeKeywords: [
                    'patient', 'patient transport', 'pump capacity', 'water volume', 'liters', 'gallons',
                    'credits', 'prisoners', 'personnel', 'station', 'stations', 'building', 'buildings',
                    'minimum firefighters'
                ],
                customMatches: {
                    'type 1 fire engine': ['fire engine', 'pumper'],
                    'type 2 fire engine': ['fire engine', 'pumper'],
                    'ambulance': ['ambulance', 'transport']
                },
                nameReplacements: {
                    'hazmat': 'HazMat',
                    'mobile command': 'MCU'
                },
                labels: {
                    loading: 'Fetching and calculating missing vehicles...',
                    allGood: '✔ All required equipment is on site / en route!',
                    ready: (avail, req) => `✔ READY: You have ${avail} available units (requires ${req})`,
                    missing: (short, avail) => `✖ MISSING VEHICLES: ${short} vehicle(s) cannot be covered by your ${avail} available units!`,
                    availUnknown: (req) => `⚠ Could not read available vehicles – check manually (missing ${req})`,
                    noRequirements: '⚠ Could not read the mission requirements (see console, F12) – showing patient requirements only.',
                    tableHeaderReq: 'Missing on scene',
                    tableHeaderAvail: 'Available',
                    tableHeaderCount: 'Count',
                    errorMsg: 'Could not fetch mission requirements. Please refresh the page.'
                }
            }
        }
    };

    function detectLang() {
        const htmlLang = (document.documentElement.lang || '').toLowerCase();
        if (htmlLang.startsWith('da') || window.location.hostname.endsWith('.dk')) return 'da';
        return 'en';
    }

    const LANG = CONFIG.i18n[CONFIG.currentLang] || CONFIG.i18n.en;

    // ==========================================
    // Forudberegnede, normaliserede opslag
    // ==========================================
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    const EXCLUDE = LANG.excludeKeywords.map(norm);
    const REPLACEMENTS = Object.entries(LANG.nameReplacements).map(([k, v]) => [norm(k), v]);
    const CUSTOM = Object.entries(LANG.customMatches).map(([k, v]) => [norm(k), v.map(norm)]);
    const CATEGORY_KEYWORDS = Object.entries(LANG.categories)
        .flatMap(([cat, kws]) => kws.map(kw => ({ cat, kw: norm(kw) })));

    const WORD_CHARS = 'a-z0-9æøåäöüé';

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Hele-ord-match (understøtter æøå, som \b ikke gør). Begge argumenter forventes lowercase.
    function containsWord(haystack, needle) {
        if (!needle) return false;
        const re = new RegExp(`(^|[^${WORD_CHARS}])${escapeRegExp(needle)}($|[^${WORD_CHARS}])`);
        return re.test(haystack);
    }

    // Kravnavne kan stå i flertal ("Patruljevogne", "Ambulancer"); prøv også entalsformer.
    function nameVariants(name) {
        const n = norm(name);
        const variants = [n];
        if (n.length > 5 && /(er|ne)$/.test(n)) variants.push(n.slice(0, -2));
        if (n.length > 4 && /[er]$/.test(n)) variants.push(n.slice(0, -1));
        return Array.from(new Set(variants));
    }

    // Et "kandidatnavn" for et køretøj. strict = kendt korrekt typenavn (kun eksakt/alias-match),
    // ikke strict = et frit navn/kaldenavn (må også matche som helt ord, fx "Ambulance 3").
    const cand = (text, strict) => ({ text: norm(text), strict: !!strict });

    function dedupeCands(list) {
        const seen = new Set();
        return list.filter(c => {
            if (!c.text) return false;
            const k = `${c.strict}|${c.text}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }

    // ==========================================
    // Opstart
    // ==========================================
    const missionGeneralInfo = document.getElementById('mission_general_info');
    if (!missionGeneralInfo) return;

    const missionTypeId = missionGeneralInfo.getAttribute('data-mission-type');
    if (!missionTypeId) return;

    const missionIdMatch = window.location.pathname.match(/\/missions\/(\d+)/);
    const missionId = missionIdMatch ? missionIdMatch[1] : '';

    const oldBox = document.getElementById('custom-requirements-box');
    if (oldBox) oldBox.remove();

    const reqBox = document.createElement('div');
    reqBox.id = 'custom-requirements-box';
    reqBox.style.padding = '15px';
    reqBox.style.marginBottom = '20px';
    reqBox.style.border = '1px solid #d9534f';
    reqBox.style.backgroundColor = '#fdf2f2';
    reqBox.style.borderRadius = '4px';
    reqBox.innerHTML = `<strong>${escapeHtml(LANG.labels.loading)} <span class="glyphicon glyphicon-refresh spinning"></span></strong>`;

    const vehicleList = document.getElementById('vehicle_list_step');
    if (vehicleList) {
        vehicleList.parentNode.insertBefore(reqBox, vehicleList);
    } else {
        const colLeft = document.getElementById('col_left');
        if (colLeft) colLeft.prepend(reqBox);
    }

    let requirementRows = null;   // parsede krav (uden kategori); kan være [] hvis intet blev fundet
    let lastSignature = null;
    let timer = null;

    // Køretøjs-id -> typenavn. Bruges til at finde typen på køretøjer, der allerede er sendt afsted
    // (de står ikke længere i listen over ledige, og deres navn i "sendt"-tabellen er blot et kaldenavn).
    let typeCache = {};
    try { typeCache = JSON.parse(localStorage.getItem(TYPE_CACHE_KEY) || '{}') || {}; } catch (e) { typeCache = {}; }

    function rememberTypes(pairs) {
        let changed = false;
        pairs.forEach(([id, type]) => {
            if (id && type && typeCache[id] !== type) { typeCache[id] = type; changed = true; }
        });
        if (!changed) return;
        const ids = Object.keys(typeCache);
        if (ids.length > TYPE_CACHE_MAX) {
            ids.slice(0, ids.length - TYPE_CACHE_MAX).forEach(k => delete typeCache[k]);
        }
        try { localStorage.setItem(TYPE_CACHE_KEY, JSON.stringify(typeCache)); } catch (e) { /* ignorer */ }
    }

    // ==========================================
    // Navne, kategorier og matching
    // ==========================================
    function getCategory(vehicleName) {
        const name = norm(vehicleName);
        let best = null;
        // Det længste matchende nøgleord vinder, så resultatet ikke afhænger af rækkefølgen i CONFIG.
        for (const { cat, kw } of CATEGORY_KEYWORDS) {
            const hit = kw.length >= MIN_SUBSTRING_LEN ? name.includes(kw) : containsWord(name, kw);
            if (hit && (!best || kw.length > best.kw.length)) best = { cat, kw };
        }
        return best ? best.cat : LANG.defaultCategory;
    }

    function formatVehicleName(name) {
        const lower = norm(name);
        for (const [key, replacement] of REPLACEMENTS) {
            if (lower.includes(key)) return replacement;
        }
        return name;
    }

    // Hvor godt matcher et køretøj (liste af kandidater) et krav? 0 = intet match.
    // 3 = eksakt typenavn, 2 = kravnavn indgår som helt ord i et frit navn, 1 = alias fra customMatches.
    function matchScore(cands, entry) {
        let best = 0;
        for (const c of cands) {
            if (entry.variants.includes(c.text)) return 3;
            if (!c.strict && entry.variants.some(v => containsWord(c.text, v))) best = Math.max(best, 2);
            for (const [key, aliases] of CUSTOM) {
                const keyHit = c.strict ? c.text === key : c.text.includes(key);
                if (keyHit && entry.variants.some(v => aliases.includes(v))) best = Math.max(best, 1);
            }
        }
        return best;
    }

    function getProbabilityBadge(percentage) {
        let color = '#f0ad4e';
        if (percentage >= 70) color = '#d9534f';
        else if (percentage < 35) color = '#777';

        return `<span style="background-color: ${color}; color: #fff; padding: 2px 7px; border-radius: 10px; font-size: 11px; margin-left: 8px; font-weight: bold; display: inline-block;">🎲 ${percentage}% chance</span>`;
    }

    // Tal fra kravtabellen: "3" -> 3, "2-3" -> 3 (højeste), "1,5" -> 2 (rundet op), "1.000" -> 1000
    function parseCount(text) {
        const cleaned = String(text).replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
        const range = cleaned.match(/(\d+)\s*[-–]\s*(\d+)/);
        if (range) return Math.max(parseInt(range[1], 10), parseInt(range[2], 10));
        const m = cleaned.replace(',', '.').match(/\d+(?:\.\d+)?/);
        return m ? Math.ceil(parseFloat(m[0])) : NaN;
    }

    // ==========================================
    // Læsning af siden (sendte og ledige køretøjer, patienter)
    // ==========================================
    function typeAttrsOf(el) {
        const out = [];
        ['vehicle_type', 'data-vehicle-type', 'vehicle_type_caption'].forEach(attr => {
            const v = el.getAttribute && el.getAttribute(attr);
            if (v) out.push(v);
        });
        return out;
    }

    function getVehicleId(row) {
        const attr = row.getAttribute('vehicle_id');
        if (attr) return attr;
        const link = row.querySelector('a[href*="/vehicles/"]');
        const m = link && link.getAttribute('href').match(/\/vehicles\/(\d+)/);
        if (m) return m[1];
        const idm = (row.id || '').match(/(\d+)$/);
        return idm ? idm[1] : '';
    }

    // Rækker i listen over køretøjer, man kan vælge (ledige/optagede) – IKKE sendte køretøjer.
    function isSelectableVehicleRow(row) {
        return row.classList.contains('vehicle_select_table_tr') ||
               !!row.querySelector('input.vehicle_checkbox') ||
               !!row.closest('table[id^="vehicle_show_table"]');
    }

    // Køretøjer på vej / på skadestedet. Hvert køretøj er en liste af kandidater.
    // Vigtigt: tabellen over LEDIGE køretøjer må aldrig regnes med her.
    function readSentVehicles() {
        const rows = new Set();

        ['mission_vehicle_at_mission', 'mission_vehicle_driving'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.querySelectorAll('tr').forEach(r => rows.add(r));
        });

        // Fallback hvis id'erne ikke findes: rækker uden for den valgbare liste, der linker til et køretøj
        if (rows.size === 0) {
            document.querySelectorAll('a[href*="/vehicles/"]').forEach(a => {
                const row = a.closest('tr');
                if (!row || reqBox.contains(row) || isSelectableVehicleRow(row)) return;
                rows.add(row);
            });
        }

        const sent = [];
        const learned = [];
        rows.forEach(row => {
            if (row.querySelector('th') || isSelectableVehicleRow(row)) return;

            // Rækken skal indeholde et køretøjslink. Det udelukker fx knaprækken
            // "Køretøjsvisning begrænset!", og første celle er kun statusfeltet (FMS).
            const link = row.querySelector('a[href*="/vehicles/"]:not([href*="backalarm"])');
            if (!link) return;
            const caption = link.textContent.trim();
            if (!caption) return;

            const cands = [];

            // Selve typenavnet står i parentes lige efter linket: "Ambulance 3 (Ambulance)"
            const small = link.parentElement && link.parentElement.querySelector('small:not(.visible-xs)');
            const typeMatch = small && small.textContent.trim().match(/^\(\s*([^)]+?)\s*\)$/);
            const typeLabel = typeMatch ? typeMatch[1] : '';
            if (typeLabel) cands.push(cand(typeLabel, true));

            const typeId = link.getAttribute('vehicle_type_id');
            if (typeId && typeLabel) learned.push(['t' + typeId, typeLabel]);

            const id = getVehicleId(row);
            if (id && typeCache[id]) cands.push(cand(typeCache[id], true));
            if (typeId && typeCache['t' + typeId]) cands.push(cand(typeCache['t' + typeId], true));
            typeAttrsOf(row).forEach(t => cands.push(cand(t, true)));

            cands.push(cand(caption, false));
            sent.push(dedupeCands(cands));
        });
        rememberTypes(learned);
        return sent;
    }

    // Ledige køretøjer (status 1/2) fra listen. Returnerer null, hvis listen ikke findes.
    function readAvailableVehicles() {
        let rows = Array.from(document.querySelectorAll('tr.vehicle_select_table_tr'));
        if (rows.length === 0) rows = Array.from(document.querySelectorAll('#vehicle_show_table_body_all tr'));
        if (!vehicleList && rows.length === 0) return null;

        const seen = new Set();
        const available = [];
        const known = [];

        rows.forEach(row => {
            if (reqBox.contains(row)) return;

            const type = row.getAttribute('vehicle_type');
            const id = getVehicleId(row);
            if (id && type) known.push([id, type]);
            const typeIdCell = row.querySelector('[vehicle_type_id]');
            if (type && typeIdCell) known.push(['t' + typeIdCell.getAttribute('vehicle_type_id'), type]);

            // Optagede køretøjer (fane) og sendte køretøjer er ikke ledige
            if (row.closest('#occupied, #mission_vehicle_at_mission, #mission_vehicle_driving')) return;

            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) {
                if (checkbox.disabled) return;
                const fms = checkbox.getAttribute('fms');
                if (fms && fms !== '1' && fms !== '2') return;
            }

            // Ét køretøj tælles kun én gang, uanset fane. Synlighed bruges bevidst IKKE:
            // ellers ville tallet ændre sig, når du skifter fane eller bruger søgefeltet.
            const key = (checkbox && checkbox.value) || id || row.id;
            if (key) {
                if (seen.has(key)) return;
                seen.add(key);
            }

            const cands = [];
            typeAttrsOf(row).forEach(t => cands.push(cand(t, true)));
            if (checkbox) typeAttrsOf(checkbox).forEach(t => cands.push(cand(t, true)));
            if (cands.length === 0) cands.push(cand(row.textContent, false));
            available.push(dedupeCands(cands));
        });

        rememberTypes(known);
        return available;
    }

    function getRequiredAmbulancesFromPatients() {
        const el = document.getElementById('patient_button_text');
        const text = (el ? el.textContent : document.body.textContent) || '';
        const match = text.match(/(\d+)\s+(?:ubehandlede\s+patienter|untreated\s+patients)/i);
        return match ? parseInt(match[1], 10) : 0;
    }

    // ==========================================
    // Kravtabellen: parse -> rækker (cachebare)
    // ==========================================
    function extractRows(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = [];

        doc.querySelectorAll('table').forEach(table => {
            Array.from(table.rows).forEach(row => {
                if (row.cells.length < 2 || row.querySelector('table')) return;

                const rawName = row.cells[0].textContent.trim();
                const countText = row.cells[1].textContent.trim();
                const lowerName = norm(rawName);
                if (!lowerName) return;

                if (lowerName.includes('patienttransport') || lowerName.includes('patient transport')) return;
                if (EXCLUDE.some(keyword => lowerName.includes(keyword))) return;

                const isProbability = lowerName.includes('sandsynlighed') ||
                                      lowerName.includes('chance') ||
                                      countText.includes('%') ||
                                      lowerName.includes('nødvendighed');

                let chance = null;
                if (isProbability) {
                    const m = countText.match(/\d+/) || rawName.match(/\d+/);
                    if (!m) return; // sandsynlighedsrække uden tal: ignorér (valgfri)
                    chance = parseInt(m[0], 10);
                }

                // Præfikser kan ligge i lag ("Sandsynlighed for at Akutlæge"), så gentag til intet ændrer sig
                const cleanName = (n) => n.replace(/^at\s+/gi, '')
                                          .replace(/\s+er\s+krævet$/gi, '')
                                          .replace(/\s+is\s+required$/gi, '')
                                          .replace(/nødvendighed\s+af\s+/gi, '')
                                          .replace(/nødvendighed\s+for\s+/gi, '')
                                          .replace(/nødvendighed\s+/gi, '')
                                          .replace(/^Påkrævede\s+/gi, '')
                                          .replace(/^Påkrævet\s+/gi, '')
                                          .replace(/sandsynlighed\s+for\s+/gi, '')
                                          .replace(/chance\s+for\s+/gi, '')
                                          .replace(/^Required\s+/gi, '')
                                          .replace(/\s+/g, ' ')
                                          .trim();
                let name = rawName;
                for (let i = 0; i < 4; i++) {
                    const next = cleanName(name);
                    if (next === name) break;
                    name = next;
                }
                name = formatVehicleName(name);
                if (!name) return;
                name = name.charAt(0).toUpperCase() + name.slice(1);

                if (isProbability) {
                    rows.push({ name, chance, count: 1 });
                } else {
                    const count = parseCount(countText);
                    if (!Number.isFinite(count) || count <= 0) return;
                    rows.push({ name, chance: null, count });
                }
            });
        });

        return rows;
    }

    // Slå rækker sammen pr. (eksakt) navn: obligatorisk = højeste antal, valgfri = én plads pr. sandsynlighedsrække.
    function buildEntries(rows, patientAmbulances) {
        const map = new Map();
        const ensure = (name) => {
            const key = norm(name);
            if (!map.has(key)) {
                map.set(key, { key, name, category: getCategory(name), mandatory: 0, chances: [] });
            }
            return map.get(key);
        };

        rows.forEach(r => {
            const e = ensure(r.name);
            if (r.chance !== null) e.chances.push(r.chance);
            else e.mandatory = Math.max(e.mandatory, r.count);
        });

        // Ubehandlede patienter kræver ambulancer – også selvom kravsiden ikke nævner dem
        if (patientAmbulances > 0) {
            let amb = Array.from(map.values()).find(e => e.key.includes('ambulance'));
            if (!amb) amb = ensure('Ambulance');
            amb.mandatory = Math.max(amb.mandatory, patientAmbulances);
        }

        const entries = Array.from(map.values());
        entries.forEach(e => {
            e.chances.sort((a, b) => b - a);
            e.variants = nameVariants(e.name);
        });
        return entries;
    }

    // Fordel sendte og ledige køretøjer på kravene (bedste match først, obligatoriske før valgfrie).
    function allocate(entries, sent, available) {
        entries.forEach(e => {
            e.remMand = e.mandatory;
            e.remOpt = e.chances.slice();
            e.availMatched = 0;   // ledige køretøjer, der er reserveret til dette krav
            e.availTotal = 0;     // alle ledige køretøjer af denne type (til visning)
            e.short = 0;
        });

        sent.forEach(cands => {
            let best = null, bestRank = 0;
            entries.forEach(e => {
                if (e.remMand <= 0 && e.remOpt.length === 0) return;
                const score = matchScore(cands, e);
                if (score === 0) return;
                const rank = score * 2 + (e.remMand > 0 ? 1 : 0);
                if (rank > bestRank) { best = e; bestRank = rank; }
            });
            if (!best) return;
            if (best.remMand > 0) best.remMand--;
            else best.remOpt.shift(); // højeste sandsynlighed er "brugt"
        });

        if (available) {
            available.forEach(cands => {
                entries.forEach(e => { if (matchScore(cands, e) > 0) e.availTotal++; });

                let best = null, bestScore = 0;
                entries.forEach(e => {
                    if (e.remMand - e.availMatched <= 0) return;
                    const score = matchScore(cands, e);
                    if (score > bestScore) { best = e; bestScore = score; }
                });
                if (best) best.availMatched++;
            });
            entries.forEach(e => { e.short = Math.max(0, e.remMand - e.availMatched); });
        }
    }

    // ==========================================
    // Visning
    // ==========================================
    const STATES = {
        ok:   { border: '#5cb85c', bg: '#f4fbf7', badge: '#5cb85c' },
        bad:  { border: '#d9534f', bg: '#fdf2f2', badge: '#d9534f' },
        warn: { border: '#f0ad4e', bg: '#fcf8e3', badge: '#f0ad4e' }
    };

    function applyState(stateName, message) {
        const st = STATES[stateName];
        reqBox.style.borderColor = st.border;
        reqBox.style.backgroundColor = st.bg;

        const badge = document.createElement('div');
        badge.style.display = 'inline-block';
        badge.style.padding = '6px 14px';
        badge.style.borderRadius = '20px';
        badge.style.fontWeight = 'bold';
        badge.style.fontSize = '13px';
        badge.style.marginBottom = '12px';
        badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        badge.style.backgroundColor = st.badge;
        badge.style.color = '#fff';
        badge.textContent = message;
        reqBox.appendChild(badge);
    }

    function renderBox(entries, availableCount, availableKnown, hasRequirementInfo) {
        reqBox.innerHTML = '';

        const missing = entries.filter(e => e.remMand > 0 || e.remOpt.length > 0);
        const totalMissing = entries.reduce((s, e) => s + e.remMand, 0);
        const totalShort = entries.reduce((s, e) => s + e.short, 0);

        if (!hasRequirementInfo) {
            applyState('warn', LANG.labels.noRequirements);
        } else if (totalMissing === 0) {
            applyState('ok', LANG.labels.allGood);
        } else if (!availableKnown) {
            applyState('warn', LANG.labels.availUnknown(totalMissing));
        } else if (totalShort === 0) {
            applyState('ok', LANG.labels.ready(availableCount, totalMissing));
        } else {
            applyState('bad', LANG.labels.missing(totalShort, availableCount));
        }

        if (missing.length === 0) return;

        const grouped = {};
        missing.forEach(item => {
            if (!grouped[item.category]) grouped[item.category] = [];
            grouped[item.category].push(item);
        });

        const cleanTable = document.createElement('table');
        cleanTable.className = 'table table-striped table-condensed';
        cleanTable.style.backgroundColor = '#fff';
        cleanTable.style.marginBottom = '0';
        cleanTable.style.border = '1px solid #ddd';

        const cols = availableKnown ? 3 : 2;
        let html = `<thead><tr style="background:#f5f5f5;"><th>${escapeHtml(LANG.labels.tableHeaderReq)}</th>` +
                   (availableKnown ? `<th style="width:90px; text-align:right;">${escapeHtml(LANG.labels.tableHeaderAvail)}</th>` : '') +
                   `<th style="width:110px; text-align:right;">${escapeHtml(LANG.labels.tableHeaderCount)}</th></tr></thead><tbody>`;

        const categoryOrder = [...Object.keys(LANG.categories), LANG.defaultCategory];

        categoryOrder.forEach(cat => {
            if (!grouped[cat] || grouped[cat].length === 0) return;

            html += `<tr style="background-color: #e9ecef; font-weight: bold;"><td colspan="${cols}" style="color: #333;">${escapeHtml(cat)}</td></tr>`;

            grouped[cat].forEach(item => {
                const chanceBadges = item.remOpt.map(getProbabilityBadge).join('');
                let countText;
                if (item.remMand > 0 && item.remOpt.length > 0) countText = `${item.remMand} + ${item.remOpt.length}`;
                else if (item.remMand > 0) countText = String(item.remMand);
                else countText = String(item.remOpt.length);

                html += `<tr><td style="padding-left: 20px; vertical-align: middle;">${escapeHtml(item.name)}${chanceBadges}</td>`;
                if (availableKnown) {
                    const color = item.short > 0 ? '#d9534f' : '#3c763d';
                    html += `<td style="text-align:right; font-weight:bold; vertical-align: middle; color:${color};">${item.availTotal}</td>`;
                }
                html += `<td style="text-align:right; font-weight:bold; vertical-align: middle;">${escapeHtml(countText)}</td></tr>`;
            });
        });

        html += '</tbody>';
        cleanTable.innerHTML = html;
        reqBox.appendChild(cleanTable);
    }

    function update(force) {
        if (!requirementRows) return;
        if (!document.body.contains(reqBox)) {
            if (timer) clearInterval(timer);
            return;
        }

        const sent = readSentVehicles();
        const available = readAvailableVehicles();
        const patients = getRequiredAmbulancesFromPatients();

        const signature = JSON.stringify([sent, available ? available.map(c => c[0].text) : null, patients]);
        if (!force && signature === lastSignature) return;
        lastSignature = signature;

        const entries = buildEntries(requirementRows, patients);
        allocate(entries, sent, available);
        renderBox(entries, available ? available.length : 0, available !== null, requirementRows.length > 0);

        // Fejlsøgning: skriv  mcDispatchDebug  i konsollen (F12)
        window.mcDispatchDebug = { version: VERSION, requirementRows, patients, sent, available, entries };
    }

    // ==========================================
    // Hentning af krav (med cache pr. mission i denne fane)
    // ==========================================
    const cacheKey = `mcDispatchReq:${VERSION}:${CONFIG.currentLang}:${missionId || missionTypeId}`;

    // Missionens egen "Krav for denne mission"-knap peger på siden med de rigtige krav
    // (inkl. ?mission_id=…). Uden mission_id kan man få en anden/tom side.
    function getRequirementUrls() {
        const urls = [];
        const help = document.getElementById('mission_help') ||
                     document.getElementById('mission-type-helper-mobile') ||
                     document.querySelector('a[href*="/einsaetze/"]');
        const href = help && help.getAttribute('href');
        if (href) urls.push(href);
        if (missionId) urls.push(`/einsaetze/${encodeURIComponent(missionTypeId)}?mission_id=${missionId}`);
        urls.push(`/einsaetze/${encodeURIComponent(missionTypeId)}`);
        return Array.from(new Set(urls));
    }

    async function loadRequirementRows() {
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { /* ingen cache – hent normalt */ }

        let lastError = null;
        let gotResponse = false;

        for (const url of getRequirementUrls()) {
            try {
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
                gotResponse = true;

                const html = await response.text();
                const rows = extractRows(html);
                if (rows.length > 0) {
                    try { sessionStorage.setItem(cacheKey, JSON.stringify(rows)); } catch (e) { /* ignorer */ }
                    return rows;
                }
                console.warn('[Missionchief dispatch] Ingen krav fundet i svaret fra', url, {
                    htmlLength: html.length,
                    tables: (html.match(/<table/gi) || []).length,
                    start: html.replace(/\s+/g, ' ').slice(0, 300)
                });
            } catch (err) {
                lastError = err;
            }
        }

        if (!gotResponse && lastError) throw lastError;
        return [];
    }

    loadRequirementRows()
        .then(rows => {
            reqBox.innerHTML = '';
            requirementRows = rows;   // også [] – patientkrav skal stadig vises
            update(true);
            timer = setInterval(() => update(false), REFRESH_INTERVAL_MS);
        })
        .catch(err => {
            reqBox.innerHTML = '';
            const msg = document.createElement('strong');
            msg.style.color = 'red';
            msg.textContent = LANG.labels.errorMsg;
            reqBox.appendChild(msg);
            console.error('Fejl ved hentning af missionskrav:', err);
        });
})();