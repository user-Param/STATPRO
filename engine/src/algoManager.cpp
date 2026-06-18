#include "../include/algoManager.h"
#include "../include/algo/python_algo.h"
#include <iostream>
#include <pybind11/embed.h>
#include <algorithm>
#include <cmath>
#include <numeric>

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

    // Update Global Price Cache
    priceCache_[data.symbol] = data.price;

    // Update price history for correlation monitoring
    auto it = std::find(monitoredSymbols_.begin(), monitoredSymbols_.end(), data.symbol);
    if (it != monitoredSymbols_.end()) {
        auto& history = priceHistory_[data.symbol];
        history.push_back(data.price);
        if (history.size() > historySize_) {
            history.pop_front();
        }
    }

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

bool AlgoManager::sendOrder(const std::string& symbol, double price, int quantity,
                           const std::string& side, const std::string& strategy_id, int leverage) {
    if (order_callback_) {
        order_callback_(symbol, price, quantity, side, strategy_id, leverage);
    }

    if (riskManager_) {
        return riskManager_->validateAndSend(symbol, price, quantity, side, strategy_id, leverage);
    }
    return false;
}

size_t AlgoManager::getAlgoCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return algos_.size();
}

void AlgoManager::setOrderCallback(OrderCallback cb) {
    order_callback_ = std::move(cb);
}

double AlgoManager::getCurrentPrice(const std::string& symbol) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = priceCache_.find(symbol);
    if (it != priceCache_.end()) {
        return it->second;
    }
    return 0.0;
}

// New correlation monitoring methods
void AlgoManager::setMonitoredSymbols(const std::vector<std::string>& symbols) {
    std::lock_guard<std::mutex> lock(mutex_);
    monitoredSymbols_ = symbols;
    // Initialize price history for each symbol
    for (const auto& sym : symbols) {
        if (priceHistory_.find(sym) == priceHistory_.end()) {
            priceHistory_[sym] = std::deque<double>();
        }
    }
}

double AlgoManager::getCorrelation(const std::string& symbol1, const std::string& symbol2) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it1 = priceHistory_.find(symbol1);
    auto it2 = priceHistory_.find(symbol2);
    if (it1 == priceHistory_.end() || it2 == priceHistory_.end()) {
        return 0.0;
    }
    const auto& hist1 = it1->second;
    const auto& hist2 = it2->second;
    if (hist1.empty() || hist2.empty()) {
        return 0.0;
    }
    // Use the overlapping window size (min length)
    size_t n = std::min(hist1.size(), hist2.size());
    if (n < 10) { // need minimum samples
        return 0.0;
    }
    // Extract the last n elements from each deque
    auto start1 = hist1.end() - static_cast<std::ptrdiff_t>(n);
    auto start2 = hist2.end() - static_cast<std::ptrdiff_t>(n);
    double sum_x = 0.0, sum_y = 0.0, sum_xy = 0.0, sum_x2 = 0.0, sum_y2 = 0.0;
    for (size_t i = 0; i < n; ++i) {
        double x = *(start1 + i);
        double y = *(start2 + i);
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
        sum_y2 += y * y;
    }
    double mean_x = sum_x / n;
    double mean_y = sum_y / n;
    double covariance = (sum_xy - n * mean_x * mean_y) / (n - 1);
    double std_x = std::sqrt((sum_x2 - n * mean_x * mean_x) / (n - 1));
    double std_y = std::sqrt((sum_y2 - n * mean_y * mean_y) / (n - 1));
    if (std_x == 0.0 || std_y == 0.0) {
        return 0.0;
    }
    return covariance / (std_x * std_y);
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
    } catch (const std::exception& e) {
        std::cerr << "[AlgoManager] Standard exception: " << e.what() << std::endl;
    }
}