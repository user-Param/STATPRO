#ifndef ALGO_H
#define ALGO_H

#include "marketData.h"
#include <string>

class AlgoManager; // Forward declaration

class Algo {
public:
    virtual ~Algo() = default;
    virtual void onTick(const MarketData& data) = 0;

    void setManager(AlgoManager* mgr) { manager_ = mgr; }

    bool buy(const std::string& symbol, double price, int quantity);
    bool sell(const std::string& symbol, double price, int quantity);
    
    // Perp-specific functions
    bool openLong(const std::string& symbol, double price, int quantity, int leverage = 1);
    bool openShort(const std::string& symbol, double price, int quantity, int leverage = 1);
    bool closePosition(const std::string& symbol, double price, int quantity);

    double getCorrelation(const std::string& symbol1, const std::string& symbol2) const;
    double getCurrentPrice(const std::string& symbol) const;

protected:
    AlgoManager* manager_ = nullptr;
};

#endif