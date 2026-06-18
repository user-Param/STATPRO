#include <iostream>
#include <string>
#include <memory>
#include <thread>
#include <boost/asio/signal_set.hpp>
#include <pybind11/embed.h>
#include "../include/algoManager.h"
#include "../include/riskManager.h"
#include "../include/algo.h"
#include "../include/engine.h"
#include "../algos/strategy_1.cpp"

namespace py = pybind11;

int main(int argc, char** argv)
{
    try
    {
        std::cout << "--- Starting STATPRO Engine ---" << std::endl;

        // 1. Initialize RiskManager (Connects to Executor on 9001)
        auto riskMgr = std::make_shared<RiskManager>();
        
        // 2. Initialize AlgoManager
        auto algoMgr = std::make_shared<AlgoManager>(riskMgr);
        
        // 3. Load C++ StatArb Strategy
        std::cout << "[Main] Loading C++ StatArb Strategy..." << std::endl;
        algoMgr->addAlgo(std::make_unique<StatArbStrategy>());

        // 4. Load Python strategies
        algoMgr->loadStrategies("../algos");

        // 5. Initialize Engine (Connects to Datafeed on 9000)
        Engine engine(algoMgr);
        // Topics are now handled internally by Engine::start() using ELIGIBLE_TOKENS
        engine.start();

        std::this_thread::sleep_for(std::chrono::seconds(1));
        engine.sendMode("_Live");

        std::cout << "\nEngine is running. Trading logic active." << std::endl;

        // RELEASE GIL HERE so other threads can use Python
        py::gil_scoped_release release;

        boost::asio::io_context ioc;
        boost::asio::signal_set signals(ioc, SIGINT, SIGTERM);
        signals.async_wait([&](const boost::system::error_code&, int) {
            std::cout << "\nEngine shutdown signal received." << std::endl;
            ioc.stop();
        });

        ioc.run();

        engine.stop();
        std::cout << "Engine stopped safely." << std::endl;
    }
    catch(std::exception const& e)
    {
        std::cerr << "Engine Fatal Error: " << e.what() << std::endl;
        return EXIT_FAILURE;
    }
    return EXIT_SUCCESS;
}
