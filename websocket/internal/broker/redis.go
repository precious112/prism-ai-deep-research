package broker

import (
	"context"

	"github.com/redis/go-redis/v9"
)

type RedisBroker struct {
	client *redis.Client
	ctx    context.Context
}

func NewRedisBroker(addr string, password string, db int) *RedisBroker {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password, // no password set
		DB:       db,       // use default DB
	})

	return &RedisBroker{
		client: rdb,
		ctx:    context.Background(),
	}
}

func (r *RedisBroker) Publish(topic string, message []byte) error {
	return r.client.Publish(r.ctx, topic, message).Err()
}

func (r *RedisBroker) Subscribe(topic string) (<-chan []byte, error) {
	pubsub := r.client.Subscribe(r.ctx, topic)

	// Wait for confirmation that subscription is created before returning
	_, err := pubsub.Receive(r.ctx)
	if err != nil {
		return nil, err
	}

	ch := pubsub.Channel()
	out := make(chan []byte)

	go func() {
		defer close(out)
		for msg := range ch {
			out <- []byte(msg.Payload)
		}
	}()

	return out, nil
}

func (r *RedisBroker) Close() error {
	return r.client.Close()
}
