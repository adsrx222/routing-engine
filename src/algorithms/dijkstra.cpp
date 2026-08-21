#include "dijkstra.h"

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

SearchResult Dijkstra::search(
    const Graph& graph,
    uint32_t start,
    uint32_t goal) {

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

  const uint32_t nodeCount = graph.nodeCount();

  std::vector<float> distances(
      nodeCount,
      INF // starts at inf
  );

  // previous nodes
  std::vector<uint32_t> prev(
      nodeCount,
      UINT32_MAX // undefined
  );

  // vector to prevent expanding the same node multiple times
  std::vector<bool> expanded(
      nodeCount,
      false
  );

  std::priority_queue<QueueEntry,std::vector<QueueEntry>,std::greater<QueueEntry>> queue;

  // insert starting node
  distances[start] = 0.0f;
  queue.push({
      0.0f,
      start
  });
  result.events.push_back({
      SearchEventType::FoundNode,
      SearchDirection::Forward,
      start,
      start
  });

  while (!queue.empty()) {

    QueueEntry current = queue.top();
    queue.pop();

    uint32_t currentNode = current.node;

    // ignore stale priority queue entries
    if (current.distance != distances[currentNode]) {
      continue;
    }

    // skip if node has already been expanded
    if (expanded[currentNode]) {
      continue;
    }

    expanded[currentNode] = true;
    result.nodesExpanded++;

    // dijkstra can stop once the goal is removed
    if (currentNode == goal) {
      result.found = true;
      result.distance = distances[goal];
      break;
    }

    // iterate over this node's edges
    uint32_t begin = graph.edgeBegin(currentNode);
    uint32_t end = graph.edgeEnd(currentNode);

    for (uint32_t edgeId = begin; edgeId < end; ++edgeId) {

      const Edge& edge = graph.edge(edgeId);
      uint32_t neighbor = edge.to;

      // add newly found edges as events
      result.events.push_back({
          SearchEventType::FoundEdge,
          SearchDirection::Forward,
          currentNode,
          neighbor
      });

      float newDistance = distances[currentNode] + edge.distance;

      // relax  edge if better route is found
      if (newDistance < distances[neighbor]) {

        distances[neighbor] = newDistance;
        prev[neighbor] = currentNode;

        queue.push({newDistance, neighbor}); // push new nodes

        result.events.push_back({
            SearchEventType::Relax,
            SearchDirection::Forward,
            currentNode,
            neighbor
        });
      }
    }
  }

  // no route found
  if (!result.found) {
    return result;
  }

  // reconstruct path
  uint32_t current = goal;
  while (current != UINT32_MAX) {
    result.path.push_back(current);

    if (current == start) {
      break;
    }

    current = prev[current];
  }

  // case if path was not connected to start
  if (result.path.empty() ||
      result.path.back() != start) {

    result.found = false;
    result.path.clear();
    result.distance = 0.0f;

    return result;
  }

  // reverse path
  std::reverse(
      result.path.begin(),
      result.path.end()
  );

  return result;
}