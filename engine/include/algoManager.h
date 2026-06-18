#ifndef ALGOMANAGER_H
#define ALGOMANAGER_H

#include <vector>
#include <memory>
#include <string>
#include <functional>
#include <filesystem>
#include <mutex>
#include <deque>
#include <unordered_map>
#include "algo.h"
#include "marketData.h"
#include "riskManager.h"

namespace pybind11 { class scoped_interpreter; }

class AlgoManager {
public:
    using OrderCallback = std::function<void(const std::string& symbol, double price, int quantity, const std::string& side, const std::string& strategy_id, int leverage)>;

    explicit AlgoManager(std::shared_ptr<RiskManager> riskMgr);
    ~AlgoManager();

    void addAlgo(std::unique_ptr<Algo> algo);
    void activateAlgo(size_t index, bool active);
    void activateOnly(const std::string& strategy_id);
    void onTick(const MarketData& data);
    void loadStrategies(const std::string& path = "algos");

    bool sendOrder(const std::string& symbol, double price, int quantity,
                   const std::string& side, const std::string& strategy_id = "default", int leverage = 1);

    size_t getAlgoCount() const;
    void setOrderCallback(OrderCallback cb);

    // Symbol management for correlation monitoring
    void setMonitoredSymbols(const std::vector<std::string>& symbols);
    double getCorrelation(const std::string& symbol1, const std::string& symbol2) const;
    double getCurrentPrice(const std::string& symbol) const;

private:
    struct AlgoInstance {
        std::unique_ptr<Algo> algo;
        std::string strategy_id;
        bool active;
        std::string source_file;
        std::filesystem::file_time_type last_modified;
    };
    std::vector<AlgoInstance> algos_;
    std::shared_ptr<RiskManager> riskManager_;
    OrderCallback order_callback_;
    std::string strategy_path_ = "../algos";
    std::unique_ptr<pybind11::scoped_interpreter> python_guard_;
    mutable std::mutex mutex_;

    // Shared Market State / Price History
    std::unordered_map<std::string, std::deque<double>> priceHistory_;
    std::unordered_map<std::string, double> priceCache_;
    size_t historySize_ = 100; // keep last N prices per symbol
    std::vector<std::string> monitoredSymbols_;

    void loadPythonStrategy(const std::filesystem::path& file);
};
#endif