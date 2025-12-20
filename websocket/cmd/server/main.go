package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"

	"github.com/precious112/prism_ai/websocket/internal/broker"
	"github.com/precious112/prism_ai/websocket/internal/websocket"
)

var addr = flag.String("addr", ":8080", "http service address")
var redisAddr = flag.String("redis", "localhost:6379", "redis address")

func main() {
	flag.Parse()

	// Initialize Broker (Redis)
	// You might want to make this configurable to switch between Mock and Redis
	// For now, we default to Redis as requested, but fall back to Mock if needed?
	// The user explicitly asked for Redis.
	rBroker := broker.NewRedisBroker(*redisAddr, "", 0)
	defer rBroker.Close()

	hub := websocket.NewHub(rBroker)
	go hub.Run()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websocket.ServeWs(hub, w, r)
	})

	// Health check endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Test endpoint to publish messages
	http.HandleFunc("/publish", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var msg websocket.BrokerMessage
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Marshal back to bytes to send to broker
		payload, err := json.Marshal(msg)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if err := rBroker.Publish("updates", payload); err != nil {
			http.Error(w, "Failed to publish: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Message published"))
	})

	log.Printf("WebSocket server starting on %s", *addr)
	log.Printf("Connected to Redis at %s", *redisAddr)

	err := http.ListenAndServe(*addr, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
