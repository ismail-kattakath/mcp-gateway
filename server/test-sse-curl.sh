#!/bin/bash

# Simple SSE test using curl
echo "Testing SSE endpoint at http://localhost:3000/sse"
echo "Will collect data for 5 seconds..."
echo ""

curl -N -H "Accept: text/event-stream" http://localhost:3000/sse 2>/dev/null &
CURL_PID=$!

sleep 5
kill $CURL_PID 2>/dev/null

echo ""
echo "SSE test complete"
