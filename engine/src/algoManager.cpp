#include "../include/algoManager.h"
#include "../include/algo/python_algo.h"
#include <iostream>
#include <pybind11/embed.h>

namespace py = pybind11;

AlgoManager::AlgoManager(std::shared_ptr<RiskManager> riskMgr)
    : riskManager_(std::move(riskMgr)) {
    python_guard_ = std::make_unique<py::scoped_interpreter>();
}

AlgoManager::~AlgoManager() {
    py::gil_scoped_acquire acquire;
    python_guard_.reset();
}

void AlgoManager::addAlgo(std::unique_ptr<Algo> algo) {
    std::lock_guard<std::mutex> lock(mutex_);
    algo->setManager(this);
    std::string strategy_id = "strategy_" + std::to_string(algos_.size());
    algos_.push_back({std::move(algo), strategy_id, true, "", {}});
    std::cout << "[AlgoManager] Added hardcoded strategy: " << strategy_id << std::endl;
}

void AlgoManager::activateAlgo(size_t index, bool active) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (index < algos_.size()) {
        algos_[index].active = active;
        std::cout << "[AlgoManager] Strategy " << algos_[index].strategy_id 
                  << " is now " << (active ? "ACTIVE" : "INACTIVE") << std::endl;
    }
}

void AlgoManager::activateOnly(const std::string& strategy_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& instance : algos_) {
        instance.active = (instance.strategy_id == strategy_id);
        if (instance.active) {
            std::cout << "[AlgoManager] Isolated strategy for backtesting: " << strategy_id << std::endl;
        }
    }
}

void AlgoManager::onTick(const MarketData& data) {
    {
        static int check_counter = 0;
        if (++check_counter >= 100) {
            check_counter = 0;
            loadStrategies(strategy_path_);
        }
    }

    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& instance : algos_) {
        if (instance.active) {
            try {
                instance.algo->onTick(data);
            } catch (const std::exception& e) {
                std::cerr << "[AlgoManager] Error ticking " << instance.strategy_id << ": " << e.what() << std::endl;
            } catch (...) {
                std::cerr << "[AlgoManager] Unknown error ticking " << instance.strategy_id << std::endl;
            }
        }
    }
}

void AlgoManager::loadStrategies(const std::string& path) {
    strategy_path_ = path;
    if (!std::filesystem::exists(path)) {
        std::cerr << "[AlgoManager] Error: Strategy path does not exist: " << path << std::endl;
        return;
    }

    for (const auto& entry : std::filesystem::directory_iterator(path)) {
        if (entry.path().extension() == ".py") {
            auto last_mod = std::filesystem::last_write_time(entry.path());
            
            bool found = false;
            {
                std::lock_guard<std::mutex> lock(mutex_);
                for (auto& instance : algos_) {
                    if (instance.source_file == entry.path().string()) {
                        if (instance.last_modified < last_mod) {
                            found = false; // Trigger reload
                        } else {
                            found = true;
                        }
                        break;
                    }
                }
            }

            if (!found) {
                std::cout << "[AlgoManager] Loading/Reloading strategy: " << entry.path().filename() << std::endl;
                loadPythonStrategy(entry.path());
                // Update last_modified after loading
                std::lock_guard<std::mutex> lock(mutex_);
                for (auto& instance : algos_) {
                    if (instance.source_file == entry.path().string()) {
                        instance.last_modified = last_mod;
                        break;
                    }
                }
            }
        }
    }
}

void AlgoManager::loadPythonStrategy(const std::filesystem::path& file) {
    py::gil_scoped_acquire acquire;
    try {
        std::string module_name = file.stem().string();
        std::string dir = file.parent_path().string();

        py::module_ sys = py::module_::import("sys");
        py::list path = sys.attr("path");
        bool dir_in_path = false;
        for (auto p : path) {
            if (p.cast<std::string>() == dir) {
                dir_in_path = true;
                break;
            }
        }
        if (!dir_in_path) path.attr("append")(dir);

        if (sys.attr("modules").contains(module_name.c_str())) {
            py::module_ importlib = py::module_::import("importlib");
            py::object mod = sys.attr("modules")[module_name.c_str()];
            importlib.attr("reload")(mod);
        }

        py::module_ mod = py::module_::import(module_name.c_str());
        py::dict d = mod.attr("__dict__");
        
        for (auto item : d) {
            py::object obj = py::reinterpret_borrow<py::object>(item.second);
            if (py::isinstance<py::type>(obj)) {
                if (py::hasattr(obj, "on_tick") || py::hasattr(obj, "onTick")) {
                    py::object py_instance = obj();
                    
                    try {
                        Algo* cpp_part = py_instance.cast<Algo*>();
                        if (cpp_part) {
                            cpp_part->setManager(this);
                        }
                    } catch (...) {}

                    auto algo = std::make_unique<PythonAlgo>(py_instance);
                    algo->setManager(this);
                    
                    std::lock_guard<std::mutex> lock(mutex_);
                    bool replaced = false;
                    for (auto& instance : algos_) {
                        if (instance.source_file == file.string()) {
                            instance.algo = std::move(algo);
                            instance.strategy_id = module_name;
                            replaced = true;
                            break;
                        }
                    }
                    if (!replaced) {
                        algos_.push_back({std::move(algo), module_name, true, file.string(), std::filesystem::last_write_time(file)});
                    }
                    std::cout << "[AlgoManager] Successfully integrated " << module_name << " into execution loop." << std::endl;
                    return;
                }
            }
        }
    } catch (const py::error_already_set& e) {
        std::cerr << "[AlgoManager] Python error loading " << file << ": " << e.what() << std::endl;
    }
}

bool AlgoManager::sendOrder(const std::string& symbol, double price, int quantity, 
                           const std::string& side, const std::string& strategy_id) {
    if (order_callback_) {
        order_callback_(symbol, price, quantity, side, strategy_id);
    }
    
    if (riskManager_) {
        return riskManager_->validateAndSend(symbol, price, quantity, side, strategy_id);
    }
    return false;
}
