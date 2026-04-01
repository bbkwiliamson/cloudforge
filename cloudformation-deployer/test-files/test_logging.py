#!/usr/bin/env python3
"""
Test script to verify logging configuration works
"""
import logging
import sys
import time

# Configure logging exactly like server.py
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def test_logging():
    logger.info("Testing logging configuration...")
    logger.info("This should appear in CloudWatch logs immediately")
    logger.warning("This is a warning message")
    logger.error("This is an error message")
    
    # Test with different log levels
    for i in range(5):
        logger.info(f"Log message {i+1}")
        time.sleep(1)
    
    logger.info("Logging test completed successfully")

if __name__ == "__main__":
    test_logging()