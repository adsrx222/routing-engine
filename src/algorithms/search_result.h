#pragma once

#include <cstdint>
#include <vector>

#include "search_event.h"

struct SearchResult {
    bool found;
    bool bidirectional;

    // final route
    std::vector<uint32_t> path;

    // chronological execution
    std::vector<SearchEvent> events;

    // meeting node for bidirectional search algos
    uint32_t meetingNode;

    // final route distance
    float distance;

    // number of nodes expanded
    uint64_t nodesExpanded;
};