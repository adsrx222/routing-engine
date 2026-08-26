#pragma once

#include <cstdint>
#include <vector>

struct Node {
  uint64_t osmId;
  double lat;
  double lon;
  double x;
  double y;
};

struct Edge {
  uint32_t to;
  float distance;
};

class Graph {
 public:
  const Node& node(uint32_t id) const;

  uint32_t nodeCount() const;
  uint32_t edgeCount() const;

  uint32_t edgeBegin(uint32_t nodeId) const;
  uint32_t edgeEnd(uint32_t nodeId) const;
  const Edge& edge(uint32_t edgeId) const;

  double nodeLat(uint32_t edgeId) const;
  double nodeLon(uint32_t edgeId) const;
  

 private:
  std::vector<Node> nodes_;
  std::vector<uint32_t> offsets_;
  std::vector<Edge> edges_;

  friend class GraphLoader;
};