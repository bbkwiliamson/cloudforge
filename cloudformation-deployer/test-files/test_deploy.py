#!/usr/bin/env python3

import requests
import json
import os
import sys

# Test configuration
BASE_URL = "http://127.0.0.1:3000"
TEST_TEMPLATE = "test-role.yml"
TEST_STACK_NAME = "test-iam-role-stack"

def test_health():
    """Test if the server is running"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            print("✅ Server is running")
            return True
        else:
            print(f"❌ Server health check failed: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Is it running on port 3000?")
        return False

def test_parse_template():
    """Test template parsing"""
    template_path = f"uploads/{TEST_TEMPLATE}"
    if not os.path.exists(template_path):
        print(f"❌ Template file not found: {template_path}")
        return False
    
    try:
        with open(template_path, 'rb') as f:
            files = {'template': f}
            response = requests.post(f"{BASE_URL}/parse-template", files=files)
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Template parsed successfully")
            print(f"   Parameters found: {list(data.get('parameters', {}).keys())}")
            return True
        else:
            print(f"❌ Template parsing failed: {response.json()}")
            return False
    except Exception as e:
        print(f"❌ Template parsing error: {e}")
        return False

def test_deploy_dry_run():
    """Test deployment with mock credentials to see the exact error"""
    payload = {
        "templatePath": TEST_TEMPLATE,
        "parameters": {},
        "stackName": TEST_STACK_NAME,
        "region": "us-east-1",
        "accessKeyId": "MOCK_ACCESS_KEY",
        "secretAccessKey": "MOCK_SECRET_KEY"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/deploy", json=payload)
        print(f"Deploy response status: {response.status_code}")
        print(f"Deploy response: {response.json()}")
        
        # We expect this to fail with auth error, not capabilities error
        if "InsufficientCapabilitiesException" in str(response.json()):
            print("❌ Still getting capabilities error - this shouldn't happen!")
            return False
        elif "credentials" in str(response.json()).lower() or "auth" in str(response.json()).lower():
            print("✅ Got expected auth error (not capabilities error)")
            return True
        else:
            print("⚠️  Unexpected response")
            return False
            
    except Exception as e:
        print(f"❌ Deploy test error: {e}")
        return False

def check_capabilities_in_code():
    """Verify capabilities are in the deploy function"""
    with open('server.py', 'r') as f:
        content = f.read()
    
    if "CAPABILITY_NAMED_IAM" in content and "create_stack" in content:
        print("✅ Capabilities found in deploy function")
        return True
    else:
        print("❌ Capabilities missing from deploy function")
        return False

def main():
    print("🧪 Testing CloudForge Deployment System\n")
    
    tests = [
        ("Server Health", test_health),
        ("Capabilities in Code", check_capabilities_in_code),
        ("Template Parsing", test_parse_template),
        ("Deploy Dry Run", test_deploy_dry_run)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🔍 Running: {test_name}")
        result = test_func()
        results.append((test_name, result))
    
    print("\n📊 Test Results:")
    print("-" * 40)
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    failed_tests = [name for name, result in results if not result]
    if failed_tests:
        print(f"\n❌ {len(failed_tests)} test(s) failed")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())