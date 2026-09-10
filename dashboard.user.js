// ==UserScript==
// @name        Missionchief dispatch overview
// @namespace   https://github.com/notableladybug/Missionchief-dispatch
// @version     2.33
// @description A missionchief dispatch helper
// @author      Ludvig
// @match       *://*.alarmcentral-spil.dk/missions/*
// @match       *://*.missionchief.com/missions/*
// @match       *://*.missionchief.co.uk/missions/*
// @updateURL   https://raw.githubusercontent.com/notableladybug/Missionchief-dispatch/main/dashboard.user.js
// @downloadURL https://raw.githubusercontent.com/notableladybug/Missionchief-dispatch/main/dashboard.user.js
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // ⚙️ CONFIGURATION & SPROGLAG (i18n)
    // ==========================================
    const CONFIG = {
        currentLang: window.location.hostname.endsWith('.dk') ? 'da' : 'en',

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
                    'patient', 'patienttransport', 'pumpekapacitet', 'vandmængde', 'liter', 'kreditter', 'fanger', 'station', 'stationer', 'bygning', 'bygninger', 'Varighed', 'Nødvendigt personale'
                ],
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
                    'Påkrævet politibil eller fangetransport': 'Påkrævet politibil'
                },
                labels: {
                    loading: 'Henter og beregner manglende køretøjer...',
                    allGood: '✔ Alt nødvendigt udstyr er på ulykkesstedet / på vej!',
                    ready: (avail, req) => `✔ KLAR: Du har ${avail} ledige enheder (kræver ${req})`,
                    missing: (avail) => `✖ MANGLER KØRETØJER: Du har kun ${avail} enhed(er) til rådighed!`,
                    tableHeaderReq: 'Mangler på skadestedet',
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
                    'patient', 'patient transport', 'pump capacity', 'water volume', 'liters', 'gallons', 'credits', 'prisoners', 'personnel', 'station', 'stations', 'building', 'buildings'
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
                    missing: (avail) => `✖ MISSING VEHICLES: You only have ${avail} unit(s) available!`,
                    tableHeaderReq: 'Missing on scene',
                    tableHeaderCount: 'Count',
                    errorMsg: 'Could not fetch mission requirements. Please refresh the page.'
                }
            }
        }
    };

    const LANG = CONFIG.i18n[CONFIG.currentLang] || CONFIG.i18n.en;

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
    reqBox.style.backgroundColor = '#fdf2f2';
    reqBox.style.border = '1px solid #d9534f';
    reqBox.style.borderRadius = '4px';
    reqBox.innerHTML = `<strong>${LANG.labels.loading} <span class="glyphicon glyphicon-refresh spinning"></span></strong>`;

    const vehicleList = document.getElementById('vehicle_list_step');
    if (vehicleList) {
        vehicleList.parentNode.insertBefore(reqBox, vehicleList);
    } else {
        const colLeft = document.getElementById('col_left');
        if (colLeft) colLeft.prepend(reqBox);
    }

    function getCategory(vehicleName) {
        const name = vehicleName.toLowerCase();

        for (const [category, keywords] of Object.entries(LANG.categories)) {
            for (const keyword of keywords) {
                if (name.includes(keyword)) {
                    return category;
                }
            }
        }
        return LANG.defaultCategory;
    }

    function formatVehicleName(name) {
        const lower = name.toLowerCase();
        for (const [key, replacement] of Object.entries(LANG.nameReplacements)) {
            if (lower === key || lower.includes(key)) return replacement;
        }
        return name;
    }

    function getProbabilityBadge(percentage) {
        let color = '#f0ad4e';
        if (percentage >= 70) color = '#d9534f';
        else if (percentage < 35) color = '#777';

        return `<span style="background-color: ${color}; color: #fff; padding: 2px 7px; border-radius: 10px; font-size: 11px; margin-left: 8px; font-weight: bold; display: inline-block;">🎲 ${percentage}% chance</span>`;
    }

    function isMatchingVehicle(sentName, reqName) {
        const s = sentName.toLowerCase();
        const r = reqName.toLowerCase();

        for (const [sentKey, reqValues] of Object.entries(LANG.customMatches)) {
            if (s.includes(sentKey) || sentKey.includes(s)) {
                if (reqValues.some(val => r.includes(val) || val.includes(r))) return true;
            }
        }

        return s.includes(r) || r.includes(s);
    }

    function getSentVehicles() {
        const sent = [];
        const tables = document.querySelectorAll('table');

        tables.forEach(table => {
            const headText = table.textContent || '';
            if ((headText.includes('Køretøj') || headText.includes('Vehicle')) && 
                (headText.includes('Station') || headText.includes('Building'))) {
                const rows = table.querySelectorAll('tbody tr, tr');
                rows.forEach(row => {
                    if (row.querySelector('th')) return;
                    if (row.cells && row.cells.length >= 1) {
                        const cellText = row.cells[0].textContent.trim();
                        if (cellText && !cellText.includes('Annullér') && !cellText.includes('Cancel')) {
                            sent.push(cellText);
                        }
                    }
                });
            }
        });

        return sent;
    }

    function getAvailableVehiclesCount() {
        let total = 0;
        const rows = document.querySelectorAll('tr.vehicle_rel, #vehicle_show_table_body_all tr, tr[id^="vehicle_row"]');
        rows.forEach(r => {
            if (r.style.display !== 'none') total++;
        });
        return total;
    }

    function getRequiredAmbulancesFromPatients() {
        const pageText = document.body.textContent || '';
        const match = pageText.match(/(\d+)\s+(?:ubehandlede\s+patienter|untreated\s+patients)/i);
        if (match) {
            return parseInt(match[1], 10);
        }
        return 0;
    }

    fetch(`/einsaetze/${missionTypeId}`)
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const tables = doc.querySelectorAll('table');
            const rawExtracted = [];

            tables.forEach(table => {
                const rows = table.querySelectorAll('tbody tr, tr');
                rows.forEach(row => {
                    if (row.cells.length >= 2) {
                        let nameText = row.cells[0].textContent.trim();
                        let countText = row.cells[1].textContent.trim();
                        const lowerName = nameText.toLowerCase();

                        if (lowerName.includes('patienttransport') || lowerName.includes('patient transport')) {
                            return;
                        }

                        if (LANG.excludeKeywords.some(keyword => lowerName.includes(keyword))) {
                            return;
                        }

                        let isProbability = lowerName.includes('sandsynlighed') || 
                                            lowerName.includes('chance') || 
                                            countText.includes('%') ||
                                            lowerName.includes('nødvendighed');
                        let chanceValue = null;

                        if (isProbability) {
                            const match = countText.match(/\d+/) || nameText.match(/\d+/);
                            if (match) chanceValue = parseInt(match[0], 10);
                        }

                        nameText = nameText.replace(/^at\s+/gi, '')
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
                                           .trim();

                        nameText = formatVehicleName(nameText);
                        let countVal = parseInt(countText.replace(/\D/g, ''), 10);

                        if (nameText && (!isNaN(countVal) || isProbability)) {
                            rawExtracted.push({
                                name: nameText,
                                count: isProbability ? 1 : countVal,
                                chance: chanceValue,
                                category: getCategory(nameText)
                            });
                        }
                    }
                });
            });

            const extractedVehicles = [];
            rawExtracted.forEach(item => {
                let existing = extractedVehicles.find(v => isMatchingVehicle(v.name, item.name));
                if (existing) {
                    if (item.chance === null && existing.chance !== null) {
                        existing.chance = null;
                        existing.count = item.count;
                    } else if (item.chance === null && existing.chance === null) {
                        existing.count = Math.max(existing.count, item.count);
                    }
                } else {
                    extractedVehicles.push(item);
                }
            });

            const requiredPatientAmbulances = getRequiredAmbulancesFromPatients();
            if (requiredPatientAmbulances > 0) {
                const ambulanceName = CONFIG.currentLang === 'da' ? 'Ambulance' : 'Ambulance';
                const existingAmbulanceReq = extractedVehicles.find(v => v.name.toLowerCase().includes('ambulance'));
                if (existingAmbulanceReq) {
                    if (existingAmbulanceReq.count < requiredPatientAmbulances) {
                        existingAmbulanceReq.count = requiredPatientAmbulances;
                    }
                } else {
                    extractedVehicles.push({
                        name: ambulanceName,
                        count: requiredPatientAmbulances,
                        chance: null,
                        category: getCategory(ambulanceName)
                    });
                }
            }

            const sentVehicles = getSentVehicles();
            const usedSentIndexes = new Set();
            let totalMissingVehicles = 0;

            extractedVehicles.forEach(req => {
                let currentReqCount = req.count;

                sentVehicles.forEach((sentName, idx) => {
                    if (!usedSentIndexes.has(idx) && currentReqCount > 0) {
                        if (isMatchingVehicle(sentName, req.name)) {
                            currentReqCount--;
                            usedSentIndexes.add(idx);
                        }
                    }
                });

                req.missingCount = currentReqCount;
                if (req.chance === null) {
                    totalMissingVehicles += currentReqCount;
                }
            });

            const missingVehicles = extractedVehicles.filter(item => item.missingCount > 0);

            // Sammenlign og flet dubletter på tværs af procenter vha. gamle logik-struktur
            const mergedMap = {};
            missingVehicles.forEach(item => {
                let normKey = item.name.toLowerCase().trim();
                
                if (!mergedMap[normKey]) {
                    mergedMap[normKey] = {
                        name: item.name,
                        category: item.category,
                        mandatoryMissing: 0,
                        optionalMissing: 0,
                        chances: []
                    };
                }

                if (item.chance !== null) {
                    mergedMap[normKey].optionalMissing += item.missingCount;
                    mergedMap[normKey].chances.push(item.chance);
                } else {
                    mergedMap[normKey].mandatoryMissing += item.missingCount;
                }
            });

            reqBox.innerHTML = '';

            const badge = document.createElement('div');
            badge.style.display = 'inline-block';
            badge.style.padding = '6px 14px';
            badge.style.borderRadius = '20px';
            badge.style.fontWeight = 'bold';
            badge.style.fontSize = '13px';
            badge.style.marginBottom = '12px';
            badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            reqBox.appendChild(badge);

            const availableCount = getAvailableVehiclesCount();
            const mergedList = Object.values(mergedMap);

            if (mergedList.length === 0) {
                badge.style.backgroundColor = '#5cb85c';
                badge.style.color = '#fff';
                badge.innerHTML = LANG.labels.allGood;
                reqBox.style.borderColor = '#5cb85c';
                reqBox.style.backgroundColor = '#dff0d8';
                return;
            }

            if (availableCount >= totalMissingVehicles) {
                badge.style.backgroundColor = '#5cb85c';
                badge.style.color = '#fff';
                badge.innerHTML = LANG.labels.ready(availableCount, totalMissingVehicles);
                reqBox.style.borderColor = '#5cb85c';
                reqBox.style.backgroundColor = '#f4fbf7';
            } else {
                badge.style.backgroundColor = '#d9534f';
                badge.style.color = '#fff';
                badge.innerHTML = LANG.labels.missing(availableCount);
                reqBox.style.borderColor = '#d9534f';
                reqBox.style.backgroundColor = '#fdf2f2';
            }

            const grouped = {};
            mergedList.forEach(item => {
                if (!grouped[item.category]) grouped[item.category] = [];
                grouped[item.category].push(item);
            });

            const cleanTable = document.createElement('table');
            cleanTable.className = 'table table-striped table-condensed';
            cleanTable.style.backgroundColor = '#fff';
            cleanTable.style.marginBottom = '0';
            cleanTable.style.border = '1px solid #ddd';

            let tableHTML = `<thead><tr style="background:#f5f5f5;"><th>${LANG.labels.tableHeaderReq}</th><th style="width:140px; text-align:right;">${LANG.labels.tableHeaderCount}</th></tr></thead><tbody>`;

            const categoryOrder = [...Object.keys(LANG.categories), LANG.defaultCategory];

            categoryOrder.forEach(cat => {
                if (grouped[cat] && grouped[cat].length > 0) {
                    tableHTML += `<tr style="background-color: #e9ecef; font-weight: bold;"><td colspan="2" style="color: #333;">${cat}</td></tr>`;
                    grouped[cat].forEach(item => {
                        const chanceBadge = item.chances.length > 0 ? getProbabilityBadge(item.chances[0]) : '';
                        const displayCount = item.mandatoryMissing > 0 ? item.mandatoryMissing : item.optionalMissing;

                        tableHTML += `<tr><td style="padding-left: 20px; vertical-align: middle;">${item.name}${chanceBadge}</td><td style="text-align:right; font-weight:bold; vertical-align: middle;">${displayCount}</td></tr>`;
                    });
                }
            });

            tableHTML += '</tbody>';
            cleanTable.innerHTML = tableHTML;
            reqBox.appendChild(cleanTable);
        })
        .catch(err => {
            reqBox.innerHTML = `<strong style="color:red;">${LANG.labels.errorMsg}</strong>`;
            console.error('Fejl ved hentning af missionskrav:', err);
        });
})();
