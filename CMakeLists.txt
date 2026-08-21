set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

cmake_minimum_required(VERSION 3.14)
project(PathfinderEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# core library target
add_library(pathfinder_core
    src/algorithms/dijkstra.cpp
    src/algorithms/astar.cpp
    src/graph/graph.cpp
    src/graph/graph_loader.cpp
    src/router/router.cpp
)
target_include_directories(pathfinder_core PUBLIC src)

if(EMSCRIPTEN)
    add_executable(pathfinder_wasm src/wasm_bindings.cpp)
    target_link_libraries(pathfinder_wasm PRIVATE pathfinder_core)

    target_link_options(pathfinder_wasm PRIVATE
        --bind
        -sALLOW_MEMORY_GROWTH=1
        -sFORCE_FILESYSTEM=1
        -sMODULARIZE=1
        -sEXPORT_NAME="PathfinderModule"
        "-sEXPORTED_RUNTIME_METHODS=['FS']"
    )

    set_target_properties(pathfinder_wasm PROPERTIES 
        OUTPUT_NAME "pathfinder"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/web/dist"
    )
else()
    include(FetchContent)
    FetchContent_Declare(
      googletest
      GIT_REPOSITORY https://github.com/google/googletest.git
      GIT_TAG        v1.14.0
    )
    FetchContent_MakeAvailable(googletest)

    enable_testing()
    add_executable(dijkstra_test tests/algorithms/test_dijkstra.cpp)
    target_link_libraries(dijkstra_test PRIVATE pathfinder_core GTest::gtest_main)
    target_compile_definitions(dijkstra_test PRIVATE WORKSPACE_DIR="${CMAKE_SOURCE_DIR}/workspace")

    include(GoogleTest)
    gtest_discover_tests(dijkstra_test)
endif()