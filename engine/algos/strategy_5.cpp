#include <iostream>
#include <string>
#include <map>
#include <vector>

// Strategy Configuration
struct MarketData {
    double price;
    double bid;
    double ask;
    std::string symbol;
    long timestamp;
};

// Algo Base Class (simplified)
class Algo {
public:
    virtual ~Algo() = default;
    virtual void onTick(const MarketData& md) = 0;
};

// Your Strategy Implementation
class MyStrategy : public Algo {
private:
    std::string symbol_;
    double lastPrice_;
    
public:
    MyStrategy(const std::string& symbol) 
        : symbol_(symbol), lastPrice_(0.0) {}
    
    void onTick(const MarketData& md) override {
        // Your optimized C++ trading logic here
        if (md.price > lastPrice_ * 1.01) {
            std::cout << "Price spike detected! Buy signal" << std::endl;
        } else if (md.price < lastPrice_ * 0.99) {
            std::cout << "Price drop detected! Sell signal" << std::endl;
        }
        lastPrice_ = md.price;
    }
};

// Test the strategy
int main() {
    MyStrategy strategy("BTCUSDT");
    
    // Simulate market data
    MarketData md = {.price = 50000, .bid = 49999, .ask = 50001, .symbol = "BTCUSDT", .timestamp = 0};
    strategy.onTick(md);
    
    std::cout << "Strategy compiled and executed successfully!" << std::endl;
    return 0;
}