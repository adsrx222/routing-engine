#include "graph.h"

const Node& Graph::node(uint32_t id) const {
    return nodes_[id];
}

uint32_t Graph::nodeCount() const {
    return static_cast<uint32_t>(nodes_.size());
}

uint32_t Graph::edgeCount() const {
    return static_cast<uint32_t>(edges_.size());
}

uint32_t Graph::edgeBegin(uint32_t nodeId) const {
    return static_cast<uint32_t>(offsets_[nodeId]);
}

uint32_t Graph::edgeEnd(uint32_t nodeId) const {
    return static_cast<uint32_t>(offsets_[nodeId + 1]);
}

const Edge& Graph::edge(uint32_t edgeId) const {
    return edges_[edgeId];
}

double Graph::nodeLat(uint32_t nodeId) const {
    return nodes_[nodeId].lat;
}

double Graph::nodeLon(uint32_t nodeId) const {
    return nodes_[nodeId].lon;
}

uint32_t Graph::reverseEdgeBegin(uint32_t nodeId) const {
    return static_cast<uint32_t>(reverse_offsets_[nodeId]);
}

uint32_t Graph::reverseEdgeEnd(uint32_t nodeId) const {
    return static_cast<uint32_t>(reverse_offsets_[nodeId + 1]);
}

const Edge& Graph::reverseEdge(uint32_t edgeId) const {
    return reverse_edges_[edgeId];
}