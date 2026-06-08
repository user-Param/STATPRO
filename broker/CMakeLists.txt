cmake_minimum_required(VERSION 3.10)
project(broker)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find dependencies
find_package(Boost CONFIG REQUIRED COMPONENTS thread)
find_package(OpenSSL REQUIRED)
find_package(Threads REQUIRED)
find_package(nlohmann_json REQUIRED)

# Include directories
include_directories(include)

# Create library (optional - you can directly create executable)
add_library(broker STATIC
    src/adapter/eadapter.cpp
    src/exchange/exchange1.cpp
    src/exchange/exchange2.cpp
    src/exchange/exchange3.cpp
)

# Create executable
add_executable(eadapter main.cpp)

# Link executable with broker library and dependencies
target_link_libraries(eadapter
    broker
    ${Boost_LIBRARIES}
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
    nlohmann_json::nlohmann_json

)

# Also link libraries to broker
target_link_libraries(broker
    ${Boost_LIBRARIES}
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
    nlohmann_json::nlohmann_json

)