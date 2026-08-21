#include "router.h"
#include "../algorithms/dijkstra.h"
#include "../algorithms/astar.h"
#include <stdexcept>

// router constructor
Router::Router(const Graph& graph)
    : graph_(graph) {}

SearchResult Router::route(Algorithm algorithm, uint32_t start, uint32_t goal) {
    switch (algorithm) {
        case Algorithm::Dijkstra: {
            Dijkstra dijkstra;
            return dijkstra.search(graph_, start, goal);
        }
        case Algorithm::AStar: {
            AStar astar;
            return astar.search(graph_, start, goal);
        }
        default:
            throw std::invalid_argument("Unsupported pathfinding algorithm");
    }
}