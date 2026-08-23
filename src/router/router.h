#pragma once

#include "../algorithms/algorithm.h"

enum class Algorithm { Dijkstra, AStar, Double_AStar };

class Router {
 public:
  explicit Router(const Graph& graph);
  SearchResult route(Algorithm algorithm, uint32_t start, uint32_t goal);

 private:
  const Graph& graph_;
};