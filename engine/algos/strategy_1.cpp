#include <iostream>
#include <string>
#include <vector>
#include <deque>
#include <map>
#include <cmath>
#include <numeric>
#include "../include/algo.h"
#include "../include/marketData.h"

class StatArbStrategy : public Algo {
private:
    struct Pair {
        std::string coinA;
        std::string coinB;
        double ratio;
        std::deque<double> spreadHistory;
        bool positionOpen;
        std::string currentSide; // "LONG_SPREAD" or "SHORT_SPREAD"
        double entrySpread;
    };

    std::vector<Pair> pairs_;
    const size_t LOOKBACK = 40; // 40 period Bollinger Bands
    const double STD_DEV_MULT = 1.75;
    const double STOP_LOSS_SD = 3.0; // Exit if spread hits 3.0 standard deviations
    const int LEVERAGE = 5;
    const int QUANTITY = 10;

public:
    StatArbStrategy() {
        // Core pairs for StatArb
        pairs_.push_back({"ETH", "XRP", 1.0, {}, false, "", 0.0});
        pairs_.push_back({"ADA", "DOT", 1.0, {}, false, "", 0.0});
        pairs_.push_back({"LINK", "BCH", 1.0, {}, false, "", 0.0});
        pairs_.push_back({"SOL", "AVAX", 1.0, {}, false, "", 0.0});
        pairs_.push_back({"SHIB", "DOGE", 1.0, {}, false, "", 0.0});
    }

    void onTick(const MarketData& data) override {
        // Log every tick for debugging
        std::cout << "[StatArb] Tick: " << data.symbol << " @ " << data.price << std::endl;

        for (auto& pair : pairs_) {
            if (data.symbol == pair.coinA || data.symbol == pair.coinB) {
                calculateAndTrade(pair);
            }
        }
    }

private:
    void calculateAndTrade(Pair& pair) {
        double priceA = getCurrentPrice(pair.coinA);
        double priceB = getCurrentPrice(pair.coinB);

        if (priceA == 0.0 || priceB == 0.0) return;

        double spread = priceA - (pair.ratio * priceB);
        pair.spreadHistory.push_back(spread);

        if (pair.spreadHistory.size() > LOOKBACK) {
            pair.spreadHistory.pop_front();
        } else {
            return; // Need full window for stable indicators
        }

        // Bollinger Bands Calculation
        double sum = std::accumulate(pair.spreadHistory.begin(), pair.spreadHistory.end(), 0.0);
        double sma = sum / pair.spreadHistory.size();

        double sq_sum = 0;
        for (double s : pair.spreadHistory) sq_sum += (s - sma) * (s - sma);
        double std_dev = std::sqrt(sq_sum / pair.spreadHistory.size());

        if (std_dev == 0) return;

        double upper_band = sma + (STD_DEV_MULT * std_dev);
        double lower_band = sma - (STD_DEV_MULT * std_dev);
        double stop_loss_upper = sma + (STOP_LOSS_SD * std_dev);
        double stop_loss_lower = sma - (STOP_LOSS_SD * std_dev);

        if (!pair.positionOpen) {
            // ENTRY LOGIC
            if (spread < lower_band) {
                openLong(pair.coinA, priceA, QUANTITY, LEVERAGE);
                openShort(pair.coinB, priceB, QUANTITY, LEVERAGE);
                pair.positionOpen = true;
                pair.currentSide = "LONG_SPREAD";
                pair.entrySpread = spread;
                std::cout << "[StatArb] 🟢 Entry LONG SPREAD: " << pair.coinA << "/" << pair.coinB << " @ " << spread << std::endl;
            } else if (spread > upper_band) {
                openShort(pair.coinA, priceA, QUANTITY, LEVERAGE);
                openLong(pair.coinB, priceB, QUANTITY, LEVERAGE);
                pair.positionOpen = true;
                pair.currentSide = "SHORT_SPREAD";
                pair.entrySpread = spread;
                std::cout << "[StatArb] 🔴 Entry SHORT SPREAD: " << pair.coinA << "/" << pair.coinB << " @ " << spread << std::endl;
            }
        } else {
            // EXIT LOGIC
            bool should_exit = false;
            std::string reason = "";

            if (pair.currentSide == "LONG_SPREAD") {
                if (spread >= sma) { should_exit = true; reason = "Take Profit (Mean Reversion)"; }
                else if (spread <= stop_loss_lower) { should_exit = true; reason = "Stop Loss (Divergence)"; }
            } else if (pair.currentSide == "SHORT_SPREAD") {
                if (spread <= sma) { should_exit = true; reason = "Take Profit (Mean Reversion)"; }
                else if (spread >= stop_loss_upper) { should_exit = true; reason = "Stop Loss (Divergence)"; }
            }

            if (should_exit) {
                closePosition(pair.coinA, priceA, QUANTITY);
                closePosition(pair.coinB, priceB, QUANTITY);
                pair.positionOpen = false;
                std::cout << "[StatArb] 🏁 Exit: " << pair.coinA << "/" << pair.coinB << " | Reason: " << reason << std::endl;
            }
        }
    }
};

// This part would typically be handled by the AlgoManager's registration system
// or a factory function if dynamically loaded via shared library.
// For now, we'll keep it as a standalone strategy file.
