#include <gtest/gtest.h>
#include <string>

#include "algorithms/dijkstra.h"
#include "graph/graph_loader.h"

class DijkstraTest : public ::testing::Test {
 protected:
  Dijkstra dijkstra;

  Graph createMockGraph() {
    // WORKSPACE_DIR is injected as a quoted string literal by CMake
    std::string workspace = WORKSPACE_DIR;
    std::string path = workspace + "/mock_graph.bin";
    return GraphLoader::load(path.c_str());
  }
};

TEST_F(DijkstraTest, HandlesOutOfBoundsNodes) {
  Graph graph = createMockGraph();

  // Out-of-bounds start/goal nodes should immediately return false
  SearchResult result = dijkstra.search(graph, 0, 999);

  EXPECT_FALSE(result.found);
  EXPECT_EQ(result.distance, 0.0f);
}

TEST_F(DijkstraTest, HandlesStartEqualsGoal) {
  Graph graph = createMockGraph();

  // Start equal to goal returns distance 0 and a path with just the start node
  SearchResult result = dijkstra.search(graph, 1, 1);

  EXPECT_TRUE(result.found);
  EXPECT_EQ(result.distance, 0.0f);

  ASSERT_EQ(result.path.size(), 1u);
  EXPECT_EQ(result.path[0], 1u);
}

TEST_F(DijkstraTest, FindsShortestPathOverDirectEdge) {
  Graph graph = createMockGraph();

  // Prefers 0 -> 1 -> 2 (dist 15.0) over direct edge 0 -> 2 (dist 20.0)
  SearchResult result = dijkstra.search(graph, 0, 2);

  EXPECT_TRUE(result.found);
  EXPECT_EQ(result.distance, 15.0f);

  ASSERT_EQ(result.path.size(), 3u);
  EXPECT_EQ(result.path[0], 0u);
  EXPECT_EQ(result.path[1], 1u);
  EXPECT_EQ(result.path[2], 2u);
}