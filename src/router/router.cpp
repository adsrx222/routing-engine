#include "router.h"
#include "../algorithms/dijkstra.h"
#include "../algorithms/astar.h"
#include "../algorithms/double_dijkstra.h"
#include "../algorithms/double_astar.h"
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
        case Algorithm::Double_Dijkstra: {
            Double_Dijkstra d_dijkstra;
            return d_dijkstra.search(graph_, start, goal);
        }
        case Algorithm::Double_AStar: {
            Double_AStar d_astar;
            return d_astar.search(graph_, start, goal);
        }
        default:
            throw std::invalid_argument("Unsupported pathfinding algorithm");
    }
}