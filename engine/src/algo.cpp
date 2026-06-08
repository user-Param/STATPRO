#include "../include/algo.h"
#include "../include/algoManager.h"
#include <iostream>

bool Algo::buy(const std::string& symbol, double price, int quantity) {
    if (manager_) {
        std::cout << "[Algo] Buy order: " << symbol << " @ " << price << std::endl;
        return manager_->sendOrder(symbol, price, quantity, "BUY");
    }
    std::cerr << "[Algo] Error: Manager not set for buy order!" << std::endl;
    return false;
}

bool Algo::sell(const std::string& symbol, double price, int quantity) {
    if (manager_) {
        std::cout << "[Algo] Sell order: " << symbol << " @ " << price << std::endl;
        return manager_->sendOrder(symbol, price, quantity, "SELL");
    }
    std::cerr << "[Algo] Error: Manager not set for sell order!" << std::endl;
    return false;
}
