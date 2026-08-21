#pragma once

#include <cstdint>

#include "../graph/graph.h"
#include "search_result.h"

class PathfindingAlgorithm {
 public:
  virtual ~PathfindingAlgorithm() = default;

  virtual SearchResult search(
      const Graph& graph,
      uint32_t start,
      uint32_t goal) = 0;
};