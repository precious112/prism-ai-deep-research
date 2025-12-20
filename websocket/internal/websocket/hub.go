package websocket

import (
	"encoding/json"
	"log"

	"github.com/precious112/prism_ai/websocket/internal/broker"
)

// BrokerMessage defines the structure of messages from the broker
type BrokerMessage struct {
	TargetUserID string      `json:"target_user_id"`
	Type         string      `json:"type"`
	Payload      interface{} `json:"payload"`
}

// Hub maintains the set of active clients and broadcasts messages to the
// clients.
type Hub struct {
	// Registered clients.
	clients map[*Client]bool

	// userClients maps userID to a list of connected clients
	userClients map[string][]*Client

	// Inbound messages from the clients.
	broadcast chan []byte

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	broker broker.Broker
}

func NewHub(b broker.Broker) *Hub {
	return &Hub{
		broadcast:   make(chan []byte),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		clients:     make(map[*Client]bool),
		userClients: make(map[string][]*Client),
		broker:      b,
	}
}

func (h *Hub) Run() {
	// Subscribe to the broker
	msgs, err := h.broker.Subscribe("updates")
	if err != nil {
		log.Fatalf("Failed to subscribe to broker: %v", err)
	}

	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			h.userClients[client.userID] = append(h.userClients[client.userID], client)

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)

				// Remove from userClients
				clients := h.userClients[client.userID]
				for i, c := range clients {
					if c == client {
						h.userClients[client.userID] = append(clients[:i], clients[i+1:]...)
						break
					}
				}
				if len(h.userClients[client.userID]) == 0 {
					delete(h.userClients, client.userID)
				}
			}

		case message := <-h.broadcast:
			// Broadcast to everyone (existing functionality)
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}

		case msg := <-msgs:
			// Handle message from broker
			var brokerMsg BrokerMessage
			if err := json.Unmarshal(msg, &brokerMsg); err != nil {
				log.Printf("Error unmarshalling broker message: %v", err)
				continue
			}

			if brokerMsg.TargetUserID != "" {
				// Send to specific user
				if clients, ok := h.userClients[brokerMsg.TargetUserID]; ok {
					for _, client := range clients {
						select {
						case client.send <- msg:
						default:
							close(client.send)
							delete(h.clients, client)
						}
					}
				}
			} else {
				// Broadcast if no target
				for client := range h.clients {
					select {
					case client.send <- msg:
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
			}
		}
	}
}
