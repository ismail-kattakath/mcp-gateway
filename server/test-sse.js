#!/usr/bin/env node

/**
 * Simple SSE test client
 */

import EventSource from 'eventsource';
const EventSourceConstructor = EventSource.default || EventSource;

const url = 'http://localhost:3000/sse';

console.log(`Connecting to SSE endpoint: ${url}`);

const eventSource = new EventSourceConstructor(url);

eventSource.onopen = () => {
  console.log('✓ SSE connection opened');
};

eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log('Received:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log('Raw message:', event.data);
  }
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
  process.exit(1);
};

// Close after 5 seconds
setTimeout(() => {
  console.log('\nClosing connection...');
  eventSource.close();
  process.exit(0);
}, 5000);
