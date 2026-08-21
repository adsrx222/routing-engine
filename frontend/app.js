// Import the Emscripten-generated module
import PathfinderModule from './build_wasm/pathfinder.js';

async function initMap() {
    const statusText = document.getElementById('status');

    // 1. Initialize WebAssembly Module
    const Module = await PathfinderModule();
    statusText.innerText = "Downloading Graph...";

    // 2. Fetch the binary graph (using the mock graph for this test)
    const graphPath = 'workspace/mock_graph.bin';
    const response = await fetch(graphPath);
    const buffer = await response.arrayBuffer();

    // 3. Mount into Emscripten virtual file system and load C++ graph
    statusText.innerText = "Loading Graph in C++...";
    Module.FS.writeFile('/graph.bin', new Uint8Array(buffer));
    const graph = Module.GraphLoader.load('/graph.bin');
    const router = new Module.Router(graph);

    // 4. Initialize Leaflet Map
    const map = L.map('map').setView([38.1, -77.1], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 5. Run the routing algorithm (Node 0 to Node 2)
    statusText.innerText = "Routing...";
    const startNode = 0;
    const endNode = 2;
    const result = router.route(Module.Algorithm.Dijkstra, startNode, endNode);

    if (!result.found) {
        statusText.innerText = "Path not found!";
        return;
    }

    statusText.innerText = `Found Path! Distance: ${result.distance.toFixed(2)}m`;

    // 6. Read coordinates directly from binary buffer for rendering
    // Header = 16 bytes. Node = 40 bytes (uint64, lat(8), lon(8), x(8), y(8))
    const dataView = new DataView(buffer);
    const getCoordinates = (nodeId) => {
        const offset = 16 + (nodeId * 40);
        // read double (8 bytes) at little-endian (true)
        const lat = dataView.getFloat64(offset + 8, true); 
        const lon = dataView.getFloat64(offset + 16, true);
        return [lat, lon];
    };

    // 7. Plot nodes and edges on the map
    const pathCoordinates = [];
    
    // Convert Emscripten std::vector to JS array
    for (let i = 0; i < result.path.size(); i++) {
        const nodeId = result.path.get(i);
        const coords = getCoordinates(nodeId);
        pathCoordinates.push(coords);

        // Add a marker for each node
        L.marker(coords).addTo(map).bindPopup(`Node ID: ${nodeId}`);
    }

    // Draw the red path line connecting the nodes
    const polyline = L.polyline(pathCoordinates, { color: 'red', weight: 5 }).addTo(map);
    
    // Zoom map to fit the path
    map.fitBounds(polyline.getBounds());
}

initMap().catch(console.error);