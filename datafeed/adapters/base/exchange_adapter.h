#ifndef EXCHANGE_ADAPTER_H
#define EXCHANGE_ADAPTER_H

#include <string>
#include <vector>
#include <memory>
#include "../../market_data.h"
#include "../../session/session_manager.h"

class exchange_adapter {
public:
    virtual ~exchange_adapter() = default;
    
    // All exchanges MUST implement these
    virtual void connect() = 0;
    virtual void disconnect() = 0;
    virtual void subscribe(const std::vector<std::string>& symbols) = 0;
    virtual void on_market_data(const MarketData& data) = 0;
    
    // Exchange info
    virtual std::string exchange_name() const = 0;
    virtual bool is_connected() const = 0;
    
    // Rate limiting info
    virtual size_t requests_per_second() const = 0;
    virtual size_t websocket_limit() const = 0;
    
protected:
    std::shared_ptr<session_manager> manager_;
};
#endif