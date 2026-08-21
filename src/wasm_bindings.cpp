#include <emscripten/bind.h>
#include <string>

#include "graph/graph.h"
#include "graph/graph_loader.h"
#include "router/router.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(pathfinder_module) {
  // Enums
  enum_<Algorithm>("Algorithm")
      .value("Dijkstra", Algorithm::Dijkstra)
      .value("AStar", Algorithm::AStar);

  enum_<SearchEventType>("SearchEventType")
      .value("FoundNode", SearchEventType::FoundNode)
      .value("FoundEdge", SearchEventType::FoundEdge)
      .value("Relax", SearchEventType::Relax);

  enum_<SearchDirection>("SearchDirection")
      .value("Forward", SearchDirection::Forward)
      .value("Backward", SearchDirection::Backward);

  // Vectors
  register_vector<uint32_t>("VectorUint32");
  register_vector<SearchEvent>("VectorSearchEvent");

  // Value Objects
  value_object<SearchEvent>("SearchEvent")
      .field("type", &SearchEvent::type)
      .field("direction", &SearchEvent::direction)
      .field("from", &SearchEvent::from)
      .field("to", &SearchEvent::to);

  value_object<SearchResult>("SearchResult")
      .field("found", &SearchResult::found)
      .field("bidirectional", &SearchResult::bidirectional)
      .field("path", &SearchResult::path)
      .field("events", &SearchResult::events)
      .field("meetingNode", &SearchResult::meetingNode)
      .field("distance", &SearchResult::distance)
      .field("nodesExpanded", &SearchResult::nodesExpanded);

  // Core Classes
  class_<Graph>("Graph")
      .function("nodeCount", &Graph::nodeCount)
      .function("edgeCount", &Graph::edgeCount);

  class_<GraphLoader>("GraphLoader")
      .class_function("load", optional_override([](const std::string& path) {
        return GraphLoader::load(path.c_str());
      }));

  class_<Router>("Router")
      .constructor<const Graph&>()
      .function("route", &Router::route);
}