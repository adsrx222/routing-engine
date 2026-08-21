#include <algorithm>
#include <cmath>
#include <limits>
#include <queue>
#include <stdexcept>
#include <vector>
#include <map>

#include "astar.h"

namespace {

    constexpr float INF = std::numeric_limits<float>::infinity();
    constexpr double R = 6371000.0; // earth's radius
    constexpr double PI = 3.14159265358979323846;

    struct QueueEntry {
        float f_score;
        float g_score;
        uint32_t node;

        bool operator>(const QueueEntry& other) const {
        return f_score > other.f_score;
        }
    };

    // equirectangular heuristic lambda function
    auto equirectangularHeuristic = [](double goalLat, double goalLon) {

        // convert goal coordinates to radians
        goalLat *= PI / 180.0;
        goalLon *= PI / 180.0;

        return [goalLat, goalLon](double nodeLat, double nodeLon) {
            // convert node coordinates to radians
            nodeLat *= PI / 180.0;
            nodeLon *= PI / 180.0;

            double dLat = goalLat - nodeLat;
            double dLon = goalLon - nodeLon;

            // handle IDL exception
            if (dLon > PI)
                dLon -= 2.0 * PI;
            else if (dLon < -PI)
                dLon += 2.0 * PI;

            double avgLat = (nodeLat + goalLat) / 2.0;

            double x = dLon * std::cos(avgLat);
            double y = dLat;

            return R * std::sqrt(x * x + y * y);
        };
    };

}

SearchResult AStar::search(const Graph& graph, uint32_t start, uint32_t goal) {
    SearchResult result{};

    // starting conditions
    result.found = false;
    result.bidirectional = false;
    result.meetingNode = 0;
    result.distance = 0.0f;
    result.nodesExpanded = 0;

    if (start >= graph.nodeCount() || goal >= graph.nodeCount()) {
        return result;
    }

    // special condition that start = goal
    if (start == goal) {
        result.found = true;
        result.path.push_back(start);

        result.events.push_back({
            SearchEventType::FoundNode,
            SearchDirection::Forward,
            start,
            start
        });

        return result;
    }

    uint32_t nodeCount = graph.nodeCount();

    // build heuristic node function h(n)
    double goalLat = graph.nodeLat(goal);
    double goalLon = graph.nodeLon(goal);
    auto h = equirectangularHeuristic(goalLat, goalLon);

    // priority queue
    std::priority_queue<QueueEntry,std::vector<QueueEntry>,std::greater<QueueEntry>> queue;

    // empty map where came_from[n] is representing the node immediately preceding it on the cheapest path from the start
    std::vector<uint32_t> came_from(nodeCount, UINT32_MAX);

    // g_score[n] is the currently known cost of the cheapest path from start to n
    std::vector<float> g_score(nodeCount, INF);

    // f_score[n] := g_score[n] + h(n). f_score[n] represents our current best guess as to
    // how cheap a path could be from start to finish if it goes through n
    std::vector<float> f_score(nodeCount, INF);

    g_score[start] = 0;
    f_score[start] = h(graph.nodeLat(start),graph.nodeLon(start));
    queue.push({f_score[start], g_score[start],start});

    while (!queue.empty()) {

        QueueEntry current = queue.top();
        queue.pop();

        // skip stale queue entries
        if (current.g_score > g_score[current.node]) {
            continue;
        }

        uint32_t currentNode = current.node;

        // end node reached
        if (currentNode == goal) {
            result.found = true;
            break;
        }

        ++result.nodesExpanded;

        uint32_t begin = graph.edgeBegin(currentNode);
        uint32_t end = graph.edgeEnd(currentNode);

        // loop thru node's neighbors
        for (uint32_t edgeId = begin; edgeId < end; ++edgeId) {

            const Edge& edge = graph.edge(edgeId);
            uint32_t neighbor = edge.to;

            result.events.push_back({
                SearchEventType::FoundEdge,
                SearchDirection::Forward,
                currentNode,
                neighbor
            });

            float tentative_g_score = g_score[currentNode] + edge.distance;

            if (tentative_g_score < g_score[neighbor]) {

                result.events.push_back({
                    SearchEventType::Relax,
                    SearchDirection::Forward,
                    currentNode,
                    neighbor
                });

                came_from[neighbor] = currentNode;
                g_score[neighbor] = tentative_g_score;

                float tentative_f_score = tentative_g_score + static_cast<float>(h(graph.nodeLat(neighbor),graph.nodeLon(neighbor)));

                f_score[neighbor] = tentative_f_score;

                queue.push({tentative_f_score,tentative_g_score,neighbor});
            }
        }
    }

    // reconstruct path
    result.path.push_back(goal);

    uint32_t currentNode = goal;

    while (currentNode != start) {

        if (came_from[currentNode] == UINT32_MAX) {
            result.found = false;
            result.path.clear();
            result.distance = 0.0f;
            return result;
        }

        currentNode = came_from[currentNode];
        result.path.push_back(currentNode);
    }

    // reverse path
    std::reverse(result.path.begin(), result.path.end());

    // g-score at goal is = total path distance
    result.distance = g_score[goal];

    return result;
}