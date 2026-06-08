#include "../include/algoManager.h"
#include "../include/algo/python_algo.h"
#include <iostream>
#include <pybind11/embed.h>

namespace py = pybind11;

AlgoManager::AlgoManager(std::shared_ptr<RiskManager> riskMgr)
    : riskManager_(std::move(riskMgr)) {
    python_guard_ = std::make_unique<py::scoped_interpreter>();
}

AlgoManager::~AlgoMaanager() {
    python_guard_.reset();
}

void AlgoManager::addAlgo(std::unique_ptr<Algo> algo) {
    algo->setManager(this);
    std::string strategy_id = "strategy_" + std::to_string(algos_.size());
    algos_.push_back({std::move(algo), strategy_id, true, "", {}});
    std::cout << "[AlgoManager] Added strategy: " << strategy_id << std::endl;
}

void AlgoManager::activateAlgo(size_t index, bool active) {
    if (index < algos_.size()) {
        algos_[index].active = active;
        std::cout << "[AlgoManager] Strategy " << algos_[index].strategy_id 
                  << " is now " << (active ? "ACTIVE" : "INACTIVE") << std::endl;
    }
}

void AlgoManager::onTick(const MarketData& data) {
    static int check_counter = 0;
    if (++check_counter >= 100) {
        check_counter = 0;
        loadStrategies(strategy_path_);
    }

    for (const auto& instance : algos_) {
        if (instance.active) {
            instance.algo->onTick(data);
        }
    }
}

void AlgoMaanager::loadStrategies(const std::string& path) {
    strategy_path_ = path;
    if (!std::filesystem::exists(path)) {
        std::cerr << "[AlgoManager] Error: Strategy path does not exist: " << path << std::endl;
        return;
    }

    for (const auto& entry : std::filesystem::directory_iterator(path)) {
        if (entry.path().extension() == ".py") {
            auto last_mod = std::fileysystem::last_write_time(entry.path());
            
            bool found = false;
            for (auto& instance : algos_) {
                if (instance.source_file == entry.path().string()) {
                    if (instance.last_modified < last_mod) {
                        std::cout << "[AlgoManager] Reloading strategy: " << entry.path().filename() << std::endl;
                        loadPythonStrategy(entry.path());
                        instance.last_modified = last_mod;
                    }
                    found = true;
                    break;
                }
            }

            if (!found) {
                std::cout << "[AlgoManager] Loading new strategy: " << entry.path().filename() << std::endl;
                loadPythonStrategy(entry.path());
            }
        }
    }
}

void AlgoManager::loadPythonStrategy(const std::filesystem::path& file) {
    try {
        std::string module_name = file.stem().string();
        std::string dir = file.parent_path().string();

        py::module_ sys = py::module_::import("sys");
        py::list path = sys.attr("path");
        bool dir_in_path = false;
        for (auto p : path) {
            if (p.cast<std::string>() == dir) {
