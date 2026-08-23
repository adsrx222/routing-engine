#pragma once

#include <cstdint>
#include <vector>

enum class SearchEventType {
  FoundNode,  // enable node on map
  FoundEdge,  // enable edge on map
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
  uint32_t node;

  SearchEvent() = default;

  SearchEvent(SearchEventType type, SearchDirection direction, uint32_t from, uint32_t to)
      : type(type), direction(direction), from(from), to(to), node(UINT32_MAX) {}

  // constructor for dedicated node events (bidirectional only)
  SearchEvent(SearchEventType type, SearchDirection direction, uint32_t node)
      : type(type), direction(direction), from(UINT32_MAX), to(UINT32_MAX), node(node) {}
};