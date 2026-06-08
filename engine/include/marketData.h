#ifndef MARKETDATA_H
#define MARKETDATA_H

#include <string>
#include <cstdint>

struct MarketData {
    std::string symbol;
    double price;
    double bid;
    double ask;
    int quantity;
    uint64_t timestamp;
};

#endif