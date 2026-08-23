#include <algorithm>
#include <cmath>
#include <limits>
#include <queue>
#include <stdexcept>
#include <vector>

#include "double_astar.h"

namespace {
    constexpr float INF = std::numeric_limits<float>::infinity();
    constexpr double R = 6371000.0;
    constexpr double PI = 3.14159265358979323846;

    struct QueueEntry {
        float f_score;
        float g_score;
        uint32_t node;
        bool operator>(const QueueEntry& other) const { return f_score > other.f_score; }
    };

    auto equirectangularHeuristic = [](double goalLat, double goalLon) {
        goalLat *= PI / 180.0; goalLon *= PI / 180.0;
        return [goalLat, goalLon](double nodeLat, double nodeLon) {
            nodeLat *= PI / 180.0; nodeLon *= PI / 180.0;
            double dLat = goalLat - nodeLat;
            double dLon = goalLon - nodeLon;
            if (dLon > PI) dLon -= 2.0 * PI;
            else if (dLon < -PI) dLon += 2.0 * PI;
            double x = dLon * std::cos((nodeLat + goalLat) / 2.0);
            double y = dLat;
            return R * std::sqrt(x * x + y * y);
        };
    };
}

SearchResult Double_AStar::search(const Graph& graph, uint32_t start, uint32_t goal) {
    SearchResult result{};
    result.found = false; 
    result.bidirectional = true;
    result.meetingNode = UINT32_MAX; 
    result.distance = 0.0f; 
    result.nodesExpanded = 0;

    if (start >= graph.nodeCount() || goal >= graph.nodeCount()) return result;
    if (start == goal) {
        result.found = true; result.path.push_back(start);
        return result;
    }

    uint32_t nodeCount = graph.nodeCount();
    
    // heuristic function for each direction
    auto h_f = equirectangularHeuristic(graph.nodeLat(goal), graph.nodeLon(goal));
    auto h_b = equirectangularHeuristic(graph.nodeLat(start), graph.nodeLon(start));

    std::priority_queue<QueueEntry, std::vector<QueueEntry>, std::greater<QueueEntry>> queue_f, queue_b;
    std::vector<uint32_t> came_from_f(nodeCount, UINT32_MAX), came_from_b(nodeCount, UINT32_MAX);
    std::vector<float> g_score_f(nodeCount, INF), g_score_b(nodeCount, INF);

    float best_distance = INF;
    
    // input intial conditions
    g_score_f[start] = 0; queue_f.push({static_cast<float>(h_f(graph.nodeLat(start), graph.nodeLon(start))), 0, start});
    g_score_b[goal] = 0; queue_b.push({static_cast<float>(h_b(graph.nodeLat(goal), graph.nodeLon(goal))), 0, goal});

    // for each iteration in the loop, one forward + backward step is completed
    while (!queue_f.empty() && !queue_b.empty()) {
        
        // quit early if 
        if (queue_f.top().f_score + queue_b.top().f_score >= best_distance) break;

        // forward step
        QueueEntry curr_f = queue_f.top(); queue_f.pop();
        if (curr_f.g_score <= g_score_f[curr_f.node]) {
            for (uint32_t i = graph.edgeBegin(curr_f.node); i < graph.edgeEnd(curr_f.node); ++i) {
                const Edge& edge = graph.edge(i);
                result.events.push_back({SearchEventType::FoundEdge, SearchDirection::Forward, curr_f.node, edge.to});
                result.nodesExpanded++;
                
                float tent_g = curr_f.g_score + edge.distance;
                if (tent_g < g_score_f[edge.to]) {
                    g_score_f[edge.to] = tent_g; came_from_f[edge.to] = curr_f.node;
                    queue_f.push({tent_g + static_cast<float>(h_f(graph.nodeLat(edge.to), graph.nodeLon(edge.to))), tent_g, edge.to});
                    if (g_score_b[edge.to] != INF && tent_g + g_score_b[edge.to] < best_distance) {
                        best_distance = tent_g + g_score_b[edge.to];
                        result.meetingNode = edge.to;
                    }
                }
            }
        }

        // backwards step
        QueueEntry curr_b = queue_b.top(); queue_b.pop();
        if (curr_b.g_score <= g_score_b[curr_b.node]) {
            for (uint32_t i = graph.edgeBegin(curr_b.node); i < graph.edgeEnd(curr_b.node); ++i) {
                const Edge& edge = graph.edge(i);
                result.events.push_back({SearchEventType::FoundEdge, SearchDirection::Backward, curr_b.node, edge.to});
                result.nodesExpanded++;
                
                float tent_g = curr_b.g_score + edge.distance;
                if (tent_g < g_score_b[edge.to]) {
                    g_score_b[edge.to] = tent_g; came_from_b[edge.to] = curr_b.node;
                    queue_b.push({tent_g + static_cast<float>(h_b(graph.nodeLat(edge.to), graph.nodeLon(edge.to))), tent_g, edge.to});
                    if (g_score_f[edge.to] != INF && tent_g + g_score_f[edge.to] < best_distance) {
                        best_distance = tent_g + g_score_f[edge.to]; 
                        result.meetingNode = edge.to;
                    }
                }
            }
        }
    }

    if (result.meetingNode != UINT32_MAX) {
        result.found = true; result.distance = best_distance;
        
        std::vector<uint32_t> path_f;
        for (uint32_t curr = result.meetingNode; curr != start; curr = came_from_f[curr]) path_f.push_back(curr);
        path_f.push_back(start); std::reverse(path_f.begin(), path_f.end());
        
        std::vector<uint32_t> path_b;
        for (uint32_t curr = came_from_b[result.meetingNode]; curr != goal; curr = came_from_b[curr]) path_b.push_back(curr);
        path_b.push_back(goal);

        result.events.push_back(SearchEvent(SearchEventType::FoundNode, SearchDirection::Forward, result.meetingNode));
        
        result.path = path_f; result.path.insert(result.path.end(), path_b.begin(), path_b.end());
    }

    return result;
}