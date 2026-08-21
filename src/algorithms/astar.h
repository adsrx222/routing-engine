#pragma once

#include "algorithm.h"

class AStar : public PathfindingAlgorithm {
 public:
  SearchResult search(
      const Graph& graph,
      uint32_t start,
      uint32_t goal) override;
};