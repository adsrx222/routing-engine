#pragma once

#include <cstdint>
#include <vector>

enum class SearchEventType {
  FoundNode,  // enable node on map
  FoundEdge,  // enable edge on map
  Relax       // disable edge + "to" node
};

enum class SearchDirection {
  Forward,  // origin starting search
  Backward  // destination starting search
};

struct SearchEvent {
  SearchEventType type;
  SearchDirection direction;

  uint32_t from;
  uint32_t to;
};