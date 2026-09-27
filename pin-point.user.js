// ==UserScript==
// @name        Missionchief building pin planner
// @namespace   https://github.com/notableladybug/Missionchief-dispatch
// @version     1.0
// @description Rent visuelle byggepins for planlagte stationer – klik på kortet eller søg adresse
// @author      Ludvig
// @match       *://*.alarmcentral-spil.dk/*
// @match       *://*.missionchief.com/*
// @match       *://*.missionchief.co.uk/*
// @updateURL   https://raw.githubusercontent.com/notableladybug/Missionchief-dispatch/main/pin-point.user.js
// @downloadURL https://raw.githubusercontent.com/notableladybug/Missionchief-dispatch/main/pin-point.user.js
// @grant       unsafeWindow
// @run-at      document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // ⚙️ Opsætning
    // ==========================================
    const STORAGE_KEY = 'mcBuildPins:v1';
    const MAP_WAIT_TIMEOUT_MS = 20000;
    const MAP_POLL_MS = 300;
    const PANEL_ID = 'mc-buildpins-panel';

    // Kategorier til dine byggepins. Farve er en hex-kode; tilføj/omdøb frit.
    const CATEGORIES = [
        { id: 'fire',   label: 'Brandstation',      color: '#d9534f' },
        { id: 'rescue', label: 'Ambulance/Redning',  color: '#e75480' },
        { id: 'police', label: 'Politistation',      color: '#2b6cb0' },
        { id: 'school', label: 'Uddannelse',         color: '#8e44ad' },
        { id: 'other',  label: 'Andet',              color: '#f0ad4e' }
    ];
    const DEFAULT_CATEGORY = 'other';
    const categoryById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // ==========================================
    // Lager (kun i denne browser, pr. spilserver)
    // ==========================================
    function loadPins() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('[Byggepins] Kunne ikke læse gemte pins:', e);
            return [];
        }
    }

    function savePins(pins) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
        } catch (e) {
            console.error('[Byggepins] Kunne ikke gemme pins:', e);
        }
    }

    function newId() {
        return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // ==========================================
    // Find Leaflet-kortet og L-navnerummet.
    // Missionchief pakker sit eget map-objekt ("xy_map"), men eksponerer normalt
    // stadig den underliggende Leaflet-instans og L, så community-scripts kan bruge dem.
    // ==========================================
    function isLeafletMapLike(obj) {
        return !!obj &&
            typeof obj.addLayer === 'function' &&
            typeof obj.removeLayer === 'function' &&
            typeof obj.getCenter === 'function' &&
            typeof obj.on === 'function' &&
            typeof obj.panTo === 'function';
    }

    function findLeafletMap() {
        const candidates = [
            win.map, win.leafletMap, win.gameMap,
            win.xy_map && win.xy_map.map,
            win.xy_map && win.xy_map._map,
            win.xy_map && win.xy_map.leafletMap
        ];
        for (const c of candidates) {
            if (isLeafletMapLike(c)) return c;
        }
        // Sidste udvej: scan globale variabler for noget, der ligner et Leaflet-kort
        try {
            for (const key of Object.keys(win)) {
                let val;
                try { val = win[key]; } catch (e) { continue; }
                if (isLeafletMapLike(val)) return val;
            }
        } catch (e) { /* ignorer */ }
        return null;
    }

    function getLeafletNamespace(map) {
        if (win.L && typeof win.L.marker === 'function' && typeof win.L.divIcon === 'function') {
            return { marker: win.L.marker, divIcon: win.L.divIcon, limited: false };
        }
        if (win.Leaflet && typeof win.Leaflet.marker === 'function' && typeof win.Leaflet.divIcon === 'function') {
            return { marker: win.Leaflet.marker, divIcon: win.Leaflet.divIcon, limited: false };
        }
        // Sidste udvej: udled Marker-klassen fra et eksisterende lag på kortet.
        // Giver ingen farvede ikoner (L.divIcon kendes ikke), men lader os stadig placere pins.
        let MarkerClass = null;
        try {
            map.eachLayer(function (layer) {
                if (!MarkerClass && layer && typeof layer.setLatLng === 'function' && typeof layer.getLatLng === 'function') {
                    MarkerClass = layer.constructor;
                }
            });
        } catch (e) { /* ignorer */ }
        if (!MarkerClass) return null;
        return {
            marker: (latlng, opts) => new MarkerClass(latlng, opts || {}),
            divIcon: null,
            limited: true
        };
    }

    // ==========================================
    // Ikon pr. kategori
    // ==========================================
    function buildIcon(Lns, category) {
        if (Lns.limited || !Lns.divIcon) return undefined; // brug Leaflets standardikon
        const color = (categoryById[category] || categoryById[DEFAULT_CATEGORY]).color;
        const html = `
            <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg" style="display:block; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45));">
                <path d="M13 0C5.8 0 0 5.8 0 13c0 9 13 21 13 21s13-12 13-21C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
                <circle cx="13" cy="13" r="5" fill="#ffffff"/>
            </svg>`;
        return Lns.divIcon({
            html,
            className: 'mc-buildpin-icon',
            iconSize: [26, 34],
            iconAnchor: [13, 34],
            popupAnchor: [0, -30]
        });
    }

    // ==========================================
    // Hovedopsætning – kører først når kortet er fundet
    // ==========================================
    function init(map) {
        const Lns = getLeafletNamespace(map);
        if (!Lns) {
            showFatalError('Fandt kortet, men ikke Leaflet-biblioteket (L). Kan ikke tegne pins her.');
            return;
        }

        let pins = loadPins();
        const markers = new Map(); // id -> Leaflet marker

        function findPin(id) { return pins.find(p => p.id === id); }

        function persist() { savePins(pins); }

        function removeMarker(id) {
            const m = markers.get(id);
            if (m) { map.removeLayer(m); markers.delete(id); }
        }

        function renderList() {
            const listEl = document.getElementById('mc-bp-list');
            if (!listEl) return;
            listEl.innerHTML = '';
            if (pins.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#888; font-size:12px; padding:6px 2px;';
                empty.textContent = 'Ingen pins endnu.';
                listEl.appendChild(empty);
                return;
            }
            pins.slice().sort((a, b) => a.name.localeCompare(b.name, 'da')).forEach(pin => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:4px 2px; border-bottom:1px solid #eee; font-size:12px;';

                const dot = document.createElement('span');
                dot.style.cssText = `width:10px; height:10px; border-radius:50%; background:${(categoryById[pin.category] || categoryById[DEFAULT_CATEGORY]).color}; flex:0 0 auto;`;
                row.appendChild(dot);

                const name = document.createElement('span');
                name.textContent = pin.name || 'Ny pin';
                name.style.cssText = 'flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;';
                name.title = 'Klik for at centrere og åbne';
                name.addEventListener('click', () => {
                    map.panTo(marker(pin).getLatLng ? marker(pin).getLatLng() : [pin.lat, pin.lng]);
                    map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 14));
                    const m = markers.get(pin.id);
                    if (m) m.openPopup();
                });
                row.appendChild(name);

                const zoomBtn = smallBtn('🎯', 'Centrér på kortet', () => {
                    map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 14));
                });
                row.appendChild(zoomBtn);

                const delBtn = smallBtn('🗑', 'Slet pin', () => {
                    if (!confirm(`Slet pin "${pin.name || 'Ny pin'}"?`)) return;
                    pins = pins.filter(p => p.id !== pin.id);
                    removeMarker(pin.id);
                    persist();
                    renderList();
                });
                row.appendChild(delBtn);

                listEl.appendChild(row);
            });
        }

        function smallBtn(text, title, onClick) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.title = title;
            b.style.cssText = 'border:none; background:transparent; cursor:pointer; font-size:13px; padding:2px 4px; flex:0 0 auto;';
            b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
            return b;
        }

        function marker(pin) { return markers.get(pin.id); }

        function buildPopupContent(pin, editMode) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'min-width:190px; font-size:13px;';

            if (!editMode) {
                const title = document.createElement('div');
                title.style.cssText = 'font-weight:bold; margin-bottom:2px;';
                title.textContent = pin.name || 'Ny pin';
                wrap.appendChild(title);

                const cat = document.createElement('div');
                cat.style.cssText = 'display:flex; align-items:center; gap:5px; color:#555; margin-bottom:4px;';
                const catInfo = categoryById[pin.category] || categoryById[DEFAULT_CATEGORY];
                cat.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;background:${catInfo.color};display:inline-block;"></span><span>${catInfo.label}</span>`;
                wrap.appendChild(cat);

                if (pin.note) {
                    const note = document.createElement('div');
                    note.style.cssText = 'color:#666; margin-bottom:6px; white-space:pre-wrap;';
                    note.textContent = pin.note;
                    wrap.appendChild(note);
                }

                const row = document.createElement('div');
                row.style.cssText = 'display:flex; gap:8px; margin-top:4px;';

                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.textContent = '✏ Redigér';
                editBtn.style.cssText = smallActionBtnStyle();
                editBtn.addEventListener('click', () => {
                    const m = markers.get(pin.id);
                    if (m) m.setPopupContent(buildPopupContent(pin, true));
                });
                row.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.textContent = '🗑 Slet';
                delBtn.style.cssText = smallActionBtnStyle();
                delBtn.addEventListener('click', () => {
                    if (!confirm(`Slet pin "${pin.name || 'Ny pin'}"?`)) return;
                    pins = pins.filter(p => p.id !== pin.id);
                    removeMarker(pin.id);
                    persist();
                    renderList();
                });
                row.appendChild(delBtn);

                wrap.appendChild(row);
                return wrap;
            }

            // --- Redigeringstilstand ---
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = pin.name || '';
            nameInput.placeholder = 'Navn (fx "Ny brandstation, Nord")';
            nameInput.style.cssText = 'width:100%; box-sizing:border-box; margin-bottom:5px; padding:3px 5px;';
            wrap.appendChild(nameInput);

            const catSelect = document.createElement('select');
            catSelect.style.cssText = 'width:100%; box-sizing:border-box; margin-bottom:5px; padding:3px;';
            CATEGORIES.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.label;
                if (c.id === pin.category) opt.selected = true;
                catSelect.appendChild(opt);
            });
            wrap.appendChild(catSelect);

            const noteInput = document.createElement('textarea');
            noteInput.value = pin.note || '';
            noteInput.placeholder = 'Note (valgfri)';
            noteInput.rows = 2;
            noteInput.style.cssText = 'width:100%; box-sizing:border-box; margin-bottom:6px; padding:3px 5px; resize:vertical;';
            wrap.appendChild(noteInput);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:8px;';

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.textContent = '💾 Gem';
            saveBtn.style.cssText = smallActionBtnStyle('#5cb85c');
            saveBtn.addEventListener('click', () => {
                pin.name = nameInput.value.trim() || 'Ny pin';
                pin.category = catSelect.value;
                pin.note = noteInput.value.trim();
                persist();
                const m = markers.get(pin.id);
                if (m) {
                    m.setIcon(buildIcon(Lns, pin.category) || m.getIcon());
                    m.setPopupContent(buildPopupContent(pin, false));
                }
                renderList();
            });
            row.appendChild(saveBtn);

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Annullér';
            cancelBtn.style.cssText = smallActionBtnStyle();
            cancelBtn.addEventListener('click', () => {
                const m = markers.get(pin.id);
                if (m) m.setPopupContent(buildPopupContent(pin, false));
            });
            row.appendChild(cancelBtn);

            wrap.appendChild(row);

            setTimeout(() => nameInput.focus(), 0);
            return wrap;
        }

        function smallActionBtnStyle(bg) {
            return `border:none; border-radius:3px; background:${bg || '#eee'}; color:${bg ? '#fff' : '#333'}; cursor:pointer; font-size:12px; padding:3px 8px;`;
        }

        function addMarkerForPin(pin, openEdit) {
            const m = Lns.marker([pin.lat, pin.lng], {
                draggable: true,
                icon: buildIcon(Lns, pin.category)
            });
            m.bindPopup(buildPopupContent(pin, !!openEdit));
            m.on('dragend', () => {
                const ll = m.getLatLng();
                pin.lat = ll.lat;
                pin.lng = ll.lng;
                persist();
            });
            m.addTo(map);
            markers.set(pin.id, m);
            if (openEdit) m.openPopup();
        }

        function createPinAt(lat, lng, name) {
            const pin = { id: newId(), lat, lng, name: name || 'Ny pin', category: DEFAULT_CATEGORY, note: '' };
            pins.push(pin);
            persist();
            addMarkerForPin(pin, true);
            renderList();
            return pin;
        }

        // Genindlæs eksisterende pins
        pins.forEach(pin => addMarkerForPin(pin, false));

        // --- Placeringstilstand (klik på kortet) ---
        let placing = false;
        function setPlacing(on) {
            placing = on;
            map.getContainer().style.cursor = on ? 'crosshair' : '';
            const hint = document.getElementById('mc-bp-hint');
            if (hint) hint.style.display = on ? 'block' : 'none';
            const btn = document.getElementById('mc-bp-add-btn');
            if (btn) btn.textContent = on ? '✖ Annullér' : '+ Tilføj pin';
        }

        function onMapClick(e) {
            if (!placing) return;
            setPlacing(false);
            createPinAt(e.latlng.lat, e.latlng.lng);
        }
        map.on('click', onMapClick);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && placing) setPlacing(false);
        });

        // --- Adressesøgning (Nominatim / OpenStreetMap) ---
        async function searchAddress(query) {
            const resultsEl = document.getElementById('mc-bp-search-results');
            resultsEl.innerHTML = '<div style="color:#888; font-size:12px; padding:4px 2px;">Søger…</div>';
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                resultsEl.innerHTML = '';
                if (!Array.isArray(data) || data.length === 0) {
                    resultsEl.innerHTML = '<div style="color:#888; font-size:12px; padding:4px 2px;">Ingen resultater.</div>';
                    return;
                }
                data.forEach(item => {
                    const row = document.createElement('div');
                    row.textContent = item.display_name;
                    row.style.cssText = 'font-size:12px; padding:5px 4px; border-bottom:1px solid #eee; cursor:pointer;';
                    row.addEventListener('mouseenter', () => row.style.background = '#f0f0f0');
                    row.addEventListener('mouseleave', () => row.style.background = '');
                    row.addEventListener('click', () => {
                        const lat = parseFloat(item.lat);
                        const lng = parseFloat(item.lon);
                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                        map.setView([lat, lng], Math.max(map.getZoom(), 15));
                        const shortName = item.display_name.split(',')[0];
                        createPinAt(lat, lng, shortName);
                        resultsEl.innerHTML = '';
                        document.getElementById('mc-bp-search-input').value = '';
                    });
                    resultsEl.appendChild(row);
                });
            } catch (err) {
                resultsEl.innerHTML = '<div style="color:#d9534f; font-size:12px; padding:4px 2px;">Søgning fejlede. Prøv igen.</div>';
                console.error('[Byggepins] Adressesøgning fejlede:', err);
            }
        }

        // ==========================================
        // Panel-UI
        // ==========================================
        buildPanel({ onAddToggle: () => setPlacing(!placing), onSearch: searchAddress });
        renderList();

        function buildPanel(handlers) {
            const old = document.getElementById(PANEL_ID);
            if (old) old.remove();

            const panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.style.cssText = `
                position: fixed; top: 70px; right: 12px; width: 250px; max-height: 70vh;
                background: #fff; border: 1px solid #ccc; border-radius: 6px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.25); z-index: 1200;
                font-family: Arial, Helvetica, sans-serif; display: flex; flex-direction: column;
                overflow: hidden;
            `;

            const header = document.createElement('div');
            header.style.cssText = 'background:#337ab7; color:#fff; padding:8px 10px; font-weight:bold; font-size:13px; display:flex; justify-content:space-between; align-items:center;';
            header.innerHTML = '<span>📍 Byggeplan</span>';
            const collapseBtn = document.createElement('button');
            collapseBtn.type = 'button';
            collapseBtn.textContent = '—';
            collapseBtn.title = 'Minimér';
            collapseBtn.style.cssText = 'border:none; background:transparent; color:#fff; cursor:pointer; font-size:14px;';
            header.appendChild(collapseBtn);
            panel.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = 'padding:10px; overflow-y:auto;';
            panel.appendChild(body);

            collapseBtn.addEventListener('click', () => {
                const hidden = body.style.display === 'none';
                body.style.display = hidden ? 'block' : 'none';
                collapseBtn.textContent = hidden ? '—' : '+';
            });

            const addBtn = document.createElement('button');
            addBtn.id = 'mc-bp-add-btn';
            addBtn.type = 'button';
            addBtn.textContent = '+ Tilføj pin';
            addBtn.style.cssText = 'width:100%; padding:6px; margin-bottom:6px; border:none; border-radius:4px; background:#5cb85c; color:#fff; font-weight:bold; cursor:pointer;';
            addBtn.addEventListener('click', handlers.onAddToggle);
            body.appendChild(addBtn);

            const hint = document.createElement('div');
            hint.id = 'mc-bp-hint';
            hint.style.cssText = 'display:none; font-size:11px; color:#555; background:#fcf8e3; border:1px solid #f0ad4e; border-radius:3px; padding:4px 6px; margin-bottom:6px;';
            hint.textContent = 'Klik på kortet for at placere pin\'en (Esc for at annullere).';
            body.appendChild(hint);

            const searchWrap = document.createElement('div');
            searchWrap.style.cssText = 'display:flex; gap:4px; margin-bottom:2px;';
            const searchInput = document.createElement('input');
            searchInput.id = 'mc-bp-search-input';
            searchInput.type = 'text';
            searchInput.placeholder = 'Søg adresse…';
            searchInput.style.cssText = 'flex:1 1 auto; padding:4px 6px; border:1px solid #ccc; border-radius:3px;';
            const searchBtn = document.createElement('button');
            searchBtn.type = 'button';
            searchBtn.textContent = '🔎';
            searchBtn.style.cssText = 'border:1px solid #ccc; background:#f5f5f5; border-radius:3px; cursor:pointer; padding:0 8px;';
            const doSearch = () => {
                const q = searchInput.value.trim();
                if (q.length >= 3) handlers.onSearch(q);
            };
            searchBtn.addEventListener('click', doSearch);
            searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
            searchWrap.appendChild(searchInput);
            searchWrap.appendChild(searchBtn);
            body.appendChild(searchWrap);

            const searchResults = document.createElement('div');
            searchResults.id = 'mc-bp-search-results';
            searchResults.style.cssText = 'max-height:140px; overflow-y:auto; margin-bottom:8px;';
            body.appendChild(searchResults);

            const legend = document.createElement('div');
            legend.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; font-size:11px; color:#555; margin-bottom:6px;';
            CATEGORIES.forEach(c => {
                const item = document.createElement('span');
                item.style.cssText = 'display:flex; align-items:center; gap:3px;';
                item.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c.color};display:inline-block;"></span>${c.label}`;
                legend.appendChild(item);
            });
            body.appendChild(legend);

            const hr = document.createElement('hr');
            hr.style.cssText = 'border:none; border-top:1px solid #eee; margin:4px 0 8px;';
            body.appendChild(hr);

            const list = document.createElement('div');
            list.id = 'mc-bp-list';
            body.appendChild(list);

            const hr2 = document.createElement('hr');
            hr2.style.cssText = 'border:none; border-top:1px solid #eee; margin:8px 0;';
            body.appendChild(hr2);

            const ioRow = document.createElement('div');
            ioRow.style.cssText = 'display:flex; gap:6px;';

            const exportBtn = document.createElement('button');
            exportBtn.type = 'button';
            exportBtn.textContent = '⬇ Eksportér';
            exportBtn.style.cssText = 'flex:1 1 auto; font-size:11px; padding:4px; border:1px solid #ccc; border-radius:3px; background:#f5f5f5; cursor:pointer;';
            exportBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(pins, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'missionchief-byggepins.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
            });
            ioRow.appendChild(exportBtn);

            const importBtn = document.createElement('button');
            importBtn.type = 'button';
            importBtn.textContent = '⬆ Importér';
            importBtn.style.cssText = 'flex:1 1 auto; font-size:11px; padding:4px; border:1px solid #ccc; border-radius:3px; background:#f5f5f5; cursor:pointer;';
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'application/json';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const imported = JSON.parse(reader.result);
                        if (!Array.isArray(imported)) throw new Error('Ikke en liste');
                        const byId = new Map(pins.map(p => [p.id, p]));
                        imported.forEach(p => {
                            if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
                                byId.set(p.id || newId(), {
                                    id: p.id || newId(), lat: p.lat, lng: p.lng,
                                    name: p.name || 'Ny pin', category: categoryById[p.category] ? p.category : DEFAULT_CATEGORY,
                                    note: p.note || ''
                                });
                            }
                        });
                        pins.forEach(p => removeMarker(p.id));
                        pins = Array.from(byId.values());
                        persist();
                        pins.forEach(p => addMarkerForPin(p, false));
                        renderList();
                    } catch (err) {
                        alert('Kunne ikke importere filen: ' + err.message);
                    }
                };
                reader.readAsText(file);
                fileInput.value = '';
            });
            importBtn.addEventListener('click', () => fileInput.click());
            ioRow.appendChild(importBtn);
            ioRow.appendChild(fileInput);

            body.appendChild(ioRow);

            document.body.appendChild(panel);
        }

        window.mcBuildPinsDebug = { map, Lns, pins, markers };
    }

    function showFatalError(message) {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; top: 70px; right: 12px; max-width: 260px;
            background: #fdf2f2; border: 1px solid #d9534f; color: #a94442;
            border-radius: 6px; padding: 10px; font-size: 12px; z-index: 1200;
            font-family: Arial, Helvetica, sans-serif;
        `;
        el.textContent = '⚠ Byggepins: ' + message + ' (se konsollen, F12)';
        document.body.appendChild(el);
    }

    // ==========================================
    // Vent på at kortet findes, så prøv init
    // ==========================================
    function start() {
        if (!document.getElementById('map')) return; // kun relevant på sider med et kort

        const startedAt = Date.now();
        const timer = setInterval(() => {
            const map = findLeafletMap();
            if (map) {
                clearInterval(timer);
                init(map);
                return;
            }
            if (Date.now() - startedAt > MAP_WAIT_TIMEOUT_MS) {
                clearInterval(timer);
                showFatalError('Kunne ikke finde spillets kort-objekt.');
            }
        }, MAP_POLL_MS);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();