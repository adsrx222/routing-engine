#include "double_dijkstra.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <queue>
#include <stdexcept>
#include <vector>

namespace {
    constexpr float INF = std::numeric_limits<float>::infinity();

    struct QueueEntry {
        float distance;
        uint32_t node;

        bool operator>(const QueueEntry& other) const {
            return distance > other.distance;
        }
    };
}

SearchResult Double_Dijkstra::search(const Graph& graph, uint32_t start, uint32_t goal) {
    SearchResult result{};
    
    // initial conditions
    result.found = false;
    result.bidirectional = true;
    result.meetingNode = UINT32_MAX;
    result.distance = 0.0f;
    result.nodesExpanded = 0;

    if (start >= graph.nodeCount() || goal >= graph.nodeCount()) {
        return result;
    }

    if (start == goal) {
        result.found = true;
        result.path.push_back(start);
        return result;
    }

    const uint32_t nodeCount = graph.nodeCount();

    // Priority queues for forward and backward search
    std::priority_queue<QueueEntry, std::vector<QueueEntry>, std::greater<QueueEntry>> queue_f, queue_b;
    
    // distances and previous node tracking for both directions
    std::vector<float> dist_f(nodeCount, INF), dist_b(nodeCount, INF);
    std::vector<uint32_t> prev_f(nodeCount, UINT32_MAX), prev_b(nodeCount, UINT32_MAX);

    float best_distance = INF;

    // setup start and goal nodes
    dist_f[start] = 0.0f;
    queue_f.push({0.0f, start});
    
    dist_b[goal] = 0.0f;
    queue_b.push({0.0f, goal});

    // step alternatingly in forward and backward directions
    while (!queue_f.empty() && !queue_b.empty()) {
        
        // termination condition
        if (queue_f.top().distance + queue_b.top().distance >= best_distance) {
            break;
        }

        // forward step
        QueueEntry curr_f = queue_f.top();
        queue_f.pop();
        if (curr_f.distance <= dist_f[curr_f.node]) { // ignore stale priority queue entries
            uint32_t begin = graph.edgeBegin(curr_f.node);
            uint32_t end = graph.edgeEnd(curr_f.node);

            for (uint32_t i = begin; i < end; ++i) {
                const Edge& edge = graph.edge(i);
                uint32_t neighbor = edge.to;

                result.events.push_back({SearchEventType::FoundEdge, SearchDirection::Forward, curr_f.node, neighbor});
                result.nodesExpanded++;
                
                float new_dist = curr_f.distance + edge.distance;
                
                // Relax edge if a better route is found
                if (new_dist < dist_f[neighbor]) {
                    dist_f[neighbor] = new_dist;
                    prev_f[neighbor] = curr_f.node;
                    queue_f.push({new_dist, neighbor});
                    if (dist_b[neighbor] != INF && new_dist + dist_b[neighbor] < best_distance) {  // check for intersection with backward search

                        best_distance = new_dist + dist_b[neighbor];
                        result.meetingNode = neighbor;
                    }
                }
            }
        }

        // backward step
        QueueEntry curr_b = queue_b.top();
        queue_b.pop();
        if (curr_b.distance <= dist_b[curr_b.node]) { // ignore stale priority queue entries
            uint32_t begin = graph.reverseEdgeBegin(curr_b.node);
            uint32_t end = graph.reverseEdgeEnd(curr_b.node);

            for (uint32_t i = begin; i < end; ++i) {
                const Edge& edge = graph.reverseEdge(i);
                uint32_t neighbor = edge.to;

                result.events.push_back({SearchEventType::FoundEdge, SearchDirection::Backward, curr_b.node, neighbor});
                result.nodesExpanded++;
                
                float new_dist = curr_b.distance + edge.distance;
                
                // relax edge if a better route is found
                if (new_dist < dist_b[neighbor]) {
                    dist_b[neighbor] = new_dist;
                    prev_b[neighbor] = curr_b.node;
                    queue_b.push({new_dist, neighbor});
                    
                    // check for intersection with forward search
                    if (dist_f[neighbor] != INF && new_dist + dist_f[neighbor] < best_distance) {
                        best_distance = new_dist + dist_f[neighbor];
                        result.meetingNode = neighbor;
                    }
                }
            }
        }
    }

    // path reconstruction
    if (result.meetingNode != UINT32_MAX) {
        result.found = true;
        result.distance = best_distance;
        
        // reconstruct forward half
        std::vector<uint32_t> path_f;
        for (uint32_t curr = result.meetingNode; curr != start && curr != UINT32_MAX; curr = prev_f[curr]) {
            path_f.push_back(curr);
        }
        path_f.push_back(start);
        std::reverse(path_f.begin(), path_f.end());
        
        // reconstruct backward half
        std::vector<uint32_t> path_b;
        if (result.meetingNode != goal) {
            for (uint32_t curr = prev_b[result.meetingNode]; curr != goal && curr != UINT32_MAX; curr = prev_b[curr]) {
                path_b.push_back(curr);
            }
        }
        path_b.push_back(goal);

        result.events.push_back({SearchEventType::FoundNode, SearchDirection::Forward, result.meetingNode, 0});
        
        // combine
        result.path = std::move(path_f);
        result.path.insert(result.path.end(), path_b.begin(), path_b.end());
    }

    return result;
}