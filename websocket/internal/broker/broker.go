package broker

// Broker defines the interface for message broker operations
type Broker interface {
	Publish(topic string, message []byte) error
	Subscribe(topic string) (<-chan []byte, error)
	Close() error
}

// MockBroker is a placeholder implementation
type MockBroker struct{}

func NewMockBroker() *MockBroker {
	return &MockBroker{}
}

func (m *MockBroker) Publish(topic string, message []byte) error {
	return nil
}

func (m *MockBroker) Subscribe(topic string) (<-chan []byte, error) {
	return make(chan []byte), nil
}

func (m *MockBroker) Close() error {
	return nil
}
