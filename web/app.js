let map, router, Module, graph;
let startNodeId = null;
let goalNodeId = null;
let mapLayers = [];
let nodeCoordinates = []; // Will store parsed [lat, lon] arrays

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
        if (nodeCoordinates.length === 0) return; // Graph not loaded yet
        handleMapClick(e.latlng);
    });

    document.getElementById('route-btn').addEventListener('click', runRouting);
    document.getElementById('reset-btn').addEventListener('click', resetUI);
    document.getElementById('algo-select').addEventListener('change', resetUI);
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
    startNodeId = null;
    goalNodeId = null;
    document.getElementById('start-node').innerText = 'None';
    document.getElementById('goal-node').innerText = 'None';
    document.getElementById('route-btn').disabled = true;
    
    mapLayers.forEach(layer => map.removeLayer(layer));
    mapLayers = [];
}

function getEnumVal(enumObj) {
    return (enumObj !== null && typeof enumObj === 'object' && enumObj.value !== undefined) 
        ? enumObj.value 
        : enumObj;
}

async function runRouting() {
    if (startNodeId === null || goalNodeId === null) return;
    document.getElementById('route-btn').disabled = true;

    try {
        const algoChoice = document.getElementById('algo-select').value;
        let algorithm;
        if (algoChoice === 'AStar') {
            algorithm = Module.Algorithm.AStar;
        } else if (algoChoice === 'DoubleAStar') {
            algorithm = Module.Algorithm.Double_AStar;
        } else {
            algorithm = Module.Algorithm.Dijkstra;
        }

        const result = router.route(algorithm, startNodeId, goalNodeId);
        
        if (result.found) {
            await visualizeSearch(result.events);
            drawFinalPath(result.path);
            
            if (result.bidirectional) {
                drawMeetingNode(result.meetingNode);
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
        document.getElementById('route-btn').disabled = false;
    }
}

async function visualizeSearch(events, batchSize = 100) {
    if (!events) return;
    
    const isArray = Array.isArray(events);
    const count = isArray ? events.length : events.size();

    const valFoundEdge = getEnumVal(Module.SearchEventType.FoundEdge);
    const valFoundNode = getEnumVal(Module.SearchEventType.FoundNode);

    const valForward = getEnumVal(Module.SearchDirection.Forward);
    const valBackward = getEnumVal(Module.SearchDirection.Backward);

    const seenEdges = new Set();
    const seenNodes = new Set();

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
            mapLayers.push(line);
            seenEdges.add(edgeKey);

        }

        // throttle animation speed using the batchSize argument
        if (i % batchSize === 0) await new Promise(r => setTimeout(r, 1)); 
    }
}

function drawFinalPath(pathVector) {
    if (!pathVector) return;
    
    const isArray = Array.isArray(pathVector);
    const count = isArray ? pathVector.length : pathVector.size();
    
    if (count === 0) return;

    const latlngs = [];
    for (let i = 0; i < count; i++) {
        const nodeId = isArray ? pathVector[i] : pathVector.get(i);
        latlngs.push(nodeCoordinates[nodeId]);
    }
    
    const finalLine = L.polyline(latlngs, {
        color: 'green',
        weight: 6,
        opacity: 0.9
    }).addTo(map);
    
    mapLayers.push(finalLine);
    map.fitBounds(finalLine.getBounds(), { padding: [50, 50] });
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
    
    mapLayers.push(marker); 
}