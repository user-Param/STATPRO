#ifndef ALGOMANAGER_H
#define ALGOMANAGER_H

#include <vector>
#include <memory>
#include <string>
#include <functional>
#include <filesystem>
#include <mutex>
#include "algo.h"
#include "marketData.h"
#include "riskManager.h"

namespace pybind11 { class scoped_interpreter; }

class AlgoManager {
public:
    using OrderCallback = std::function<void(const std::string& symbol, double price, int quantity, const std::string& side, const std::string& strategy_id)>;

    explicit AlgoManager(std::shared_ptr<RiskManager> riskMgr);
    ~AlgoManager();

    void addAlgo(std::unique_ptr<Algo> algo);
    void activateAlgo(size_t index, bool active);
    void onTick(const MarketData& data);
    void loadStrategies(const std::string& path = "algos");
    
    bool sendOrder(const std::string& symbol, double price, int quantity, 
                   const std::string& side, const std::string& strategy_id = "default");

    size_t getAlgoCount() const { 
        std::lock_guard<std::mutex> lock(mutex_);
        return algos_.size(); 
    }
    void setOrderCallback(OrderCallback cb) { order_callback_ = std::move(cb); }

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

    void loadPythonStrategy(const std::filesystem::path& file);
};

#endif
