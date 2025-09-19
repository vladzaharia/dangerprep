#!/usr/bin/env node

// Simple test script to demonstrate Ctrl+C handling
import { SignalHandler } from './dist/utils/signal-handler.js';

console.log('🚀 Starting test application...');
console.log('💡 Press Ctrl+C to test graceful shutdown');

// Initialize signal handler
const signalHandler = SignalHandler.getInstance();
const cancellationToken = signalHandler.createCancellationToken();

// Register cleanup callback
cancellationToken.onCancel(() => {
  console.log('🧹 Performing cleanup...');
});

// Simulate long-running operation
async function longRunningOperation() {
  for (let i = 0; i < 100; i++) {
    try {
      // Check for cancellation
      cancellationToken.throwIfCancelled();
      
      console.log(`⏳ Processing step ${i + 1}/100...`);
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      if (error.message === 'Operation was cancelled') {
        console.log('🛑 Operation cancelled gracefully');
        return;
      }
      throw error;
    }
  }
  
  console.log('✅ Operation completed successfully');
}

// Start the operation
longRunningOperation().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
