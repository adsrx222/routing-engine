let map, router, Module, graph;
let startNodeId = null;
let goalNodeId = null;
let mapLayers = [];    
let routeLayers = [];  
let nodeCoordinates = [];
let audioCtx = null;
let masterCompressor = null; 
let currentRunId = 0;   
let activeTones = [];   

const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 500;
const SEARCH_BATCH_DELAY_MS = 1; 
const PATH_STEP_MS = 15;                
const PATH_NOTE_DURATION_S = 0.15;      
const PATH_FINAL_NOTE_DURATION_S = 1.5; 

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await initWASM();
});

function initMap() {
    map = L.map('map').setView([38.9072, -77.0369], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2kwn_1_559d5ae6425970565c24eb3d', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    map.on('click', (e) => {
        if (nodeCoordinates.length === 0) return; 
        handleMapClick(e.latlng);
    });

    document.getElementById('route-btn').addEventListener('click', runRouting);
    document.getElementById('reset-btn').addEventListener('click', resetUI);
    
    const algoSelect = document.getElementById('algo-select');
    if (algoSelect) {
        algoSelect.addEventListener('change', () => {
            currentRunId++;
            stopAllTones();
            
            clearRouteLayers();
            
            document.getElementById('distance-box').style.display = 'none';
            
            if (startNodeId !== null && goalNodeId !== null) {
                document.getElementById('route-btn').disabled = false;
            }
        });
    }
    
    const citySelect = document.getElementById('city-select');
    if (citySelect) {
        citySelect.addEventListener('change', async (e) => {
            resetUI();
            await loadCityGraph(e.target.value);
        });
    }

    initSpeedControl();
}

function initSpeedControl() {
    const slider = document.getElementById('speed-slider');
    const valueLabel = document.getElementById('speed-value');
    if (!slider) return;

    slider.min = MIN_BATCH_SIZE;
    slider.max = MAX_BATCH_SIZE;
    slider.value = DEFAULT_BATCH_SIZE;
    if (valueLabel) valueLabel.textContent = slider.value;

    slider.addEventListener('input', () => {
        if (valueLabel) valueLabel.textContent = slider.value;
    });
}

function showSnackbar(message) {
    const snackbar = document.getElementById("snackbar");
    if (!snackbar) return;
    snackbar.textContent = message;
    snackbar.className = "show";
    setTimeout(() => { snackbar.className = snackbar.className.replace("show", ""); }, 4000);
}

async function initWASM() {
    try {
        Module = await PathfinderModule({
            locateFile: (path) => {
                if (path === 'pathfinder.wasm') {
                    return 'dist/pathfinder.wasm';
                }
                return path;
            }
        });
        
        const initialCity = document.getElementById('city-select')?.value || 'dc';
        await loadCityGraph(initialCity); 
    } catch (err) {
        console.error("Initialization Failed:", err);
        document.getElementById('node-count').innerText = 'WASM / Data Load Failed.';
        document.getElementById('status-square').className = 'status-indicator error';
        showSnackbar('Failed to initialize WASM engine.');
    }
}

async function fetchGraphBuffer(cityName) {
    const candidatePaths = [
        `graphs/${cityName}_graph.bin`,
        `./graphs/${cityName}_graph.bin`,
        `/graphs/${cityName}_graph.bin`,
        `web/graphs/${cityName}_graph.bin`,
        `/web/graphs/${cityName}_graph.bin`
    ];

    for (const path of candidatePaths) {
        try {
            const response = await fetch(path);
            if (response.ok) {
                return await response.arrayBuffer();
            }
        } catch (e) {}
    }
    throw new Error(`Graph binary for city "${cityName}" not found.`);
}

async function loadCityGraph(cityName) {
    const nodeCountEl = document.getElementById('node-count');
    const statusSquare = document.getElementById('status-square');
    
    if (nodeCountEl) nodeCountEl.innerText = `Loading ${cityName.toUpperCase()} data...`;
    if (statusSquare) statusSquare.className = 'status-indicator';
    
    if (router) { router.delete(); router = null; }
    if (graph) { graph.delete(); graph = null; }
    
    nodeCoordinates = [];
    
    try {
        const buffer = await fetchGraphBuffer(cityName);
        const dataView = new DataView(buffer);
        const nodeCount = dataView.getUint32(8, true); 
        
        const HEADER_SIZE = 16;
        const NODE_SIZE = 40; 
        
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

        for (let i = 0; i < nodeCount; i++) {
            const offset = HEADER_SIZE + (i * NODE_SIZE);
            const lat = dataView.getFloat64(offset + 8, true); 
            const lon = dataView.getFloat64(offset + 16, true); 
            nodeCoordinates.push([lat, lon]);
            
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLng) minLng = lon;
            if (lon > maxLng) maxLng = lon;
        }

        if (nodeCount === 0 || !Number.isFinite(minLat)) {
            throw new Error(`Invalid graph data for ${cityName}`);
        }
        
        try { Module.FS.unlink('/graph.bin'); } catch (e) {}
        Module.FS.writeFile('/graph.bin', new Uint8Array(buffer));
        
        graph = Module.GraphLoader.load('/graph.bin');
        router = new Module.Router(graph);
        
        const bounds = [[minLat, minLng], [maxLat, maxLng]];
        const cityBounds = L.latLngBounds(bounds);
        
        const restrictedBounds = cityBounds.pad(0.3);

        map.setMaxBounds(restrictedBounds);
        
        map.options.maxBoundsViscosity = 1.0;

        map.fitBounds(cityBounds, { padding: [50, 50] });

        const cityZoomLevel = map.getBoundsZoom(cityBounds);
        map.setMinZoom(Math.max(1, cityZoomLevel - 1));

        if (nodeCountEl) {
            nodeCountEl.innerText = `${nodeCount.toLocaleString()} nodes`;
            if (statusSquare) statusSquare.className = 'status-indicator ready';
        }
    } catch (err) {
        console.error("Graph Load Failed:", err);
        if (nodeCountEl) {
            nodeCountEl.innerText = 'Data Load Failed.';
            if (statusSquare) statusSquare.className = 'status-indicator error';
        }
        showSnackbar(`Error loading map data for ${cityName.toUpperCase()}. Ensure local web server is running.`);
    }
}

function findNearestNode(lat, lon) {
    let minDist = Infinity;
    let nearestId = -1;
    for (let i = 0; i < nodeCoordinates.length; i++) {
        const [nLat, nLon] = nodeCoordinates[i];
        const dist = Math.pow(nLat - lat, 2) + Math.pow(nLon - lon, 2);
        if (dist < minDist) {
            minDist = dist;
            nearestId = i;
        }
    }
    return nearestId;
}

function handleMapClick(latlng) {
    const nodeId = findNearestNode(latlng.lat, latlng.lng);
    const coords = nodeCoordinates[nodeId];

    if (startNodeId === null) {
        startNodeId = nodeId;
        document.getElementById('start-node').innerText = nodeId;
        document.getElementById('start-coords').innerText = `[${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}]`;
        const marker = L.circleMarker(coords, { radius: 8, color: '#00ff00', fillOpacity: 1 }).addTo(map);
        mapLayers.push(marker);
    } else if (goalNodeId === null && nodeId !== startNodeId) {
        goalNodeId = nodeId;
        document.getElementById('goal-node').innerText = nodeId;
        document.getElementById('goal-coords').innerText = `[${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}]`;
        const marker = L.circleMarker(coords, { radius: 8, color: '#ff3333', fillOpacity: 1 }).addTo(map);
        mapLayers.push(marker);
        document.getElementById('route-btn').disabled = false;
    }
}

function resetUI() {
    currentRunId++;
    stopAllTones();

    startNodeId = null;
    goalNodeId = null;
    document.getElementById('start-node').innerText = 'None';
    document.getElementById('goal-node').innerText = 'None';
    document.getElementById('start-coords').innerText = '';
    document.getElementById('goal-coords').innerText = '';
    document.getElementById('route-btn').disabled = true;
    document.getElementById('distance-box').style.display = 'none';
    
    mapLayers.forEach(layer => map.removeLayer(layer));
    mapLayers = [];
    clearRouteLayers();
}

function clearRouteLayers() {
    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];
}

function getEnumVal(enumObj) {
    return (enumObj !== null && typeof enumObj === 'object' && enumObj.value !== undefined) 
        ? enumObj.value : enumObj;
}

function getVectorCount(vec) {
    if (!vec) return 0;
    return Array.isArray(vec) ? vec.length : vec.size();
}

function getBatchSize() {
    const slider = document.getElementById('speed-slider');
    const value = slider ? parseInt(slider.value, 10) : DEFAULT_BATCH_SIZE;
    if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
    return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, value));
}

function calculateDistance(pathVector) {
    let totalDistance = 0;
    const count = getVectorCount(pathVector);
    const isArray = Array.isArray(pathVector);
    
    for (let i = 0; i < count - 1; i++) {
        const id1 = isArray ? pathVector[i] : pathVector.get(i);
        const id2 = isArray ? pathVector[i + 1] : pathVector.get(i + 1);
        const p1 = L.latLng(nodeCoordinates[id1]);
        const p2 = L.latLng(nodeCoordinates[id2]);
        totalDistance += map.distance(p1, p2); 
    }
    
    return {
        km: (totalDistance / 1000).toFixed(1),
        miles: (totalDistance / 1609.344).toFixed(1)
    };
}

async function runRouting() {
    if (startNodeId === null || goalNodeId === null) return;
    document.getElementById('route-btn').disabled = true;
    document.getElementById('distance-box').style.display = 'none';

    initAudio();
    const runId = ++currentRunId;
    clearRouteLayers();

    try {
        const algoChoice = document.getElementById('algo-select').value;
        let algorithm;
        
        if (algoChoice === 'AStar') algorithm = Module.Algorithm.AStar;
        else if (algoChoice === 'DoubleAStar') algorithm = Module.Algorithm.Double_AStar;
        else if (algoChoice === 'DoubleDijkstra') algorithm = Module.Algorithm.Double_Dijkstra;
        else algorithm = Module.Algorithm.Dijkstra;

        const result = router.route(algorithm, startNodeId, goalNodeId);
        
        if (result.found) {
            const batchSize = getBatchSize();
            await visualizeSearch(result.events, batchSize, runId);
            
            if (runId === currentRunId) {
                await drawFinalPath(result.path, runId);

                if (runId === currentRunId) {
                    if (result.bidirectional) drawMeetingNode(result.meetingNode);
                    
                    const distMiles = calculateDistance(result.path).miles;
                    document.getElementById('route-distance').innerText = `${distMiles} mi`;
                    
                    const pathNodeCount = getVectorCount(result.path);
                    const edgeCount = pathNodeCount > 0 ? pathNodeCount - 1 : 0;
                    document.getElementById('route-edges').innerText = `${edgeCount} edges`;
                    
                    const meetingNodeRow = document.getElementById('meeting-node-row');
                    const meetingCoordsRow = document.getElementById('meeting-coords-row');
                    
                    if (result.bidirectional && result.meetingNode !== undefined && result.meetingNode !== 4294967295) {
                        const coords = nodeCoordinates[result.meetingNode];
                        document.getElementById('meeting-node').innerText = result.meetingNode;
                        document.getElementById('meeting-coords').innerText = `[${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}]`;
                        meetingNodeRow.style.display = 'list-item';
                        meetingCoordsRow.style.display = 'list-item';
                    } else {
                        meetingNodeRow.style.display = 'none';
                        meetingCoordsRow.style.display = 'none';
                    }

                    document.getElementById('distance-box').style.display = 'block';
                }
            }
        } else {
            showSnackbar('No valid path found between selected nodes.');
        }
        
        if (result.events && typeof result.events.delete === 'function') result.events.delete();
        if (result.path && typeof result.path.delete === 'function') result.path.delete();
        
    } catch (err) {
        console.error('Routing failed:', err);
        showSnackbar('A background error occurred. See console.');
    } finally {
        if (runId === currentRunId) {
            document.getElementById('route-btn').disabled = false;
        }
    }
}

async function visualizeSearch(events, batchSize = 100, runId) {
    if (!events) return;
    const isArray = Array.isArray(events);
    const count = getVectorCount(events);

    const valFoundEdge = getEnumVal(Module.SearchEventType.FoundEdge);
    const valForward = getEnumVal(Module.SearchDirection.Forward);
    const valBackward = getEnumVal(Module.SearchDirection.Backward);
    const seenEdges = new Set();

    for (let i = 0; i < count; i++) {
        const event = isArray ? events[i] : events.get(i);
        if (!event) continue;
        
        if (getEnumVal(event.type) === valFoundEdge) {
            const fromCoords = nodeCoordinates[event.from];
            const toCoords = nodeCoordinates[event.to];
            if (!fromCoords || !toCoords) continue;
            
            const edgeKey = `${event.from}-${event.to}`;
            if (seenEdges.has(edgeKey)) continue;

            const direction = getEnumVal(event.direction);
            const color = direction === valForward ? '#ff5252' : (direction === valBackward ? '#448aff' : null);
            if (!color) continue;

            const line = L.polyline([fromCoords, toCoords], { color, weight: 2, opacity: 0.3 }).addTo(map);
            routeLayers.push(line);
            seenEdges.add(edgeKey);
        }

        if (i % batchSize === 0) {
            const pitch = 200 + (Math.random() * 150);
            playTone(pitch, 0.05, 0.02, 'sine'); 
            
            mapLayers.forEach(layer => {
                if (layer && typeof layer.bringToFront === 'function') {
                    layer.bringToFront();
                }
            });

            await new Promise(r => setTimeout(r, SEARCH_BATCH_DELAY_MS)); 
            if (runId !== currentRunId) return;
        }
    }

    mapLayers.forEach(layer => {
        if (layer && typeof layer.bringToFront === 'function') {
            layer.bringToFront();
        }
    });
}

async function drawFinalPath(pathVector, runId) {
    if (!pathVector) return;
    const isArray = Array.isArray(pathVector);
    const count = getVectorCount(pathVector);
    if (count === 0) return;

    const latlngs = [];
    let currentLine = null;

    const friendlyScale = [440.00, 493.88, 554.37, 587.33, 659.26, 739.99, 830.61, 880.00];

    for (let i = 0; i < count; i++) {
        const nodeId = isArray ? pathVector[i] : pathVector.get(i);
        latlngs.push(nodeCoordinates[nodeId]);
        
        if (i > 0) {
            if (currentLine) map.removeLayer(currentLine);
            currentLine = L.polyline(latlngs, { color: '#00b300', weight: 6, opacity: 0.9 }).addTo(map);
            routeLayers.push(currentLine);
            
            mapLayers.forEach(layer => {
                if (layer && typeof layer.bringToFront === 'function') {
                    layer.bringToFront();
                }
            });

            const progress = i / (count - 1);
            const noteIndex = Math.floor(progress * (friendlyScale.length - 1));
            const freq = friendlyScale[noteIndex];
            const vol = 0.05 + (0.2 * progress); 
            const isLastNote = (i === count - 1);
            const duration = isLastNote ? PATH_FINAL_NOTE_DURATION_S : PATH_NOTE_DURATION_S; 
            
            playTone(freq, duration, vol, 'sine');
            await new Promise(r => setTimeout(r, PATH_STEP_MS)); 
            if (runId !== currentRunId) return;
        }
    }
    
    if (currentLine) map.fitBounds(currentLine.getBounds(), { padding: [50, 50] });
}

function drawMeetingNode(nodeId) {
    if (nodeId === undefined || nodeId === 4294967295) return;
    const nodeCoords = nodeCoordinates[nodeId];
    if (!nodeCoords) return;
    const marker = L.circleMarker(nodeCoords, { radius: 10, color: '#b000cc', fillColor: '#b000cc', fillOpacity: 1, weight: 3 }).addTo(map);
    routeLayers.push(marker); 
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterCompressor = audioCtx.createDynamicsCompressor();
        masterCompressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        masterCompressor.knee.setValueAtTime(30, audioCtx.currentTime);
        masterCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        masterCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        masterCompressor.release.setValueAtTime(0.15, audioCtx.currentTime);
        masterCompressor.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, duration, vol, type = 'sine') {
    if (!audioCtx || !document.getElementById('sound-toggle').checked) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    const safeVol = Math.min(vol, 0.3);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(safeVol, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(masterCompressor || audioCtx.destination);
    
    const toneHandle = { osc, gain };
    activeTones.push(toneHandle);
    osc.onended = () => { activeTones = activeTones.filter(t => t !== toneHandle); };
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration + 0.1); 
}

function stopAllTones() {
    if (!audioCtx || activeTones.length === 0) return;
    const now = audioCtx.currentTime;
    const FADE_S = 0.03;
    
    activeTones.forEach(({ osc, gain }) => {
        try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now); 
            gain.gain.linearRampToValueAtTime(0, now + FADE_S);
            osc.stop(now + FADE_S + 0.01);
        } catch (e) {}
    });
    activeTones = [];
}