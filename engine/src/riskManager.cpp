#include "../include/riskManager.h"
#include <iostream>
#include <chrono>

RiskManager::RiskManager() {
    connectExecutor();
}

RiskManager::~RiskManager() {
    if (ws_ && ws_->is_open()) {
        try {
            ws_->close(websocket::close_code::normal);
        } catch (...) {}
    }
}

void RiskManager::connectExecutor() {
    try {
        tcp::resolver resolver(ioc_);
        auto const results = resolver.resolve(host_, port_);
        
        ws_ = std::make_unique<websocket::stream<tcp::socket>>(ioc_);
        net::connect(ws_->next_layer(), results.begin(), results.end());
        
        ws_->handshake(host_ + ":" + port_, "/");
        connected_ = true;
        std::cout << "[RiskManager] ✓ Connected to Executor at " << host_ << ":" << port_ << std::endl;
        
        std::thread([this]() {
            try {
                beast::flat_buffer buffer;
                while (connected_) {
                    ws_->read(buffer);
                    std::string msg = beast::buffers_to_string(buffer.data());
                    buffer.consume(buffer.size());
                    
                    try {
                        auto response = nlohmann::json::parse(msg);
                        if (response.contains("type")) {
                            if (response["type"] == "order_result") {
                                std::cout << "[RiskManager] Order Result - ID: " << response["order_id"] 
                                         << " | Status: " << response["status"] 
                                         << " | Strategy: " << response["strategy_id"] << std::endl;
                            } else {
                                std::cout << "[RiskManager] Feedback: " << msg << std::endl;
                            }
                        }
                    } catch (...) {
                        std::cout << "[RiskManager] Feedback: " << msg << std::endl;
                    }
                }
            } catch (...) {
                connected_ = false;
            }
        }).detach();
        
    } catch (const std::exception& e) {
        std::cerr << "[RiskManager] Failed to connect to Executor: " << e.what() << std::endl;
        connected_ = false;
    }
}

bool RiskManager::validateAndSend(const std::string& symbol, double price, int quantity, 
                                 const std::string& side, const std::string& strategy_id) {
    if (quantity <= 0) {
        std::cerr << "[RiskManager] Rejected: Invalid quantity " << quantity << std::endl;
        return false;
    }
    
    nlohmann::json order = {
        {"type", "order"},
        {"symbol", symbol},
        {"price", price},
        {"quantity", quantity},
        {"side", side},
        {"strategy_id", strategy_id},
        {"order_type", "LIMIT"},
        {"order_id", symbol + "_" + side + "_" + std::to_string(std::time(nullptr))},
        {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count()}
    };
    
    if (!connected_ || !ws_ || !ws_->is_open()) {
        std::cerr << "[RiskManager] Not connected to Executor — retrying..." << std::endl;
        connectExecutor();
    }

    if (connected_ && ws_->is_open()) {
        try {
            ws_->write(net::buffer(order.dump()));
            std::cout << "[RiskManager] ✓ Order sent [" << strategy_id << "]: " 
                      << symbol << " " << side << " " << quantity << " @ $" << price << std::endl;
            return true;
        } catch (const std::exception& e) {
            std::cerr << "[RiskManager] Send error: " << e.what() << std::endl;
            connected_ = false;
            return false;
        }
    } else {
        std::cerr << "[RiskManager] Not connected to Executor" << std::endl;
        return false;
    }
}
