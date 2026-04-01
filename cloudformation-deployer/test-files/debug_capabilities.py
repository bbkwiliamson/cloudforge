#!/usr/bin/env python3

import json
import subprocess
import sys

def test_with_real_credentials():
    """Test with your actual credentials to see the exact error"""
    
    # Your credentials (base64 encoded)
    access_key_b64 = ""
    secret_key_b64 = ""
    
    # Test payload
    payload = {
        "templatePath": "test-role.yml",
        "parameters": {},
        "stackName": "test-capabilities-debug-stack",
        "region": "af-south-1",
        "accessKeyId": access_key_b64,
        "secretAccessKey": secret_key_b64
    }
    
    print("🧪 Testing with your actual credentials...")
    print(f"Stack name: {payload['stackName']}")
    print(f"Template: {payload['templatePath']}")
    print(f"Region: {payload['region']}")
    
    # First test credentials
    cred_payload = {
        "region": payload["region"],
        "accessKeyId": payload["accessKeyId"],
        "secretAccessKey": payload["secretAccessKey"]
    }
    
    print("\n1️⃣ Testing credentials...")
    curl_cmd = [
        'curl', '-s', '-X', 'POST',
        'http://127.0.0.1:3000/test-credentials',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps(cred_payload)
    ]
    
    try:
        result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
        cred_response = json.loads(result.stdout)
        
        if 'account' in cred_response:
            print(f"✅ Credentials valid - Account: {cred_response['account']}")
        else:
            print(f"❌ Credentials invalid: {cred_response}")
            return False
            
    except Exception as e:
        print(f"❌ Credential test failed: {e}")
        return False
    
    # Now test deployment
    print("\n2️⃣ Testing deployment...")
    curl_cmd = [
        'curl', '-s', '-X', 'POST',
        'http://127.0.0.1:3000/deploy',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps(payload)
    ]
    
    try:
        result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
        deploy_response = json.loads(result.stdout)
        
        print(f"Deploy response: {deploy_response}")
        
        error_msg = deploy_response.get('error', '')
        if 'InsufficientCapabilitiesException' in error_msg:
            print("❌ CONFIRMED: Getting capabilities error with valid credentials!")
            print("This means the server code is NOT passing capabilities correctly")
            
            # Check if it's the right capability
            if 'CAPABILITY_NAMED_IAM' in error_msg:
                print("The error specifically mentions CAPABILITY_NAMED_IAM")
            
            return False
        elif 'stackId' in deploy_response:
            print("✅ Deployment successful!")
            return True
        else:
            print(f"⚠️  Other error: {error_msg}")
            return False
            
    except Exception as e:
        print(f"❌ Deploy test failed: {e}")
        return False

def check_server_status():
    """Check if server is running and responding"""
    try:
        result = subprocess.run(['curl', '-s', 'http://127.0.0.1:3000/health'], 
                              capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            response = json.loads(result.stdout)
            print(f"✅ Server is running: {response}")
            return True
        else:
            print("❌ Server not responding")
            return False
    except Exception as e:
        print(f"❌ Server check failed: {e}")
        return False

def main():
    print("🔍 DEBUG: Capabilities Error Investigation")
    print("="*60)
    
    if not check_server_status():
        print("Server is not running. Please start it first.")
        return 1
    
    print()
    success = test_with_real_credentials()
    
    print("\n" + "="*60)
    if success:
        print("✅ RESULT: Capabilities are working correctly")
    else:
        print("❌ RESULT: Capabilities error confirmed - server code issue")
        print("\nPossible causes:")
        print("1. Server is running old code (needs restart)")
        print("2. Code changes weren't saved properly")
        print("3. Different server instance is running")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())