#ifndef RISKMANAGER_H
#define RISKMANAGER_H

#include <memory>
#include <string>
#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <nlohmann/json.hpp>
#include <thread>
#include <atomic>

namespace net = boost::asio;
namespace beast = boost::beast;
namespace websocket = beast::websocket;
using tcp = net::ip::tcp;

class RiskManager {
public:
    RiskManager();
    ~RiskManager();

    // Validate and send order to Executor
    bool validateAndSend(const std::string& symbol, double price, int quantity, 
                         const std::string& side, const std::string& strategy_id = "default");

private:
    void connectExecutor();
    
    net::io_context ioc_;
    std::unique_ptr<websocket::stream<tcp::socket>> ws_;
    std::string host_ = "localhost";
    std::string port_ = "9001";
    std::atomic<bool> connected_{false};
};

#endif
