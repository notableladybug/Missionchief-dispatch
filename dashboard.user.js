// ==UserScript==
// @name        Missionchief dispatch overview
// @namespace   https://github.com/notableladybug/Missionchief-dispatch
// @version     2.36
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

    const VERSION = '2.36';
    const REFRESH_INTERVAL_MS = 3000;   // hvor ofte boksen tjekker for ændringer
    const MIN_SUBSTRING_LEN = 5;        // kortere nøgleord i kategorier matches kun som hele ord

    // ==========================================
    // ⚙️ CONFIGURATION & SPROGLAG (i18n)
    // Alle nøgleord sammenlignes lowercase (se norm()), så store/små bogstaver er ligegyldige.
    // nameReplacements-nøgler skal matche navnet EFTER at "at ", "Påkrævet " osv. er fjernet.
    // ==========================================
    const CONFIG = {
        currentLang: detectLang(),

        i18n: {
            da: {
                categories: {
                    '🔥 Brandbiler': [
                        'autosprøjte', 'slange tender', 'specialsprøjte', 'sprøjte', 'brandbil', 'brandbiler'
                    ],
                    '🚒 Andet slukningsredskab': [
                        'indsatsleder brand', 'rydningsvogn med vandkanon', 'redningsvogn', 'stige', 'lift',
                        'snorkel', 'tankvogn', 'lkm', 'ledelses- og kommunikationsmodul', 'cbrn',
                        'kemi', 'gift', 'højtrykskompressor', 'crash tender', 'rednings trappe',
                        'skum tender', 'påhængs pumpe', 'følgeskade'
                    ],
                    '🚚 Container': [
                        'container', 'kroghejs'
                    ],
                    '⛴️ Vandredning': [
                        'dykker', 'overfladeredder', 'bådtrailer', 'båd'
                    ],
                    '🚑 Ambulance': [
                        'ambulance', 'sygetransport', 'nødbehandler', 'indsatsleder sund',
                        'akutlæge', 'læge', 'behandlingsplads'
                    ],
                    '🚨 Katastrofehjælp': [
                        'generator trailer', 'lysmast', 'rednings hunde', 'redningshund'
                    ],
                    '🚔 Politi': [
                        'politi', 'patrulje', 'hundepatrulje', 'fangetransport', 'gruppevogn',
                        'hollændervogn', 'aks', 'aks personale', 'politimotorcykel', 'politihest', 'rydningsvogn'
                    ]
                },
                defaultCategory: '🚜 Øvrige',
                excludeKeywords: [
                    'patient', 'patienttransport', 'pumpekapacitet', 'vandmængde', 'liter', 'kreditter',
                    'fanger', 'station', 'stationer', 'bygning', 'bygninger', 'varighed',
                    'nødvendigt personale', 'nødvendigt minimum af brandmænd', 'løber kun fra', 'løber kun indtil'
                ],
                // Sendt køretøj (nøgle) kan også opfylde disse krav (værdier). Kun eksakt navnematch på kravet.
                customMatches: {
                    'autosprøjte': ['brandbil', 'brandbiler'],
                    'sprøjte': ['brandbil', 'brandbiler'],
                    'ambulance': ['ambulance', 'sygetransport'],
                    'indsatsleder brand': ['indsatsleder brand', 'indsatsleder brand-køretøj', 'indsatsleder'],
                    'indsatsleder sund': ['indsatsleder sund', 'indsatsleder sundhed', 'indsatsleder']
                },
                nameReplacements: {
                    'gift- og kemikaliekøretøjer': 'CBRN',
                    'ledelses- og kommunikationsmodul': 'LKM',
                    'indsatsleder brand-køretøj': 'Indsatsleder Brand',
                    'indsatsleder sund-køretøj': 'Indsatsleder Sundhed',
                    'politibil eller fangetransport': 'Politibil'
                },
                labels: {
                    loading: 'Henter og beregner manglende køretøjer...',
                    allGood: '✔ Alt nødvendigt udstyr er på ulykkesstedet / på vej!',
                    ready: (avail, req) => `✔ KLAR: Du har ${avail} ledige enheder (kræver ${req})`,
                    missing: (short, avail) => `✖ MANGLER KØRETØJER: ${short} køretøj(er) kan ikke dækkes af dine ${avail} ledige enheder!`,
                    availUnknown: (req) => `⚠ Kunne ikke aflæse ledige køretøjer – tjek manuelt (mangler ${req})`,
                    noRequirements: '⚠ Ingen køretøjskrav fundet for denne missionstype – tjek siden manuelt.',
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
                    noRequirements: '⚠ No vehicle requirements found for this mission type – check the page manually.',
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

    // ==========================================
    // Opstart
    // ==========================================
    const missionGeneralInfo = document.getElementById('mission_general_info');
    if (!missionGeneralInfo) return;

    const missionTypeId = missionGeneralInfo.getAttribute('data-mission-type');
    if (!missionTypeId) return;

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

    let requirementRows = null;   // parsede krav (uden kategori), fra cache eller fetch
    let lastSignature = null;
    let timer = null;

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

    // Hvor godt matcher et køretøj (liste af kandidatstrenge) et krav? 0 = intet match.
    // 3 = eksakt navn, 2 = kravets navn indgår som helt ord, 1 = eksplicit alias fra customMatches.
    function matchScore(candidates, reqName) {
        const r = norm(reqName);
        let best = 0;
        for (const c of candidates) {
            if (c === r) return 3;
            if (containsWord(c, r)) {
                best = Math.max(best, 2);
                continue;
            }
            for (const [key, aliases] of CUSTOM) {
                if (c.includes(key) && aliases.includes(r)) best = Math.max(best, 1);
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
            if (v) out.push(norm(v));
        });
        return out;
    }

    // Returnerer en liste af køretøjer; hvert køretøj er en liste af kandidatstrenge (lowercase).
    function readSentVehicles() {
        let rows = [];

        ['mission_vehicle_at_mission', 'mission_vehicle_driving'].forEach(id => {
            const el = document.getElementById(id);
            if (el) rows.push(...el.querySelectorAll('tr'));
        });

        // Fallback: find tabeller ud fra deres <th>-overskrifter (ikke hele tabellens tekst)
        if (rows.length === 0) {
            document.querySelectorAll('table').forEach(table => {
                if (reqBox.contains(table)) return;
                const head = norm(Array.from(table.querySelectorAll('th')).map(th => th.textContent).join(' '));
                const hasVehicle = head.includes('køretøj') || head.includes('vehicle');
                const hasBuilding = head.includes('station') || head.includes('building') || head.includes('bygning');
                if (hasVehicle && hasBuilding) rows.push(...table.rows);
            });
        }

        const sent = [];
        rows.forEach(row => {
            if (row.querySelector('th') || !row.cells || row.cells.length < 1) return;
            const cellText = row.cells[0].textContent.trim();
            if (!cellText || /annull[ée]r|cancel/i.test(cellText)) return;

            const candidates = [norm(cellText)];
            candidates.push(...typeAttrsOf(row));
            row.querySelectorAll('[vehicle_type],[data-vehicle-type],[vehicle_type_caption]')
                .forEach(el => candidates.push(...typeAttrsOf(el)));
            sent.push(Array.from(new Set(candidates)));
        });
        return sent;
    }

    // Returnerer null, hvis køretøjslisten ikke findes på siden (ledige kan ikke aflæses).
    function readAvailableVehicles() {
        const rows = document.querySelectorAll(
            'tr.vehicle_select_table_tr, tr.vehicle_rel, #vehicle_show_table_body_all tr, tr[id^="vehicle_row"]'
        );
        if (!vehicleList && rows.length === 0) return null;

        const seen = new Set();
        const available = [];

        rows.forEach(row => {
            if (reqBox.contains(row)) return;
            // Rækker i tabellerne over sendte køretøjer er ikke ledige
            if (row.closest('#mission_vehicle_at_mission, #mission_vehicle_driving')) return;
            // Skjult (via inline style, CSS-klasse eller skjult forælder)
            if (row.offsetParent === null) return;

            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.disabled) return;

            const key = (checkbox && checkbox.value) || row.id;
            if (key) {
                if (seen.has(key)) return;
                seen.add(key);
            }

            const candidates = [];
            candidates.push(...typeAttrsOf(row));
            if (checkbox) candidates.push(...typeAttrsOf(checkbox));
            row.querySelectorAll('[vehicle_type],[data-vehicle-type],[vehicle_type_caption]')
                .forEach(el => candidates.push(...typeAttrsOf(el)));
            // Uden typeattributter falder vi tilbage til rækkens tekst
            if (candidates.length === 0) candidates.push(norm(row.textContent));

            available.push(Array.from(new Set(candidates)));
        });

        return available;
    }

    function getRequiredAmbulancesFromPatients() {
        const pageText = document.body.textContent || '';
        const match = pageText.match(/(\d+)\s+(?:ubehandlede\s+patienter|untreated\s+patients)/i);
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

                let name = rawName.replace(/^at\s+/gi, '')
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
                name = formatVehicleName(name);
                if (!name) return;

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

        if (patientAmbulances > 0) {
            let amb = Array.from(map.values()).find(e => e.key.includes('ambulance'));
            if (!amb) amb = ensure('Ambulance');
            amb.mandatory = Math.max(amb.mandatory, patientAmbulances);
        }

        const entries = Array.from(map.values());
        entries.forEach(e => e.chances.sort((a, b) => b - a));
        return entries;
    }

    // Fordel sendte og ledige køretøjer på kravene (bedste match først, obligatoriske før valgfrie).
    function allocate(entries, sent, available) {
        entries.forEach(e => {
            e.remMand = e.mandatory;
            e.remOpt = e.chances.slice();
            e.availMatched = 0;
            e.short = 0;
        });

        sent.forEach(cands => {
            let best = null, bestRank = 0;
            entries.forEach(e => {
                if (e.remMand <= 0 && e.remOpt.length === 0) return;
                const score = matchScore(cands, e.name);
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
                let best = null, bestScore = 0;
                entries.forEach(e => {
                    if (e.remMand - e.availMatched <= 0) return;
                    const score = matchScore(cands, e.name);
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

    function renderBox(entries, availableCount, availableKnown) {
        reqBox.innerHTML = '';

        const missing = entries.filter(e => e.remMand > 0 || e.remOpt.length > 0);
        const totalMissing = entries.reduce((s, e) => s + e.remMand, 0);
        const totalShort = entries.reduce((s, e) => s + e.short, 0);

        if (totalMissing === 0) {
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
                    if (item.remMand > 0) {
                        const color = item.short > 0 ? '#d9534f' : '#3c763d';
                        html += `<td style="text-align:right; font-weight:bold; vertical-align: middle; color:${color};">${item.availMatched}</td>`;
                    } else {
                        html += '<td style="text-align:right; vertical-align: middle; color:#999;">–</td>';
                    }
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

        const signature = JSON.stringify([sent, available ? available.map(c => c[0]) : null, patients]);
        if (!force && signature === lastSignature) return;
        lastSignature = signature;

        const entries = buildEntries(requirementRows, patients);
        allocate(entries, sent, available);
        renderBox(entries, available ? available.length : 0, available !== null);
    }

    // ==========================================
    // Hentning af krav (med cache pr. missionstype i denne fane)
    // ==========================================
    const cacheKey = `mcDispatchReq:${VERSION}:${CONFIG.currentLang}:${missionTypeId}`;

    function loadRequirementRows() {
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) return Promise.resolve(parsed);
            }
        } catch (e) { /* ingen cache – hent normalt */ }

        return fetch(`/einsaetze/${encodeURIComponent(missionTypeId)}`, { credentials: 'same-origin' })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(html => {
                const rows = extractRows(html);
                if (rows.length > 0) {
                    try { sessionStorage.setItem(cacheKey, JSON.stringify(rows)); } catch (e) { /* ignorer */ }
                }
                return rows;
            });
    }

    loadRequirementRows()
        .then(rows => {
            reqBox.innerHTML = '';

            // Ingen krav fundet (fx login-side eller ændret HTML) må aldrig vises som "alt er OK"
            if (rows.length === 0) {
                applyState('warn', LANG.labels.noRequirements);
                return;
            }

            requirementRows = rows;
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