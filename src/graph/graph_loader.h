#pragma once

#include "graph.h"

class GraphLoader {
 public:
  static Graph load(const char* filename);
};