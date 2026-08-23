let map, router, Module, graph;
let startNodeId = null;
let goalNodeId = null;
let mapLayers = [];    // start/goal selection markers only
let routeLayers = [];  // search edges, final path segments, meeting-node marker — cleared at the start of every route calculation
let nodeCoordinates = [];
let audioCtx = null;
let masterCompressor = null; // shared limiter bus all tones route through
let currentRunId = 0;   // bumped whenever resetUI() fires; in-flight animation loops check this to know they've been cancelled
let activeTones = [];   // { osc, gain } for tones currently sounding, so resetUI() can silence them

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await initWASM();
});

function initMap() {
    map = L.map('map').setView([38.9072, -77.0369], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', (e) => {
        if (nodeCoordinates.length === 0) return; // graph not loaded yet
        handleMapClick(e.latlng);
    });

    document.getElementById('route-btn').addEventListener('click', runRouting);
    document.getElementById('reset-btn').addEventListener('click', resetUI);
    document.getElementById('algo-select').addEventListener('change', resetUI);

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

async function initWASM() {
    try {
        Module = await PathfinderModule({
            locateFile: (path) => path === 'pathfinder.wasm' ? 'dist/pathfinder.wasm' : path
        });

        const response = await fetch('graph.bin');
        const buffer = await response.arrayBuffer();
        
        const dataView = new DataView(buffer);
        const nodeCount = dataView.getUint32(8, true); // Little endian
        
        const HEADER_SIZE = 16;
        const NODE_SIZE = 40; // uint64 + 4 doubles

        for (let i = 0; i < nodeCount; i++) {
            const offset = HEADER_SIZE + (i * NODE_SIZE);
            const lat = dataView.getFloat64(offset + 8, true); 
            const lon = dataView.getFloat64(offset + 16, true); 
            nodeCoordinates.push([lat, lon]);
        }
        
        Module.FS.writeFile('/graph.bin', new Uint8Array(buffer));
        graph = Module.GraphLoader.load('/graph.bin');
        router = new Module.Router(graph);

        const statusEl = document.getElementById('status');
        statusEl.innerText = `Ready! (${nodeCount.toLocaleString()} DC nodes loaded)`;
        statusEl.style.color = 'green';
    } catch (err) {
        console.error("Initialization Failed:", err);
        document.getElementById('status').innerText = 'Data Load Failed.';
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
        const marker = L.circleMarker(coords, { radius: 8, color: 'green', fillOpacity: 1 }).addTo(map);
        mapLayers.push(marker);
    } else if (goalNodeId === null && nodeId !== startNodeId) {
        goalNodeId = nodeId;
        document.getElementById('goal-node').innerText = nodeId;
        const marker = L.circleMarker(coords, { radius: 8, color: 'red', fillOpacity: 1 }).addTo(map);
        mapLayers.push(marker);
        document.getElementById('route-btn').disabled = false;
    }
}

function resetUI() {
    // Invalidate whatever run is currently animating (search edges or the
    // final path reveal) so its loop stops drawing/playing the next time it
    // checks in, and cut off any tones still ringing from it.
    currentRunId++;
    stopAllTones();

    startNodeId = null;
    goalNodeId = null;
    document.getElementById('start-node').innerText = 'None';
    document.getElementById('goal-node').innerText = 'None';
    document.getElementById('route-btn').disabled = true;
    
    mapLayers.forEach(layer => map.removeLayer(layer));
    mapLayers = [];
    clearRouteLayers();
}

// Removes any drawn search edges, the final path line, and the meeting-node
// marker — but leaves the start/goal selection markers alone. Called both on
// a full reset and at the start of every route calculation, so re-running
// with the same start/goal starts the animation over a clean map.
function clearRouteLayers() {
    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];
}

function getEnumVal(enumObj) {
    return (enumObj !== null && typeof enumObj === 'object' && enumObj.value !== undefined) 
        ? enumObj.value 
        : enumObj;
}

function getVectorCount(vec) {
    if (!vec) return 0;
    return Array.isArray(vec) ? vec.length : vec.size();
}

// --- Animation pacing ------------------------------------------------------
// batchSize controls how many search events are processed between animation
// pauses in visualizeSearch — a bigger batchSize means fewer pauses, so the
// search animation runs faster. The user sets this directly via the
// "Animation Speed" slider in the UI (see initSpeedControl).
const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 500;
const SEARCH_BATCH_DELAY_MS = 1; // ms paused per throttled batch during search

const PATH_STEP_MS = 15;                // ms between each drawn final-path segment
const PATH_NOTE_DURATION_S = 0.15;      // s a normal final-path note rings for
const PATH_FINAL_NOTE_DURATION_S = 1.5; // s the last, held note rings for

// Reads the user-selected animation speed (batchSize) from the slider.
function getBatchSize() {
    const slider = document.getElementById('speed-slider');
    const value = slider ? parseInt(slider.value, 10) : DEFAULT_BATCH_SIZE;
    if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
    return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, value));
}

async function runRouting() {
    if (startNodeId === null || goalNodeId === null) return;
    document.getElementById('route-btn').disabled = true;

    // init audio on user click
    initAudio();

    // This run's identity. resetUI() bumps currentRunId, so any check below
    // of the form `runId !== currentRunId` tells us a reset happened after
    // we started and we should stop animating/acting on stale results.
    const runId = ++currentRunId;

    // Clear any edges/path from a previous calculation so re-running with
    // the same start/goal starts the animation fresh instead of stacking
    // layers on top of the old ones.
    clearRouteLayers();

    try {
        const algoChoice = document.getElementById('algo-select').value;
        let algorithm;
        
        if (algoChoice === 'AStar') {
            algorithm = Module.Algorithm.AStar;
        } else if (algoChoice === 'DoubleAStar') {
            algorithm = Module.Algorithm.Double_AStar;
        } else if (algoChoice === 'DoubleDijkstra') {
            algorithm = Module.Algorithm.Double_Dijkstra;
        } else {
            algorithm = Module.Algorithm.Dijkstra;
        }

        const result = router.route(algorithm, startNodeId, goalNodeId);
        
        if (result.found) {
            const batchSize = getBatchSize();

            await visualizeSearch(result.events, batchSize, runId);
            
            // If resetUI() fired while the search was animating, don't go on
            // to draw the final path over a map that's already been cleared.
            if (runId === currentRunId) {
                // wait for the final path crescendo to finish animating
                await drawFinalPath(result.path, runId);

                if (runId === currentRunId && result.bidirectional) {
                    drawMeetingNode(result.meetingNode);
                }
            }
        } else {
            alert('No path found in DC network.');
        }
        
        if (result.events && typeof result.events.delete === 'function') result.events.delete();
        if (result.path && typeof result.path.delete === 'function') result.path.delete();
        
    } catch (err) {
        console.error('Routing failed:', err);
        alert('A background error occurred. Press F12 to check the console for details.');
    } finally {
        // Only re-enable the button for the run that's still current. If a
        // reset superseded us mid-animation, resetUI() already put the
        // button back in its correct (disabled, no start/goal) state and we
        // shouldn't clobber that.
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
        
        const eventType = getEnumVal(event.type);
        const eventDirection = getEnumVal(event.direction);

        if (eventType === valFoundEdge) {
            const fromCoords = nodeCoordinates[event.from];
            const toCoords = nodeCoordinates[event.to];
            if (!fromCoords || !toCoords) continue;
            
            const edgeKey = `${event.from}-${event.to}`;
            if (seenEdges.has(edgeKey)) continue;

            let color, weight = 2, opacity = 0.4;
            if (eventDirection === valForward) {
                color = 'red';
            } else if (eventDirection === valBackward) {
                color = 'blue';
            } else {
                continue;
            }

            const line = L.polyline([fromCoords, toCoords], { color, weight, opacity }).addTo(map);
            routeLayers.push(line);
            seenEdges.add(edgeKey);
        }

        // throttle animation speed
        if (i % batchSize === 0) {
            // Randomize pitch slightly for a bubbling effect
            const pitch = 200 + (Math.random() * 150);
            playTone(pitch, 0.05, 0.02, 'sine'); 
            await new Promise(r => setTimeout(r, SEARCH_BATCH_DELAY_MS)); 

            // resetUI() may have fired while we were waiting — stop drawing
            // edges immediately instead of continuing over a cleared map.
            if (runId !== currentRunId) return;
        }
    }
}

async function drawFinalPath(pathVector, runId) {
    if (!pathVector) return;
    
    const isArray = Array.isArray(pathVector);
    const count = getVectorCount(pathVector);
    
    if (count === 0) return;

    const latlngs = [];
    let currentLine = null;

    // A pleasant A-Major Scale (frequencies in Hz)
    const friendlyScale = [
        440.00, // A4 (Root)
        493.88, // B4
        554.37, // C#5
        587.33, // D5
        659.26, // E5
        739.99, // F#5
        830.61, // G#5
        880.00, // A5 (Octave)
    ];

    // draw the path step by step
    for (let i = 0; i < count; i++) {
        const nodeId = isArray ? pathVector[i] : pathVector.get(i);
        latlngs.push(nodeCoordinates[nodeId]);
        
        if (i > 0) {
            if (currentLine) map.removeLayer(currentLine);
            
            currentLine = L.polyline(latlngs, {
                color: 'green',
                weight: 6,
                opacity: 0.9
            }).addTo(map);
            // Track immediately (not just at the end) so a mid-reveal reset
            // can still find and remove whatever's currently drawn.
            routeLayers.push(currentLine);
            
            const progress = i / (count - 1);
            
            // Map the path progress to an index in our musical scale
            const noteIndex = Math.floor(progress * (friendlyScale.length - 1));
            const freq = friendlyScale[noteIndex];
            
            // Scale volume gently
            const vol = 0.05 + (0.2 * progress); 
            
            // Check if this is the final segment of the path
            const isLastNote = (i === count - 1);
            
            // Hold the last note for its long crescendo, otherwise a short blip
            const duration = isLastNote ? PATH_FINAL_NOTE_DURATION_S : PATH_NOTE_DURATION_S; 
            
            playTone(freq, duration, vol, 'sine');
            
            // Wait before drawing the next segment
            await new Promise(r => setTimeout(r, PATH_STEP_MS)); 

            // resetUI() may have fired while we were waiting — stop the
            // reveal immediately instead of continuing over a cleared map.
            if (runId !== currentRunId) return;
        }
    }
    
    if (currentLine) {
        map.fitBounds(currentLine.getBounds(), { padding: [50, 50] });
    }
}

function drawMeetingNode(nodeId) {
    if (nodeId === undefined || nodeId === 4294967295) return;
    
    const nodeCoords = nodeCoordinates[nodeId];
    if (!nodeCoords) return;

    const marker = L.circleMarker(nodeCoords, { 
        radius: 12, 
        color: 'purple',
        fillColor: 'purple',
        fillOpacity: 1,
        weight: 5
    }).addTo(map);
    
    routeLayers.push(marker); 
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Shared limiter bus: every tone connects here instead of straight to
        // destination. When many notes overlap (e.g. the 15ms-spaced scale
        // notes each ringing for 150ms), their summed amplitude can exceed
        // 0dBFS and hard-clip, which is what produces the harsh "ringing"
        // between transitions. The compressor's high ratio/low threshold
        // squashes that peak instead of letting it clip.
        masterCompressor = audioCtx.createDynamicsCompressor();
        masterCompressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        masterCompressor.knee.setValueAtTime(30, audioCtx.currentTime);
        masterCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        masterCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        masterCompressor.release.setValueAtTime(0.15, audioCtx.currentTime);
        masterCompressor.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, duration, vol, type = 'sine') {
    if (!audioCtx || !document.getElementById('sound-toggle').checked) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    // Prevent clipping by capping the maximum volume
    const safeVol = Math.min(vol, 0.3);
    
    // Smooth Envelope (ADSR)
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    
    // 1. Fast, smooth attack to peak volume (prevents clicking)
    gain.gain.linearRampToValueAtTime(safeVol, audioCtx.currentTime + 0.01);
    
    // 2. Exponential decay gracefully fades out (prevents muddy overlap)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(masterCompressor || audioCtx.destination);
    
    const toneHandle = { osc, gain };
    activeTones.push(toneHandle);
    osc.onended = () => {
        activeTones = activeTones.filter(t => t !== toneHandle);
    };
    
    osc.start();
    
    // Add a tiny buffer to the stop time so the release finishes cleanly
    osc.stop(audioCtx.currentTime + duration + 0.1); 
}

// Immediately silences any tones currently ringing (e.g. a held final note)
// with a fast fade-out to avoid an audible click, and clears them from
// tracking. Called by resetUI() so a reset actually feels instant.
function stopAllTones() {
    if (!audioCtx || activeTones.length === 0) return;
    const now = audioCtx.currentTime;
    const FADE_S = 0.03;
    
    activeTones.forEach(({ osc, gain }) => {
        try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now); // hold at current level, avoids a jump
            gain.gain.linearRampToValueAtTime(0, now + FADE_S);
            osc.stop(now + FADE_S + 0.01);
        } catch (e) {
            // Oscillator may have already stopped naturally; safe to ignore.
        }
    });
    activeTones = [];
}