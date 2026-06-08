#include "Dadapter.h"
#include <thread>

namespace beast = boost::beast;
namespace websocket = beast::websocket;
namespace net = boost::asio;
using tcp = net::ip::tcp;

Dadapter::Dadapter() : ws_(ioc_) {}

Dadapter::~Dadapter() {
    stop();
}

void Dadapter::connect_to_server() {
    const int max_retries = 5;
    int retry_count = 0;
    
    while (retry_count < max_retries) {
        try {
            tcp::resolver resolver(ioc_);
            auto const results = resolver.resolve(server_host_, server_port_);
            
            net::connect(ws_.next_layer(), results.begin(), results.end());
            ws_.handshake(server_host_ + ":" + server_port_, "/");
            
            std::cout << "[WebSocket] Connected to server at " << server_host_ << ":" << server_port_ << std::endl;
            return;
        } catch (std::exception& e) {
            retry_count++;
            if (retry_count < max_retries) {
                std::cerr << "[WebSocket] Connection failed (attempt " << retry_count << "/" << max_retries 
                          << "): " << e.what() << " - retrying in 2 seconds..." << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
            } else {
                std::cerr << "[WebSocket] Connection failed after " << max_retries << " attempts: " << e.what() << std::endl;
                throw;
            }
        }
    }
}

bool Dadapter::connect_to_db() {
    try {
        const char* db_url = std::getenv("DATABASE_URL");
        std::string conn_str = db_url ? db_url : db_config_;
        
        db_conn_ = std::make_unique<pqxx::connection>(conn_str);
        if (db_conn_->is_open()) {
            std::cout << "[PostgreSQL] Connected to database: " << db_conn_->dbname() << std::endl;
            return true;
        }
    } catch (const std::exception &e) {
        std::cerr << "[PostgreSQL] Database connection error: " << e.what() << std::endl;
    }
    return false;
}

nlohmann::json Dadapter::get_profile(const std::string& username) {
    try {
        pqxx::work W(*db_conn_);
        pqxx::result R = W.exec("SELECT * FROM profiles WHERE username = " + W.quote(username));
        
        if (!R.empty()) {
            auto row = R[0];
            return {
                {"username", row["username"].as<std::string>()},
                {"email", row["email"].as<std::string>()},
                {"balance", row["total_balance"].as<double>()},
                {"active_strategies", row["active_strategies_count"].as<int>()}
            };
        }
    } catch (const std::exception &e) {
        std::cerr << "[PostgreSQL] Query error (get_profile): " << e.what() << std::endl;
    }
    return {};
}

void Dadapter::save_strategy(const nlohmann::json& strategy_data) {
    try {
        pqxx::work W(*db_conn_);
        W.exec(
            "INSERT INTO strategies (name, language, content, path) VALUES (" +
            W.quote(strategy_data["name"].get<std::string>()) + ", " +
            W.quote(strategy_data["language"].get<std::string>()) + ", " +
            W.quote(strategy_data["content"].get<std::string>()) + ", " +
            W.quote(strategy_data["path"].get<std::string>()) + ")"
        );
        W.commit();
        std::cout << "[PostgreSQL] Strategy saved: " << strategy_data["name"] << std::endl;
    } catch (const std::exception &e) {
        std::cerr << "[PostgreSQL] Query error (save_strategy): " << e.what() << std::endl;
    }
}

nlohmann::json Dadapter::get_all_strategies() {
    try {
        pqxx::work W(*db_conn_);
        pqxx::result R = W.exec("SELECT id, name, language, content FROM strategies");
        
        nlohmann::json strategies = nlohmann::json::array();
        for (auto const &row : R) {
            strategies.push_back({
                {"id", row["id"].as<std::string>()},
                {"name", row["name"].as<std::string>()},
                {"language", row["language"].as<std::string>()},
                {"content", row["content"].as<std::string>()}
            });
        }
        return strategies;
    } catch (const std::exception &e) {
        std::cerr << "[PostgreSQL] Query error (get_all_strategies): " << e.what() << std::endl;
    }
    return nlohmann::json::array();
}

void Dadapter::stream_db_data() {
    try {
        pqxx::work W(*db_conn_);
        // Fetch data ordered by timestamp
        pqxx::result R = W.exec("SELECT timestamp, symbol, price, bid, ask FROM market_data ORDER BY timestamp ASC LIMIT 10000");
        
        std::cout << "[Dadapter] Starting stream from Database..." << std::endl;
        
        if (R.empty()) {
            std::cout << "[Dadapter] Database is empty, sending mock data for demo..." << std::endl;
            // Generate 100 mock ticks so Engine can finalize backtest
            for (int i = 0; i < 1000; ++i) {
                if (!streaming_) break;
                nlohmann::json data = {
                    {"topic", "backtest_price_"},
                    {"timestamp", std::to_string(1714500000 + i)},
                    {"symbol", "BTCUSDT"},
                    {"price", 60000.0 + (rand() % 100)},
                    {"bid", 59990.0 + (rand() % 100)},
                    {"ask", 60010.0 + (rand() % 100)}
                };
                std::string msg = data.dump();
                {
                    std::lock_guard<std::mutex> lock(ws_mutex_);
                    ws_.write(net::buffer(msg));
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
        } else {
            for (auto const &row : R) {
                if (!streaming_) break;

                nlohmann::json data = {
                    {"topic", "backtest_price_"},
                    {"timestamp", row["timestamp"].as<std::string>()},
                    {"symbol", row["symbol"].as<std::string>()},
                    {"price", row["price"].as<double>()},
                    {"bid", row["bid"].as<double>()},
                    {"ask", row["ask"].as<double>()}
                };

                std::string msg = data.dump();
                {
                    std::lock_guard<std::mutex> lock(ws_mutex_);
                    ws_.write(net::buffer(msg));
                }
                
                // Simulating real-time delay (e.g., 10ms for backtest speed)
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
        }
        
        std::cout << "[Dadapter] Database stream completed." << std::endl;
        
        // Send explicit completion message so Engine knows to finalize results
        nlohmann::json end_msg = {{"topic", "backtest_complete"}};
        {
            std::lock_guard<std::mutex> lock(ws_mutex_);
            ws_.write(net::buffer(end_msg.dump()));
        }

        streaming_ = false;
    } catch (const std::exception &e) {
        std::cerr << "[PostgreSQL] Streaming error: " << e.what() << std::endl;
        streaming_ = false;
    }
}

void Dadapter::start_streaming() {
    if (streaming_) return;
    
    // Ensure previous thread is cleaned up if it was finished but still joinable
    if (stream_thread_.joinable()) {
        stream_thread_.join();
    }
    
    streaming_ = true;
    stream_thread_ = std::thread(&Dadapter::stream_db_data, this);
}

void Dadapter::stop_streaming() {
    streaming_ = false;
    if (stream_thread_.joinable()) stream_thread_.join();
}

void Dadapter::run() {
    try {
        connect_to_server();
        if (!connect_to_db()) {
            std::cerr << "Exiting due to database connection failure." << std::endl;
            return;
        }


        nlohmann::json id = {{"type", "adapter"}};
        {
            std::lock_guard<std::mutex> lock(ws_mutex_);
            ws_.write(net::buffer(id.dump()));
        }

        beast::flat_buffer buffer;
        while (running_) {
            ws_.read(buffer);
            std::string msg = beast::buffers_to_string(buffer.data());
            buffer.consume(buffer.size());

            try {
                auto j = nlohmann::json::parse(msg);
                if (j.contains("command")) {
                    std::string cmd = j["command"];
                    if (cmd == "start") {
                        start_streaming();
                    } else if (cmd == "stop") {
                        stop_streaming();
                    }
                } 
                else if (j.contains("request")) {
                    std::string req = j["request"];
                    nlohmann::json response;
                    response["type"] = "db_response";
                    response["request_id"] = j.value("request_id", "");

                    if (req == "get_profile") {
                        response["data"] = get_profile(j["username"]);
                    } else if (req == "save_strategy") {
                        save_strategy(j["data"]);
                        response["status"] = "success";
                    } else if (req == "get_strategies") {
                        response["data"] = get_all_strategies();
                    }

                    {
                        std::lock_guard<std::mutex> lock(ws_mutex_);
                        ws_.write(net::buffer(response.dump()));
                    }
                }
            } catch (const std::exception& e) {
                // Ignore parse errors or handle them
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[Dadapter] Fatal error: " << e.what() << std::endl;
    }
}

void Dadapter::stop() {
    running_ = false;
    stop_streaming();
}

int main() {
    Dadapter adapter;
    adapter.run();
    return 0;
}






