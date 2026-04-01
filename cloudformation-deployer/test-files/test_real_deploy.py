#!/usr/bin/env python3

import requests
import json
import base64

# Decode credentials
access_key = base64.b64decode("").decode()
secret_key = base64.b64decode("").decode()

# Test configuration
BASE_URL = "http://127.0.0.1:3000"
TEST_CONFIG = {
    "region": "af-south-1",
    "accessKeyId": access_key,
    "secretAccessKey": secret_key,
    "accountId": "735721437522",
    "stackName": "test-role-stack-cloudforge",
    "templatePath": "test-role.yml"
}

def test_credentials():
    """Test AWS credentials"""
    payload = {
        "region": TEST_CONFIG["region"],
        "accessKeyId": TEST_CONFIG["accessKeyId"],
        "secretAccessKey": TEST_CONFIG["secretAccessKey"]
    }
    
    try:
        response = requests.post(f"{BASE_URL}/test-credentials", json=payload)
        if response.status_code == 200:
            data = response.json()
            print("✅ Credentials valid")
            print(f"   Account: {data['account']}")
            print(f"   User: {data['user']}")
            return True
        else:
            print(f"❌ Credential test failed: {response.json()}")
            return False
    except Exception as e:
        print(f"❌ Credential test error: {e}")
        return False

def test_deploy():
    """Test actual deployment"""
    payload = {
        "templatePath": TEST_CONFIG["templatePath"],
        "parameters": {},
        "stackName": TEST_CONFIG["stackName"],
        "region": TEST_CONFIG["region"],
        "accessKeyId": TEST_CONFIG["accessKeyId"],
        "secretAccessKey": TEST_CONFIG["secretAccessKey"]
    }
    
    try:
        print(f"🚀 Attempting to deploy stack: {TEST_CONFIG['stackName']}")
        response = requests.post(f"{BASE_URL}/deploy", json=payload)
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")
        
        if response.status_code == 200:
            print("✅ Deployment successful!")
            return True
        else:
            error_msg = response.json().get('error', 'Unknown error')
            if "InsufficientCapabilitiesException" in error_msg:
                print("❌ Still getting capabilities error!")
                print("This means the capabilities aren't being passed correctly")
            else:
                print(f"❌ Deployment failed: {error_msg}")
            return False
            
    except Exception as e:
        print(f"❌ Deploy error: {e}")
        return False

def main():
    print("🧪 Testing Real Deployment\n")
    
    # Test credentials first
    if not test_credentials():
        print("Cannot proceed without valid credentials")
        return 1
    
    print()
    # Test deployment
    if test_deploy():
        print("\n✅ Test completed successfully!")
        return 0
    else:
        print("\n❌ Test failed!")
        return 1

if __name__ == "__main__":
    main()