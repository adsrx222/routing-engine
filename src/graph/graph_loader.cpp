#include "graph_loader.h"

#include <cstdint>
#include <cstring>
#include <fstream>
#include <stdexcept>

namespace {

  constexpr uint32_t FORMAT_VERSION = 1;

  struct Header {
    char magic[4];
    uint32_t version;
    uint32_t nodeCount;
    uint32_t edgeCount;
  };

  struct BinaryNode {
    uint64_t osmId;
    double lat;
    double lon;
    double x;
    double y;
  };

  struct BinaryEdge {
    uint32_t to;
    float distance;
  };

  void readExact(
      std::ifstream& file,
      void* buffer,
      std::streamsize size) {

    file.read(
        static_cast<char*>(buffer),
        size
    );

    if (!file) {
      throw std::runtime_error(
          "error: end of graph file"
      );
    }
  }

}

Graph GraphLoader::load(const char* filename) {
  std::ifstream file(
      filename,
      std::ios::binary
  );

  if (!file) {
    throw std::runtime_error(
        std::string("Could not open graph file: ") +
        filename
    );
  }

  Header header{};

  readExact(
      file,
      &header,
      sizeof(header)
  );

  // validate magic
  if (std::memcmp(
          header.magic,
          "NAV1",
          4) != 0) {

    throw std::runtime_error(
        "Invalid graph file magic"
    );
  }

  // validate format version
  if (header.version != FORMAT_VERSION) {
    throw std::runtime_error(
        "error: unsupported graph file version"
    );
  }

  Graph graph;

  graph.nodes_.resize(header.nodeCount);
  graph.offsets_.resize(
      static_cast<size_t>(header.nodeCount) + 1
  );
  graph.edges_.resize(header.edgeCount);

  // load nodes
  for (uint32_t i = 0; i < header.nodeCount; ++i) {
    BinaryNode binaryNode{};

    readExact(
        file,
        &binaryNode,
        sizeof(binaryNode)
    );

    Node& node = graph.nodes_[i];

    node.osmId = binaryNode.osmId;

    node.lat = binaryNode.lat;
    node.lon = binaryNode.lon;

    node.x = binaryNode.x;
    node.y = binaryNode.y;
  }

  // load offsets
  readExact(
      file,
      graph.offsets_.data(),
      static_cast<std::streamsize>(
          graph.offsets_.size() *
          sizeof(uint32_t)
      )
  );

  // load edges
  for (uint32_t i = 0; i < header.edgeCount; ++i) {
    BinaryEdge binaryEdge{};

    readExact(
        file,
        &binaryEdge,
        sizeof(binaryEdge)
    );

    Edge& edge = graph.edges_[i];

    edge.to = binaryEdge.to;
    edge.distance = binaryEdge.distance;
  }

  return graph;
}