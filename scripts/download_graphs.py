#!/usr/bin/env python3

# Example:
#   python scripts/download_graphs.py /path/to/workspace
#
# Example:
#   python scripts/download_graphs.py ./workspace

import argparse
import os
import struct

import osmnx as ox
import networkx as nx


PLACE = "Washington, DC, USA"

# Binary format:
#
# Header:
#   char[4]  magic      = "NAV1"
#   uint32   version
#   uint32   node_count
#   uint32   edge_count
#
# Node:
#   uint64   osm_id
#   double   lat
#   double   lon
#   double   x
#   double   y
#
# CSR offsets:
#   uint32[node_count + 1]
#
# Edge:
#   uint32   to
#   float    length_m


HEADER_FORMAT = "<4sIII"
NODE_FORMAT = "<Qdddd"
OFFSET_FORMAT = "<I"
EDGE_FORMAT = "<If"

FORMAT_VERSION = 1

HEADER_SIZE = struct.calcsize(HEADER_FORMAT)
NODE_SIZE = struct.calcsize(NODE_FORMAT)
OFFSET_SIZE = struct.calcsize(OFFSET_FORMAT)
EDGE_SIZE = struct.calcsize(EDGE_FORMAT)


def write_graph_binary(G, output_path):
    osm_nodes = list(G.nodes())

    node_index = {
        osm_id: index
        for index, osm_id in enumerate(osm_nodes)
    }

    node_count = len(osm_nodes)

    adjacency = [[] for _ in range(node_count)]

    for u, v, key, data in G.edges(
        keys=True,
        data=True,
    ):
        u_index = node_index[u]
        v_index = node_index[v]

        length = float(data.get("length", 0.0))

        adjacency[u_index].append(
            (v_index, length)
        )

    offsets = [0]

    for edges in adjacency:
        offsets.append(
            offsets[-1] + len(edges)
        )

    edge_count = offsets[-1]

    with open(output_path, "wb") as f:

        # Header
        f.write(
            struct.pack(
                HEADER_FORMAT,
                b"NAV1",
                FORMAT_VERSION,              # format version
                node_count,
                edge_count,
            )
        )

        for osm_id in osm_nodes:
            data = G.nodes[osm_id]

            # Projected coordinates
            x = float(data["x"])
            y = float(data["y"])

            # Geographic coordinates
            lon = float(G.graph.get("_original_lon", 0.0))
            lat = float(G.graph.get("_original_lat", 0.0))

            lon = float(data["original_lon"])
            lat = float(data["original_lat"])

            f.write(
                struct.pack(
                    NODE_FORMAT,
                    int(osm_id),
                    lat,
                    lon,
                    x,
                    y,
                )
            )

        for offset in offsets:
            f.write(
                struct.pack(
                    OFFSET_FORMAT,
                    offset,
                )
            )

        for edges in adjacency:
            for destination, length in edges:
                f.write(
                    struct.pack(
                        EDGE_FORMAT,
                        destination,
                        length,
                    )
                )

    print()
    print("Binary graph written:")
    print(f"  File:       {output_path}")
    print(f"  Header:     {HEADER_SIZE} bytes")
    print(f"  Nodes:      {node_count:,}")
    print(f"  Edges:      {edge_count:,}")
    print(f"  Node size:  {NODE_SIZE} bytes")
    print(f"  Edge size:  {EDGE_SIZE} bytes")
    print()

def create_mock_graph():
    """Creates a predictable 3-node graph for unit testing."""
    G = nx.MultiDiGraph()
    
    # Add nodes with required attributes
    G.add_node(0, x=0.0, y=0.0, original_lon=-77.0, original_lat=38.0)
    G.add_node(1, x=1.0, y=0.0, original_lon=-77.1, original_lat=38.1)
    G.add_node(2, x=2.0, y=0.0, original_lon=-77.2, original_lat=38.2)
    
    # 0 -> 2 direct is 20.0m
    # 0 -> 1 -> 2 indirect is 15.0m (10.0 + 5.0). 
    # Dijkstra should prefer the 0 -> 1 -> 2 route.
    G.add_edge(0, 1, length=10.0)
    G.add_edge(1, 2, length=5.0)
    G.add_edge(0, 2, length=20.0)
    
    return G




def main():
    parser = argparse.ArgumentParser(
        description=(
            "Download and preprocess the Washington, DC "
            "road network into a binary graph."
        )
    )

    parser.add_argument(
        "workspace",
        help=(
            "Workspace directory where the generated "
            "graph file will be stored."
        ),
    )

    args = parser.parse_args()

    workspace = os.path.abspath(args.workspace)

    os.makedirs(
        workspace,
        exist_ok=True,
    )

    cache_dir = os.path.join(
        workspace,
        ".osmnx_cache",
    )

    os.makedirs(
        cache_dir,
        exist_ok=True,
    )

    ox.settings.use_cache = True
    ox.settings.cache_folder = cache_dir

    print(f"Downloading OSM data for {PLACE}...")

    G = ox.graph.graph_from_place(
        PLACE,
        network_type="drive",
        simplify=True,
        retain_all=True,
    )

    for node_id, data in G.nodes(data=True):
        data["original_lon"] = float(data["x"])
        data["original_lat"] = float(data["y"])

    G_projected = ox.projection.project_graph(G)

    for node_id, data in G_projected.nodes(data=True):
        original = G.nodes[node_id]

        data["original_lon"] = float(
            original["original_lon"]
        )

        data["original_lat"] = float(
            original["original_lat"]
        )

    output_graph = os.path.join(
        workspace,
        "graph.bin",
    )

    write_graph_binary(
        G_projected,
        output_graph,
    )
    
    mock_G = create_mock_graph()
    mock_output = os.path.join(workspace, "mock_graph.bin")
    
    print("Generating mock graph for tests...")
    write_graph_binary(mock_G, mock_output)

    print("Finished!")
    print()
    print(f"  Workspace: {workspace}")
    print(f"  Cache:     {cache_dir}")
    print(f"  Graph:     {output_graph}")
    print()


if __name__ == "__main__":
    main()